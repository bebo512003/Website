-- Public form submit reliability.
--
-- Previous attempts let the public form degrade when Anonymous Sign-ins are
-- unavailable, but three remaining bugs still rolled the save back:
--
--   1. form_rate_limits.session_id is NOT NULL. A no-session (anon-key)
--      submit inserts auth.uid() = NULL and the whole RPC fails.
--   2. form-files INSERT required owner_id = auth.uid()::text. Supabase
--      Storage often leaves owner_id unset at WITH CHECK time, so picking
--      an image never actually uploads.
--   3. submit_dynamic_form only attached files whose folder matched
--      auth.uid(). Files landed in the shared anon/ folder were dropped.
--
-- This migration makes a no-session text submit persist, lets a caller
-- upload into their own folder without an owner_id match, and attaches
-- anon/ files when there is no session. IP rate limiting in the API
-- route remains the abuse control for session-less callers.

begin;

-- ── 1. Rate-limit table: session is optional ────────────────────────────────
alter table public.form_rate_limits
  alter column session_id drop not null;

comment on column public.form_rate_limits.session_id is
  'Caller auth.uid() when a session exists. NULL for session-less (anon-key) submits; those are rate-limited by IP in the API route.';

-- ── 2. form-files insert: folder isolation only (no owner_id race) ──────────
drop policy if exists form_files_insert on storage.objects;
create policy form_files_insert on storage.objects for insert to authenticated, anon
  with check (
    bucket_id = 'form-files'
    and position('..' in name) = 0
    and (
      (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
      or (auth.uid() is null and (storage.foldername(name))[1] = 'anon')
    )
  );

-- ── 3. submit_dynamic_form: null-uid + anon/ attachments ────────────────────
create or replace function public.submit_dynamic_form(
  p_form_id uuid,
  p_answers jsonb
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
  linked_project_id uuid;
  file_item jsonb;
  file_path text;
  file_name text;
  file_size bigint;
  file_ext text;
  rating_max_val integer;
  recent_count integer;
  respondent_email_val text;
  fp text;
  dup_count integer;
  answer_key text;
  answer_val text;
  caller uuid := auth.uid();
begin
  select * into form_rec from public.form_templates where id = p_form_id;
  if not found then
    raise exception 'Form not found';
  end if;
  if form_rec.status <> 'published' then
    raise exception 'This form is not accepting submissions';
  end if;

  if length(p_answers::text) > 102400 then
    raise exception 'Your submission is too large. Please shorten your answers.';
  end if;

  for answer_key, answer_val in select * from jsonb_each_text(p_answers)
  loop
    if length(answer_val) > 10000 then
      raise exception 'One of your answers exceeds the maximum allowed length.';
    end if;
  end loop;

  -- Session-scoped rate limits only apply when we actually have a session.
  -- Session-less callers are limited by IP in POST /api/forms/submit.
  if caller is not null then
    select count(*) into recent_count
    from public.form_rate_limits
    where session_id = caller
      and form_id = p_form_id
      and submitted_at > now() - interval '1 minute';

    if recent_count >= 5 then
      raise exception 'You are submitting too frequently. Please wait a moment and try again.';
    end if;

    if exists (
      select 1 from public.form_rate_limits
      where session_id = caller
        and form_id = p_form_id
        and submitted_at > now() - interval '3 seconds'
    ) then
      raise exception 'Please wait a few seconds before submitting again.';
    end if;
  end if;

  for q in
    select * from public.form_questions where form_id = p_form_id order by position, created_at
  loop
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    is_empty := val is null
      or val = 'null'::jsonb
      or (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') = '')
      or (jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 0);

    if q.required and is_empty then
      missing := coalesce(missing, '{}') || q.label;
      continue;
    end if;

    if not is_empty then
      if q.question_type in ('single_choice', 'dropdown') then
        if jsonb_typeof(val) <> 'string'
           or not exists (select 1 from jsonb_array_elements_text(q.options) o where o = val #>> '{}') then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'multiple_choice' then
        if jsonb_typeof(val) <> 'array'
           or exists (select 1 from jsonb_array_elements_text(val) v where not exists (
                select 1 from jsonb_array_elements_text(q.options) o where o = v)) then
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
        if q.map_to = 'name' then submission_rec.respondent_name := txt; end if;
        if q.map_to = 'email' then respondent_email_val := lower(txt); end if;
        if q.map_to = 'phone' then submission_rec.respondent_phone := txt; end if;
        if q.map_to = 'company' then submission_rec.company_name := txt; end if;
      end if;
    end if;
  end loop;

  submission_rec.respondent_email := respondent_email_val;

  if missing is not null then
    raise exception 'Required questions are missing: %', array_to_string(missing, ', ');
  end if;

  if respondent_email_val is not null then
    fp := encode(digest(respondent_email_val || p_form_id::text, 'sha256'), 'hex');
    select count(*) into dup_count
    from public.form_submission_fingerprints
    where form_id = p_form_id
      and fingerprint = fp
      and submitted_at > now() - interval '5 minutes';

    if dup_count > 0 then
      raise exception 'You have already submitted a response recently. Please wait a few minutes before submitting again.';
    end if;

    insert into public.form_submission_fingerprints (form_id, fingerprint)
    values (p_form_id, fp);
  end if;

  if caller is not null then
    insert into public.form_rate_limits (session_id, form_id)
    values (caller, p_form_id);
  end if;

  if respondent_email_val is not null then
    select id into linked_client_id
    from public.clients
    where lower(coalesce(email, '')) = respondent_email_val
    order by created_at asc
    limit 1;

    if linked_client_id is null then
      insert into public.clients (name, type, status, contact_person, email, phone, notes, created_by)
      values (
        coalesce(nullif(submission_rec.company_name, ''), nullif(submission_rec.respondent_name, ''), respondent_email_val),
        'potential',
        'potential',
        nullif(submission_rec.respondent_name, ''),
        respondent_email_val,
        nullif(submission_rec.respondent_phone, ''),
        'Created automatically from form "' || form_rec.title || '"',
        caller
      )
      returning id into linked_client_id;
    end if;
  end if;

  if coalesce(form_rec.settings ->> 'create_project_on_submit', 'false') = 'true' and linked_client_id is not null then
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      coalesce(nullif(submission_rec.company_name, '') || ' — ', '') || form_rec.title,
      'Created automatically from a submission to form "' || form_rec.title || '"',
      linked_client_id,
      form_rec.title,
      'active', 1, 'Discovery', 0, caller
    )
    returning id into linked_project_id;
  end if;

  insert into public.form_submissions
    (form_id, form_version, status, respondent_name, respondent_email, respondent_phone, company_name, client_id, project_id, created_by)
  values (
    p_form_id, form_rec.version, 'new',
    submission_rec.respondent_name, submission_rec.respondent_email,
    submission_rec.respondent_phone, submission_rec.company_name,
    linked_client_id, linked_project_id, caller
  )
  returning * into submission_rec;

  insert into public.form_submission_answers (submission_id, question_id, question_snapshot, value)
  select submission_rec.id, fq.id, to_jsonb(fq), p_answers -> fq.id::text
  from public.form_questions fq
  where fq.form_id = p_form_id
    and public.is_form_question_visible(fq, p_answers)
  order by fq.position, fq.created_at;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, new_value, note, metadata
  ) values (
    submission_rec.id,
    (select id from public.profiles where id = caller),
    'created',
    'new',
    'Submission received',
    jsonb_build_object(
      'form_version', form_rec.version,
      'form_title', form_rec.title,
      'respondent_email', submission_rec.respondent_email,
      'reference_number', submission_rec.reference_number
    )
  );

  for q in select * from public.form_questions where form_id = p_form_id and question_type = 'file_upload' loop
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    if jsonb_typeof(val) = 'array' then
      for file_item in select * from jsonb_array_elements(val) loop
        file_path := file_item ->> 'storage_path';
        if file_path is not null
           and position('..' in file_path) = 0
           and (
             (caller is not null and split_part(file_path, '/', 1) = caller::text)
             or (caller is null and split_part(file_path, '/', 1) = 'anon')
             or public.has_permission('submission.edit')
           ) then
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
        end if;
      end loop;
    end if;
  end loop;

  return submission_rec;
end;
$$;

revoke all on function public.submit_dynamic_form(uuid, jsonb) from public, anon;
grant execute on function public.submit_dynamic_form(uuid, jsonb) to authenticated, anon;

commit;
