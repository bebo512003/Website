-- Session 10 — Submission Review Workflow
--
-- Extends the Submission Inbox into a full review and qualification workflow:
--   * Dedicated internal review notes table (form_submission_notes).
--   * Full audit event log table (form_submission_events) tracking actor, action,
--     old/new values, and exact timestamps.
--   * Reviewer assignment with validation (authorized internal team members only).
--   * Notification generation for the assigned reviewer.
--   * Status updates with optional review notes and audit history.
--   * Strict RLS preventing unauthorized access by clients, inactive users,
--     and employees without submission.view / submission.edit / submission.assign.
--   * Admin and authorized reviewers can seamlessly review, qualify, and reassign.

begin;

-- ── 1. Internal Review Notes Table ──────────────────────────────────────────
create table if not exists public.form_submission_notes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  note text not null check (length(btrim(note)) > 0 and length(note) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_form_submission_notes_submission
  on public.form_submission_notes(submission_id, created_at desc);

create index if not exists idx_form_submission_notes_author
  on public.form_submission_notes(author_id);

drop trigger if exists form_submission_notes_updated_at on public.form_submission_notes;
create trigger form_submission_notes_updated_at
  before update on public.form_submission_notes
  for each row execute function public.set_updated_at();

alter table public.form_submission_notes enable row level security;

-- Only active staff with submission.view can read internal notes.
drop policy if exists form_submission_notes_select on public.form_submission_notes;
create policy form_submission_notes_select on public.form_submission_notes
  for select to authenticated
  using (
    public.is_active()
    and not public.must_change_password_pending()
    and public.has_permission('submission.view')
  );

-- Only active staff with submission.edit can insert notes.
drop policy if exists form_submission_notes_insert on public.form_submission_notes;
create policy form_submission_notes_insert on public.form_submission_notes
  for insert to authenticated
  with check (
    public.is_active()
    and not public.must_change_password_pending()
    and public.has_permission('submission.edit')
    and author_id = auth.uid()
  );

-- Author or Admin can update notes.
drop policy if exists form_submission_notes_update on public.form_submission_notes;
create policy form_submission_notes_update on public.form_submission_notes
  for update to authenticated
  using (
    public.is_active()
    and not public.must_change_password_pending()
    and (
      public.has_permission('admin.manage')
      or (public.has_permission('submission.edit') and author_id = auth.uid())
    )
  )
  with check (
    public.is_active()
    and not public.must_change_password_pending()
    and (
      public.has_permission('admin.manage')
      or (public.has_permission('submission.edit') and author_id = auth.uid())
    )
  );

-- Author or Admin can delete notes.
drop policy if exists form_submission_notes_delete on public.form_submission_notes;
create policy form_submission_notes_delete on public.form_submission_notes
  for delete to authenticated
  using (
    public.is_active()
    and not public.must_change_password_pending()
    and (
      public.has_permission('admin.manage')
      or (public.has_permission('submission.edit') and author_id = auth.uid())
    )
  );

-- ── 2. Audit Trail / Events Table ───────────────────────────────────────────
create table if not exists public.form_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (
    event_type in (
      'created', 'status_changed',
      'reviewer_assigned', 'reviewer_unassigned', 'reviewer_reassigned',
      'note_added', 'note_deleted', 'archived', 'restored'
    )
  ),
  old_value text,
  new_value text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_form_submission_events_submission
  on public.form_submission_events(submission_id, created_at desc);

create index if not exists idx_form_submission_events_actor
  on public.form_submission_events(actor_id);

alter table public.form_submission_events enable row level security;

-- Only active staff with submission.view can read events.
drop policy if exists form_submission_events_select on public.form_submission_events;
create policy form_submission_events_select on public.form_submission_events
  for select to authenticated
  using (
    public.is_active()
    and not public.must_change_password_pending()
    and public.has_permission('submission.view')
  );

-- Insert allowed by authorized staff or security-definer RPCs.
drop policy if exists form_submission_events_insert on public.form_submission_events;
create policy form_submission_events_insert on public.form_submission_events
  for insert to authenticated
  with check (
    public.is_active()
    and not public.must_change_password_pending()
    and (
      public.has_permission('submission.edit')
      or public.has_permission('submission.assign')
      or public.has_permission('admin.manage')
    )
  );

-- No direct update or delete on audit events (tamper-evident log).
drop policy if exists form_submission_events_no_update on public.form_submission_events;
create policy form_submission_events_no_update on public.form_submission_events
  for update to authenticated using (false);

drop policy if exists form_submission_events_no_delete on public.form_submission_events;
create policy form_submission_events_no_delete on public.form_submission_events
  for delete to authenticated using (false);

-- ── 3. RPC: Add Review Note ──────────────────────────────────────────────────
create or replace function public.add_form_submission_note(
  p_submission_id uuid,
  p_note text
)
returns public.form_submission_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  note_rec public.form_submission_notes;
  clean_note text := btrim(coalesce(p_note, ''));
  sub_rec public.form_submissions;
  caller_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_permission('submission.edit') then
    raise exception 'Not authorized to add review notes';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active' then
    raise exception 'User is not active';
  end if;

  select * into sub_rec from public.form_submissions where id = p_submission_id;
  if sub_rec.id is null then
    raise exception 'Submission not found';
  end if;

  if length(clean_note) = 0 then
    raise exception 'Note cannot be empty';
  end if;
  if length(clean_note) > 10000 then
    raise exception 'Note exceeds maximum length of 10,000 characters';
  end if;

  insert into public.form_submission_notes (submission_id, author_id, note)
  values (p_submission_id, auth.uid(), clean_note)
  returning * into note_rec;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, note, metadata
  ) values (
    p_submission_id,
    auth.uid(),
    'note_added',
    case when length(clean_note) > 140 then substring(clean_note from 1 for 137) || '...' else clean_note end,
    jsonb_build_object('note_id', note_rec.id, 'author_name', coalesce(caller_profile.full_name, caller_profile.email))
  );

  update public.form_submissions
     set updated_at = now()
   where id = p_submission_id;

  return note_rec;
end;
$$;
revoke all on function public.add_form_submission_note(uuid, text) from public, anon;
grant execute on function public.add_form_submission_note(uuid, text) to authenticated;

-- ── 4. RPC: Delete Review Note ───────────────────────────────────────────────
create or replace function public.delete_form_submission_note(
  p_note_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  note_rec public.form_submission_notes;
  caller_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active' then
    raise exception 'User is not active';
  end if;

  select * into note_rec from public.form_submission_notes where id = p_note_id;
  if note_rec.id is null then
    raise exception 'Note not found';
  end if;

  if not (
    note_rec.author_id = auth.uid()
    or public.has_permission('admin.manage')
  ) then
    raise exception 'Not authorized to delete this review note';
  end if;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, note, metadata
  ) values (
    note_rec.submission_id,
    auth.uid(),
    'note_deleted',
    'Review note deleted',
    jsonb_build_object('deleted_note_id', p_note_id, 'author_id', note_rec.author_id)
  );

  delete from public.form_submission_notes where id = p_note_id;

  update public.form_submissions
     set updated_at = now()
   where id = note_rec.submission_id;

  return true;
end;
$$;
revoke all on function public.delete_form_submission_note(uuid) from public, anon;
grant execute on function public.delete_form_submission_note(uuid) to authenticated;

-- ── 5. Enhanced Status Update RPC with Audit & Optional Note ─────────────────
drop function if exists public.update_form_submission_status(uuid, text);
drop function if exists public.update_form_submission_status(uuid, text, text);

create or replace function public.update_form_submission_status(
  p_submission_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  sub_rec public.form_submissions;
  old_status text;
  caller_profile public.profiles;
  clean_note text := btrim(coalesce(p_note, ''));
  action_event_type text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_permission('submission.edit') then
    raise exception 'Not authorized to update submissions';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active' then
    raise exception 'User is not active';
  end if;

  select * into sub_rec from public.form_submissions where id = p_submission_id;
  if sub_rec.id is null then
    raise exception 'Submission not found';
  end if;

  if p_status not in (
    'new', 'reviewing', 'need_information',
    'qualified', 'rejected', 'approved', 'converted', 'archived'
  ) then
    raise exception 'Invalid submission status';
  end if;

  old_status := sub_rec.status;

  update public.form_submissions
     set status = p_status,
         updated_at = now()
   where id = p_submission_id;

  action_event_type := case
    when p_status = 'archived' then 'archived'
    when old_status = 'archived' then 'restored'
    else 'status_changed'
  end;

  if length(clean_note) > 0 then
    insert into public.form_submission_notes (submission_id, author_id, note)
    values (p_submission_id, auth.uid(), clean_note);
  end if;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, old_value, new_value, note, metadata
  ) values (
    p_submission_id,
    auth.uid(),
    action_event_type,
    old_status,
    p_status,
    case when length(clean_note) > 0 then clean_note else null end,
    jsonb_build_object(
      'previous_status', old_status,
      'new_status', p_status,
      'actor_name', coalesce(caller_profile.full_name, caller_profile.email)
    )
  );

  return true;
end;
$$;
revoke all on function public.update_form_submission_status(uuid, text, text) from public, anon;
grant execute on function public.update_form_submission_status(uuid, text, text) to authenticated;

-- ── 6. Enhanced Reviewer Assignment RPC with Validation & Notification ───────
drop function if exists public.assign_form_submission_reviewer(uuid, uuid);
drop function if exists public.assign_form_submission_reviewer(uuid, uuid, text);

create or replace function public.assign_form_submission_reviewer(
  p_submission_id uuid,
  p_reviewer_id uuid,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  sub_rec public.form_submissions;
  old_reviewer_id uuid;
  old_reviewer_name text;
  new_reviewer_name text;
  caller_profile public.profiles;
  target_reviewer public.profiles;
  form_rec public.form_templates;
  client_display text;
  actor_name text;
  clean_note text := btrim(coalesce(p_note, ''));
  action_event_type text;
  now_ts timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_permission('submission.assign') then
    raise exception 'Not authorized to assign submissions';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active' then
    raise exception 'User is not active';
  end if;

  select * into sub_rec from public.form_submissions where id = p_submission_id;
  if sub_rec.id is null then
    raise exception 'Submission not found';
  end if;

  old_reviewer_id := sub_rec.reviewer_id;
  if old_reviewer_id is not null then
    select coalesce(nullif(full_name, ''), email) into old_reviewer_name
    from public.profiles where id = old_reviewer_id;
  end if;

  actor_name := coalesce(nullif(caller_profile.full_name, ''), caller_profile.email, 'An administrator');

  if p_reviewer_id is not null then
    -- Validate authorized reviewer: active team member, not a client
    select * into target_reviewer from public.profiles where id = p_reviewer_id;
    if target_reviewer.id is null or target_reviewer.status <> 'active' or target_reviewer.role = 'client'::public.app_role then
      raise exception 'Selected reviewer is not an authorized team member';
    end if;

    new_reviewer_name := coalesce(nullif(target_reviewer.full_name, ''), target_reviewer.email);

    update public.form_submissions
       set reviewer_id = p_reviewer_id,
           reviewed_at = now_ts,
           updated_at = now_ts
     where id = p_submission_id;

    action_event_type := case
      when old_reviewer_id is null then 'reviewer_assigned'
      else 'reviewer_reassigned'
    end;

    if length(clean_note) > 0 then
      insert into public.form_submission_notes (submission_id, author_id, note)
      values (p_submission_id, auth.uid(), clean_note);
    end if;

    insert into public.form_submission_events (
      submission_id, actor_id, event_type, old_value, new_value, note, metadata
    ) values (
      p_submission_id,
      auth.uid(),
      action_event_type,
      old_reviewer_name,
      new_reviewer_name,
      case when length(clean_note) > 0 then clean_note else null end,
      jsonb_build_object(
        'reviewer_id', p_reviewer_id,
        'reviewer_name', new_reviewer_name,
        'previous_reviewer_id', old_reviewer_id,
        'actor_name', actor_name
      )
    );

    -- Notify the assigned reviewer (only when assigned to someone else)
    if p_reviewer_id <> auth.uid() then
      select * into form_rec from public.form_templates where id = sub_rec.form_id;

      client_display := coalesce(
        nullif(btrim(sub_rec.company_name), ''),
        nullif(btrim(sub_rec.respondent_name), ''),
        nullif(btrim(sub_rec.respondent_email), ''),
        'a client'
      );

      insert into public.notifications (
        recipient_id,
        actor_id,
        submission_id,
        type,
        title,
        message,
        action_url,
        metadata
      ) values (
        p_reviewer_id,
        auth.uid(),
        p_submission_id,
        'assignment',
        'You were assigned to review a submission',
        'You were assigned to review the submission from ' || client_display || ' for form “' || coalesce(form_rec.title, 'Form') || '” by ' || actor_name || '.',
        '/submissions?submission=' || p_submission_id::text,
        jsonb_build_object(
          'submission_id', p_submission_id,
          'form_id', sub_rec.form_id,
          'form_name', coalesce(form_rec.title, 'Form'),
          'client_name', client_display,
          'respondent_name', sub_rec.respondent_name,
          'respondent_email', sub_rec.respondent_email,
          'company_name', sub_rec.company_name,
          'assigned_by', actor_name,
          'assigned_at', now_ts
        )
      );
    end if;

  else
    -- Unassign reviewer
    update public.form_submissions
       set reviewer_id = null,
           reviewed_at = null,
           updated_at = now_ts
     where id = p_submission_id;

    if length(clean_note) > 0 then
      insert into public.form_submission_notes (submission_id, author_id, note)
      values (p_submission_id, auth.uid(), clean_note);
    end if;

    insert into public.form_submission_events (
      submission_id, actor_id, event_type, old_value, new_value, note, metadata
    ) values (
      p_submission_id,
      auth.uid(),
      'reviewer_unassigned',
      old_reviewer_name,
      null,
      case when length(clean_note) > 0 then clean_note else null end,
      jsonb_build_object(
        'previous_reviewer_id', old_reviewer_id,
        'previous_reviewer_name', old_reviewer_name,
        'actor_name', actor_name
      )
    );
  end if;

  return true;
end;
$$;
revoke all on function public.assign_form_submission_reviewer(uuid, uuid, text) from public, anon;
grant execute on function public.assign_form_submission_reviewer(uuid, uuid, text) to authenticated;

-- ── 7. Update submit_dynamic_form to record creation event ───────────────────
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
      'respondent_email', submission_rec.respondent_email
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
