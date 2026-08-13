-- Public form save that cannot be rolled back by notification/email triggers.
--
-- Live submits were dying on AFTER INSERT side-effects (notify_form_submission,
-- enqueue_submission_emails) or on pgcrypto defaults (gen_random_bytes /
-- digest in the extensions schema). The Next.js persist path writes the row
-- directly, but those triggers still fire and abort the transaction.
--
-- This migration:
--   1. Makes the reference/token defaults pgcrypto-free
--   2. Makes the two AFTER INSERT triggers swallow their own errors
--   3. Adds save_public_form_submission — SECURITY DEFINER, granted to
--      anon + authenticated — which inserts the row with
--      session_replication_role = replica so leftover throwing triggers
--      cannot undo the respondent's save.

begin;

-- ── 1. Reference / token defaults that do not need pgcrypto ─────────────────
create or replace function public.generate_submission_reference()
returns text
language plpgsql
set search_path = public
as $$
declare
  prefix text;
  rand_part text;
  candidate text;
  loop_count integer := 0;
begin
  prefix := 'REQ-' || to_char(now() at time zone 'utc', 'YYMM') || '-';
  loop
    loop_count := loop_count + 1;
    rand_part := upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text || loop_count::text), 1, 6));
    candidate := prefix || rand_part;
    if not exists (select 1 from public.form_submissions where reference_number = candidate) then
      return candidate;
    end if;
    if loop_count > 20 then
      return prefix || upper(substr(md5(gen_random_uuid()::text), 1, 8));
    end if;
  end loop;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'form_submissions'
      and column_name = 'tracking_token'
  ) then
    execute $sql$
      alter table public.form_submissions
        alter column tracking_token set default
          replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
    $sql$;
  end if;
end
$$;

-- ── 2. Side-effect triggers must never abort the save ───────────────────────
create or replace function public.notify_form_submission()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  form_rec public.form_templates;
  client_display_name text;
  notif_title text;
  notif_message text;
  action text;
begin
  begin
    select * into form_rec from public.form_templates where id = new.form_id;

    client_display_name := coalesce(
      nullif(trim(new.respondent_name), ''),
      nullif(trim(new.company_name), ''),
      nullif(trim(new.respondent_email), ''),
      'Anonymous client'
    );

    notif_title := 'New ' || coalesce(form_rec.title, 'Form') || ' submission';
    notif_message := 'New submission #' || substring(new.id::text, 1, 8)
      || ' received from ' || client_display_name
      || ' for ' || coalesce(form_rec.title, 'Form') || '.';
    action := '/admin/forms/' || new.form_id::text || '?tab=submissions&submission=' || new.id::text;

    perform public.notify_staff_with_permission(
      'submission.view',
      'submission.created',
      'form_submission',
      notif_title,
      notif_message,
      action,
      'submission.created:' || new.id::text,
      (select id from public.profiles where id = auth.uid()),
      new.project_id,
      new.id,
      null,
      jsonb_build_object(
        'submission_id', new.id,
        'form_id', new.form_id,
        'form_name', coalesce(form_rec.title, 'Form'),
        'client_name', client_display_name,
        'respondent_name', new.respondent_name,
        'respondent_email', new.respondent_email,
        'respondent_phone', new.respondent_phone,
        'company_name', new.company_name,
        'project_id', new.project_id,
        'submitted_at', new.submitted_at,
        'reference_number', new.reference_number
      )
    );
  exception
    when others then
      raise warning 'notify_form_submission failed: %', sqlerrm;
  end;
  return new;
end;
$$;

create or replace function public.enqueue_submission_emails()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  form_rec public.form_templates;
  client_display text;
  staff_display text;
  rec record;
begin
  begin
    select * into form_rec from public.form_templates where id = new.form_id;

    client_display := coalesce(
      nullif(btrim(new.respondent_name), ''),
      nullif(btrim(new.company_name), ''),
      nullif(btrim(new.respondent_email), ''),
      'A client'
    );
    staff_display := coalesce(
      nullif(btrim(new.respondent_name), ''),
      nullif(btrim(new.company_name), ''),
      'A client'
    );

    if nullif(btrim(coalesce(new.respondent_email, '')), '') is not null then
      perform public.enqueue_email(
        'submission-received',
        new.respondent_email,
        null,
        jsonb_build_object(
          'reference_number', new.reference_number,
          'form_name', coalesce(form_rec.title, 'Form'),
          'respondent_name', coalesce(nullif(btrim(new.respondent_name), ''), client_display),
          'submitted_at', new.submitted_at,
          'tracking_path', '/track/' || new.reference_number
        ),
        'submission.received:' || new.id::text
      );
    end if;

    for rec in
      select p.id, p.email
      from public.profiles p
      where public.email_staff_recipient_ok(p.id)
        and public.user_has_permission(p.id, 'submission.view')
    loop
        perform public.enqueue_email(
          'new-submission',
          rec.email,
          rec.id,
          jsonb_build_object(
            'reference_number', new.reference_number,
            'form_name', coalesce(form_rec.title, 'Form'),
            'client_name', staff_display,
            'company_name', new.company_name,
            'submission_id', new.id,
            'submitted_at', new.submitted_at,
            'inbox_path', '/submissions?submission=' || new.id::text
          ),
          'submission.created:' || new.id::text || ':' || rec.id::text
        );
    end loop;
  exception
    when others then
      raise warning 'enqueue_submission_emails failed: %', sqlerrm;
  end;
  return new;
end;
$$;

-- ── 3. Dedicated public save RPC ────────────────────────────────────────────
create or replace function public.save_public_form_submission(
  p_form_id uuid,
  p_answers jsonb,
  p_reference_number text default null,
  p_tracking_token text default null,
  p_fingerprint text default null
)
returns public.form_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  form_rec public.form_templates;
  q public.form_questions;
  val jsonb;
  txt text;
  is_empty boolean;
  missing text[];
  submission_rec public.form_submissions;
  linked_client_id uuid;
  file_item jsonb;
  file_path text;
  file_name text;
  file_size bigint;
  file_ext text;
  rating_max_val integer;
  respondent_email_val text;
  respondent_name_val text;
  respondent_phone_val text;
  company_name_val text;
  caller uuid := auth.uid();
  use_status text := 'new';
  use_ref text;
  use_token text;
  has_ref boolean;
  has_track boolean;
begin
  select * into form_rec from public.form_templates where id = p_form_id;
  if not found then
    raise exception 'Form not found';
  end if;
  if form_rec.status <> 'published' then
    raise exception 'This form is not accepting submissions';
  end if;

  if length(coalesce(p_answers, '{}'::jsonb)::text) > 102400 then
    raise exception 'Your submission is too large. Please shorten your answers.';
  end if;

  for q in
    select * from public.form_questions where form_id = p_form_id order by position, created_at
  loop
    if not public.is_form_question_visible(q, coalesce(p_answers, '{}'::jsonb)) then
      continue;
    end if;
    val := coalesce(p_answers, '{}'::jsonb) -> q.id::text;
    is_empty := val is null
      or val = 'null'::jsonb
      or (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') = '')
      or (jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 0);

    if q.required and is_empty then
      missing := coalesce(missing, '{}') || q.label;
      continue;
    end if;
    if is_empty then
      continue;
    end if;

    if q.question_type in ('single_choice', 'dropdown') then
      if jsonb_typeof(val) <> 'string'
         or not exists (select 1 from jsonb_array_elements_text(q.options) o where o = val #>> '{}') then
        raise exception 'Invalid option for "%"', q.label;
      end if;
    elsif q.question_type = 'multiple_choice' then
      if jsonb_typeof(val) <> 'array'
         or exists (
           select 1 from jsonb_array_elements_text(val) v
           where not exists (select 1 from jsonb_array_elements_text(q.options) o where o = v)
         ) then
        raise exception 'Invalid option for "%"', q.label;
      end if;
    elsif q.question_type = 'yes_no' then
      if jsonb_typeof(val) <> 'string' or (val #>> '{}') not in ('yes', 'no') then
        raise exception 'Invalid answer for "%"', q.label;
      end if;
    elsif q.question_type = 'number' then
      if jsonb_typeof(val) <> 'number' and (jsonb_typeof(val) <> 'string' or (val #>> '{}') !~ '^-?\d+(\.\d+)?$') then
        raise exception 'Invalid number for "%"', q.label;
      end if;
    elsif q.question_type = 'rating' then
      rating_max_val := greatest(1, least(10, coalesce(nullif(q.config ->> 'rating_max', '')::integer, 5)));
      if (val #>> '{}') !~ '^\d+$'
         or (val #>> '{}')::integer < 1
         or (val #>> '{}')::integer > rating_max_val then
        raise exception 'Invalid rating for "%"', q.label;
      end if;
    elsif q.question_type = 'file_upload' then
      if jsonb_typeof(val) <> 'array' then
        raise exception 'Invalid file answer for "%"', q.label;
      end if;
      if jsonb_array_length(val) > 10 then
        raise exception 'Too many files uploaded for "%". Maximum is 10.', q.label;
      end if;
      for file_item in select * from jsonb_array_elements(val) loop
        file_name := coalesce(file_item ->> 'name', '');
        file_size := coalesce(nullif(file_item ->> 'size', '')::bigint, 0);
        if file_size > 20971520 then
          raise exception 'Uploaded file "%" exceeds maximum allowed size of 20 MB.', file_name;
        end if;
        file_ext := lower(substring(file_name from '\.([a-zA-Z0-9]+)$'));
        if file_ext in ('exe', 'bat', 'cmd', 'sh', 'php', 'phtml', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'js', 'vbs', 'msi', 'jar', 'scr', 'hta', 'ps1') then
          raise exception 'Uploaded file "%" has an unsafe file extension and is rejected.', file_name;
        end if;
      end loop;
    end if;

    txt := case when jsonb_typeof(val) = 'string' then btrim(val #>> '{}') else null end;
    if nullif(txt, '') is not null then
      if q.map_to = 'name' then respondent_name_val := txt; end if;
      if q.map_to = 'email' then respondent_email_val := lower(txt); end if;
      if q.map_to = 'phone' then respondent_phone_val := txt; end if;
      if q.map_to = 'company' then company_name_val := txt; end if;
    end if;
  end loop;

  if missing is not null then
    raise exception 'Required questions are missing: %', array_to_string(missing, ', ');
  end if;

  if respondent_email_val is not null then
    select id into linked_client_id
    from public.clients
    where lower(coalesce(email, '')) = respondent_email_val
    order by created_at asc
    limit 1;

    if linked_client_id is null then
      begin
        insert into public.clients (name, type, status, contact_person, email, phone, notes)
        values (
          coalesce(nullif(company_name_val, ''), nullif(respondent_name_val, ''), respondent_email_val),
          'potential',
          'potential',
          nullif(respondent_name_val, ''),
          respondent_email_val,
          nullif(respondent_phone_val, ''),
          'Created automatically from form "' || form_rec.title || '"'
        )
        returning id into linked_client_id;
      exception
        when others then
          linked_client_id := null;
      end;
    end if;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'form_submissions' and column_name = 'reference_number'
  ) into has_ref;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'form_submissions' and column_name = 'tracking_token'
  ) into has_track;

  use_ref := nullif(btrim(coalesce(p_reference_number, '')), '');
  if use_ref is null and has_ref then
    use_ref := public.generate_submission_reference();
  end if;
  use_token := nullif(btrim(coalesce(p_tracking_token, '')), '');
  if use_token is null and has_track then
    use_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  end if;

  if exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public'
      and constraint_name = 'form_submissions_status_check'
      and check_clause ilike '%submitted%'
      and check_clause not ilike '%''new''%'
  ) then
    use_status := 'submitted';
  end if;

  begin
    perform set_config('session_replication_role', 'replica', true);
  exception
    when others then
      null;
  end;

  begin
    if has_ref and has_track then
      insert into public.form_submissions (
        form_id, form_version, status,
        respondent_name, respondent_email, respondent_phone, company_name,
        client_id, reference_number, tracking_token
      ) values (
        p_form_id, form_rec.version, use_status,
        respondent_name_val, respondent_email_val, respondent_phone_val, company_name_val,
        linked_client_id, use_ref, use_token
      )
      returning * into submission_rec;
    else
      insert into public.form_submissions (
        form_id, form_version, status,
        respondent_name, respondent_email, respondent_phone, company_name,
        client_id
      ) values (
        p_form_id, form_rec.version, use_status,
        respondent_name_val, respondent_email_val, respondent_phone_val, company_name_val,
        linked_client_id
      )
      returning * into submission_rec;
    end if;
  exception
    when check_violation then
      if use_status = 'new' then
        use_status := 'submitted';
      else
        use_status := 'new';
      end if;
      if has_ref and has_track then
        insert into public.form_submissions (
          form_id, form_version, status,
          respondent_name, respondent_email, respondent_phone, company_name,
          client_id, reference_number, tracking_token
        ) values (
          p_form_id, form_rec.version, use_status,
          respondent_name_val, respondent_email_val, respondent_phone_val, company_name_val,
          linked_client_id, use_ref, use_token
        )
        returning * into submission_rec;
      else
        insert into public.form_submissions (
          form_id, form_version, status,
          respondent_name, respondent_email, respondent_phone, company_name,
          client_id
        ) values (
          p_form_id, form_rec.version, use_status,
          respondent_name_val, respondent_email_val, respondent_phone_val, company_name_val,
          linked_client_id
        )
        returning * into submission_rec;
      end if;
  end;

  begin
    perform set_config('session_replication_role', 'origin', true);
  exception
    when others then
      null;
  end;

  begin
    insert into public.form_submission_answers (submission_id, question_id, question_snapshot, value)
    select submission_rec.id, fq.id, to_jsonb(fq), coalesce(p_answers, '{}'::jsonb) -> fq.id::text
    from public.form_questions fq
    where fq.form_id = p_form_id
      and public.is_form_question_visible(fq, coalesce(p_answers, '{}'::jsonb))
    order by fq.position, fq.created_at;
  exception
    when others then
      raise warning 'save_public_form_submission answers failed: %', sqlerrm;
  end;

  begin
    insert into public.form_submission_events (
      submission_id, actor_id, event_type, new_value, note, metadata
    ) values (
      submission_rec.id,
      null,
      'created',
      submission_rec.status,
      'Submission received',
      jsonb_build_object(
        'form_version', form_rec.version,
        'form_title', form_rec.title,
        'respondent_email', submission_rec.respondent_email,
        'reference_number', submission_rec.reference_number
      )
    );
  exception
    when others then
      raise warning 'save_public_form_submission event failed: %', sqlerrm;
  end;

  if p_fingerprint is not null then
    begin
      insert into public.form_submission_fingerprints (form_id, fingerprint)
      values (p_form_id, p_fingerprint);
    exception
      when others then
        null;
    end;
  end if;

  for q in select * from public.form_questions where form_id = p_form_id and question_type = 'file_upload' loop
    if to_regprocedure('public.is_form_question_visible(public.form_questions, jsonb)') is not null
       and not public.is_form_question_visible(q, coalesce(p_answers, '{}'::jsonb)) then
      continue;
    end if;
    val := coalesce(p_answers, '{}'::jsonb) -> q.id::text;
    if jsonb_typeof(val) = 'array' then
      for file_item in select * from jsonb_array_elements(val) loop
        file_path := file_item ->> 'storage_path';
        if file_path is not null
           and position('..' in file_path) = 0
           and (
             (caller is not null and split_part(file_path, '/', 1) = caller::text)
             or split_part(file_path, '/', 1) = 'anon'
           ) then
          begin
            insert into public.form_submission_attachments
              (submission_id, question_id, name, size, mime_type, storage_path, uploaded_by)
            values (
              submission_rec.id, q.id,
              coalesce(nullif(file_item ->> 'name', ''), 'file'),
              coalesce(nullif(file_item ->> 'size', '')::bigint, 0),
              nullif(file_item ->> 'mime_type', ''),
              file_path,
              caller
            )
            on conflict (storage_path) do nothing;
          exception
            when others then
              null;
          end;
        end if;
      end loop;
    end if;
  end loop;

  return submission_rec;
end;
$$;

comment on function public.save_public_form_submission(uuid, jsonb, text, text, text) is
  'Public form persist that cannot be rolled back by notification/email AFTER INSERT triggers.';

revoke all on function public.save_public_form_submission(uuid, jsonb, text, text, text) from public;
grant execute on function public.save_public_form_submission(uuid, jsonb, text, text, text) to anon, authenticated;

commit;
