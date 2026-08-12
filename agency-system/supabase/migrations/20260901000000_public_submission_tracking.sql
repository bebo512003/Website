-- Session 16 — Public Submission Confirmation & Tracking
--
-- Provides a professional confirmation experience and a secure read-only tracking
-- mechanism for clients who submit a dynamic form.
--
-- Key principles:
--   * Unguessable, human-friendly request reference number (e.g. REQ-2608-ABC123)
--   * High-entropy tracking token for direct URLs
--   * Clients do NOT need an account to track their submission
--   * Public tracking RPC exposes ONLY minimal, non-sensitive projection
--   * Zero leakage of internal notes, reviewer identity, or audit logs

begin;

-- ── 1. Reference generator function ──────────────────────────────────────────
create or replace function public.generate_submission_reference()
returns text
language plpgsql
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
    -- Generate 6 uppercase alphanumeric characters
    rand_part := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
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

-- ── 2. Add reference number & tracking token to form_submissions ─────────────
alter table public.form_submissions
  add column if not exists reference_number text,
  add column if not exists tracking_token text;

comment on column public.form_submissions.reference_number is
  'Human-friendly unique reference code (e.g. REQ-2608-ABC123) shown to the client upon submission.';
comment on column public.form_submissions.tracking_token is
  'Cryptographically safe random token for read-only submission status tracking URLs.';

-- Backfill existing rows
update public.form_submissions
set reference_number = 'REQ-' || to_char(coalesce(submitted_at, created_at) at time zone 'utc', 'YYMM') || '-' || upper(substr(md5(id::text || coalesce(submitted_at, created_at)::text), 1, 6))
where reference_number is null;

update public.form_submissions
set tracking_token = encode(digest(id::text || coalesce(submitted_at, created_at)::text || gen_random_uuid()::text, 'sha256'), 'hex')
where tracking_token is null;

-- Set defaults and non-null constraints
alter table public.form_submissions
  alter column reference_number set default public.generate_submission_reference(),
  alter column reference_number set not null,
  alter column tracking_token set default encode(gen_random_bytes(24), 'hex'),
  alter column tracking_token set not null;

alter table public.form_submissions drop constraint if exists form_submissions_reference_number_unique;
alter table public.form_submissions add constraint form_submissions_reference_number_unique unique (reference_number);

alter table public.form_submissions drop constraint if exists form_submissions_tracking_token_unique;
alter table public.form_submissions add constraint form_submissions_tracking_token_unique unique (tracking_token);

create index if not exists idx_form_submissions_ref_upper on public.form_submissions (upper(reference_number));
create index if not exists idx_form_submissions_tracking_token on public.form_submissions (tracking_token);

-- ── 3. Public tracking RPC (minimal, non-sensitive projection) ────────────────
create or replace function public.get_public_submission_tracking(p_tracking_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_key text;
  sub_rec record;
  stage_idx integer;
  status_label text;
  status_desc text;
begin
  clean_key := btrim(coalesce(p_tracking_key, ''));
  if clean_key = '' then
    return null;
  end if;

  select
    s.id,
    s.reference_number,
    s.tracking_token,
    s.form_id,
    ft.title as form_title,
    ft.description as form_description,
    s.status,
    s.respondent_name,
    s.company_name,
    s.submitted_at,
    s.updated_at,
    (s.project_id is not null) as has_project
  into sub_rec
  from public.form_submissions s
  left join public.form_templates ft on ft.id = s.form_id
  where upper(s.reference_number) = upper(clean_key)
     or s.tracking_token = clean_key
  limit 1;

  if sub_rec.id is null then
    return null;
  end if;

  -- Map internal workflow status to safe client-facing stage & descriptions
  case sub_rec.status
    when 'new' then
      stage_idx := 1;
      status_label := 'Received';
      status_desc := 'Your submission has been securely received and queued for initial team review.';
    when 'reviewing' then
      stage_idx := 2;
      status_label := 'Under Review';
      status_desc := 'Our creative and technical specialists are actively evaluating your request requirements.';
    when 'need_information' then
      stage_idx := 2;
      status_label := 'Information Needed';
      status_desc := 'Our team needs a few clarifications. Please check your email for questions from our team.';
    when 'qualified' then
      stage_idx := 3;
      status_label := 'Qualified';
      status_desc := 'Your request has been qualified and approved for scoping and kickoff planning.';
    when 'approved' then
      stage_idx := 3;
      status_label := 'Approved';
      status_desc := 'Your request is approved. Team assignments and project setup are underway.';
    when 'converted' then
      stage_idx := 4;
      status_label := 'In Progress';
      status_desc := 'Your request has transitioned to an active project in our production pipeline.';
    when 'rejected' then
      stage_idx := 0;
      status_label := 'Declined';
      status_desc := 'We are currently unable to take on this project. Thank you for considering us.';
    when 'archived' then
      stage_idx := 0;
      status_label := 'Archived';
      status_desc := 'This request has been archived or closed.';
    else
      stage_idx := 1;
      status_label := 'Received';
      status_desc := 'Your request is in our system and will be processed shortly.';
  end case;

  return jsonb_build_object(
    'id', sub_rec.id,
    'reference_number', sub_rec.reference_number,
    'tracking_token', sub_rec.tracking_token,
    'form_id', sub_rec.form_id,
    'form_title', coalesce(sub_rec.form_title, 'Service Request'),
    'form_description', sub_rec.form_description,
    'status', sub_rec.status,
    'client_status_label', status_label,
    'client_status_description', status_desc,
    'stage_index', stage_idx,
    'submitted_at', sub_rec.submitted_at,
    'updated_at', sub_rec.updated_at,
    'respondent_name', sub_rec.respondent_name,
    'company_name', sub_rec.company_name,
    'has_project', sub_rec.has_project,
    'expected_response_time', '1–2 business days (24–48 hours)',
    'contact_email', 'support@agencyos.studio',
    'contact_phone', '+1 (555) 019-2834',
    'support_hours', 'Monday – Friday, 9:00 AM – 6:00 PM EST'
  );
end;
$$;

revoke all on function public.get_public_submission_tracking(text) from public;
grant execute on function public.get_public_submission_tracking(text) to anon, authenticated;

-- ── 4. Update submit_dynamic_form to store creation reference in event ───────
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
  -- Rate limiting
  recent_count integer;
  -- Duplicate detection
  respondent_email_val text;
  fp text;
  dup_count integer;
  -- Payload validation
  answer_key text;
  answer_val text;
begin
  -- ── Form existence and status ──────────────────────────────────────────
  select * into form_rec from public.form_templates where id = p_form_id;
  if not found then
    raise exception 'Form not found';
  end if;
  if form_rec.status <> 'published' then
    raise exception 'This form is not accepting submissions';
  end if;

  -- ── Payload size guard ─────────────────────────────────────────────────
  if length(p_answers::text) > 102400 then
    raise exception 'Your submission is too large. Please shorten your answers.';
  end if;

  for answer_key, answer_val in select * from jsonb_each_text(p_answers)
  loop
    if length(answer_val) > 10000 then
      raise exception 'One of your answers exceeds the maximum allowed length.';
    end if;
  end loop;

  -- ── Rate limiting: max 5 submissions per minute per session+form ───────
  select count(*) into recent_count
  from public.form_rate_limits
  where session_id = auth.uid()
    and form_id = p_form_id
    and submitted_at > now() - interval '1 minute';

  if recent_count >= 5 then
    raise exception 'You are submitting too frequently. Please wait a moment and try again.';
  end if;

  -- ── Per-session cooldown: minimum 3 seconds between submissions ────────
  if exists (
    select 1 from public.form_rate_limits
    where session_id = auth.uid()
      and form_id = p_form_id
      and submitted_at > now() - interval '3 seconds'
  ) then
    raise exception 'Please wait a few seconds before submitting again.';
  end if;

  -- ── Validate answers ───────────────────────────────────────────────────
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

  -- ── Duplicate submission detection ─────────────────────────────────────
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

  -- ── Record rate-limit entry ────────────────────────────────────────────
  insert into public.form_rate_limits (session_id, form_id)
  values (auth.uid(), p_form_id);

  -- ── Match or create CRM client ─────────────────────────────────────────
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
        auth.uid()
      )
      returning id into linked_client_id;
    end if;
  end if;

  -- ── Optional: open a project ───────────────────────────────────────────
  if coalesce(form_rec.settings ->> 'create_project_on_submit', 'false') = 'true' and linked_client_id is not null then
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      coalesce(nullif(submission_rec.company_name, '') || ' — ', '') || form_rec.title,
      'Created automatically from a submission to form "' || form_rec.title || '"',
      linked_client_id,
      form_rec.title,
      'active', 1, 'Discovery', 0, auth.uid()
    )
    returning id into linked_project_id;
  end if;

  -- ── Store submission ───────────────────────────────────────────────────
  insert into public.form_submissions
    (form_id, form_version, status, respondent_name, respondent_email, respondent_phone, company_name, client_id, project_id, created_by)
  values (
    p_form_id, form_rec.version, 'new',
    submission_rec.respondent_name, submission_rec.respondent_email,
    submission_rec.respondent_phone, submission_rec.company_name,
    linked_client_id, linked_project_id, auth.uid()
  )
  returning * into submission_rec;

  -- Freeze each answer together with the question it answered
  insert into public.form_submission_answers (submission_id, question_id, question_snapshot, value)
  select submission_rec.id, fq.id, to_jsonb(fq), p_answers -> fq.id::text
  from public.form_questions fq
  where fq.form_id = p_form_id
    and public.is_form_question_visible(fq, p_answers)
  order by fq.position, fq.created_at;

  -- Record submission creation event in audit trail
  insert into public.form_submission_events (
    submission_id, actor_id, event_type, new_value, note, metadata
  ) values (
    submission_rec.id,
    (select id from public.profiles where id = auth.uid()),
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

  -- Attach uploaded files
  for q in select * from public.form_questions where form_id = p_form_id and question_type = 'file_upload' loop
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    if jsonb_typeof(val) = 'array' then
      for file_item in select * from jsonb_array_elements(val) loop
        file_path := file_item ->> 'storage_path';
        if file_path is not null and (
          (auth.uid() is not null and split_part(file_path, '/', 1) = auth.uid()::text)
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
            auth.uid()
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
