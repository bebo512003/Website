-- Session 11 — Controlled Submission → Project Conversion
--
-- Adds one deliberate, atomic Admin workflow for turning a qualified/approved
-- submission into a configured project. The conversion keeps the immutable
-- answer rows in place, links both records, prevents duplicates (including
-- concurrent attempts), creates/selects the CRM client, and assigns the initial
-- owner, manager, and team in the same transaction.

begin;

-- ── 1. Project ownership, priority, and immutable submission provenance ─────
alter table public.projects
  add column if not exists priority text not null default 'medium',
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists manager_id uuid references public.profiles(id) on delete set null,
  add column if not exists source_submission_id uuid references public.form_submissions(id) on delete restrict;

alter table public.projects drop constraint if exists projects_priority_check;
alter table public.projects add constraint projects_priority_check
  check (priority in ('low', 'medium', 'high', 'urgent'));

create unique index if not exists projects_source_submission_unique
  on public.projects(source_submission_id)
  where source_submission_id is not null;
create index if not exists idx_projects_owner on public.projects(owner_id);
create index if not exists idx_projects_manager on public.projects(manager_id);

alter table public.form_submissions
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_form_submissions_converted_by
  on public.form_submissions(converted_by)
  where converted_by is not null;

comment on column public.projects.source_submission_id is
  'Immutable provenance link to the original form submission. Answers remain in form_submission_answers.';
comment on column public.form_submissions.converted_at is
  'Permanent conversion marker; retained even if the linked project is later deleted.';

-- Backfill projects made by the legacy, explicitly enabled submit-time automation.
update public.projects p
set source_submission_id = candidate.submission_id
from (
  select distinct on (fs.project_id) fs.project_id, fs.id as submission_id
  from public.form_submissions fs
  where fs.project_id is not null
  order by fs.project_id, fs.submitted_at asc
) candidate
where p.id = candidate.project_id
  and p.source_submission_id is null;

update public.form_submissions fs
set status = 'converted',
    converted_at = coalesce(fs.converted_at, fs.updated_at, fs.submitted_at),
    converted_by = coalesce(fs.converted_by, p.created_by),
    updated_at = now()
from public.projects p
where fs.project_id = p.id
  and (fs.status <> 'converted' or fs.converted_at is null);

-- Once populated, the source can never be swapped or cleared by a normal update.
create or replace function public.protect_project_submission_reference()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.source_submission_id is not null
     and new.source_submission_id is distinct from old.source_submission_id then
    raise exception 'A project submission reference is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_project_submission_reference on public.projects;
create trigger protect_project_submission_reference
before update of source_submission_id on public.projects
for each row execute function public.protect_project_submission_reference();

-- ── 2. Conversion audit event ───────────────────────────────────────────────
alter table public.form_submission_events
  drop constraint if exists form_submission_events_event_type_check;
alter table public.form_submission_events
  add constraint form_submission_events_event_type_check check (
    event_type in (
      'created', 'status_changed',
      'reviewer_assigned', 'reviewer_unassigned', 'reviewer_reassigned',
      'note_added', 'note_deleted', 'archived', 'restored',
      'converted_to_project'
    )
  );

-- ── 3. Only an Admin may explicitly enable submit-time project automation ───
-- Existing true settings are retained only when the form was created by an
-- Admin. Everything else returns to the safe/default manual conversion path.
update public.form_templates ft
set settings = case
  when exists (
    select 1 from public.profiles p
    where p.id = ft.created_by and p.role = 'admin'::public.app_role
  ) then jsonb_set(
    jsonb_set(coalesce(ft.settings, '{}'::jsonb), '{auto_project_configured_by}', to_jsonb(ft.created_by::text), true),
    '{auto_project_configured_at}', to_jsonb(coalesce(ft.updated_at, now())::text), true
  )
  else (coalesce(ft.settings, '{}'::jsonb) - 'auto_project_configured_by' - 'auto_project_configured_at')
       || '{"create_project_on_submit": false}'::jsonb
end
where coalesce(ft.settings ->> 'create_project_on_submit', 'false') = 'true';

create or replace function public.enforce_admin_auto_project_configuration()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  was_enabled boolean := case when tg_op = 'INSERT' then false else coalesce(old.settings ->> 'create_project_on_submit', 'false') = 'true' end;
  is_enabled boolean := coalesce(new.settings ->> 'create_project_on_submit', 'false') = 'true';
begin
  if is_enabled and not was_enabled then
    if auth.uid() is null or not public.has_permission('admin.manage') then
      raise exception 'Only an Admin can enable automatic project creation';
    end if;
    new.settings := jsonb_set(
      jsonb_set(coalesce(new.settings, '{}'::jsonb), '{auto_project_configured_by}', to_jsonb(auth.uid()::text), true),
      '{auto_project_configured_at}', to_jsonb(now()::text), true
    );
  elsif not is_enabled then
    new.settings := coalesce(new.settings, '{}'::jsonb)
      - 'auto_project_configured_by' - 'auto_project_configured_at';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_admin_auto_project_configuration on public.form_templates;
create trigger enforce_admin_auto_project_configuration
before insert or update of settings on public.form_templates
for each row execute function public.enforce_admin_auto_project_configuration();

-- The existing public submission RPC creates an automated project immediately
-- before inserting its submission. These triggers complete the two-way source
-- link and record that exceptional automated conversion after answers are saved.
create or replace function public.link_automated_project_to_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null then
    update public.projects
       set source_submission_id = new.id
     where id = new.project_id
       and source_submission_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists link_automated_project_to_submission on public.form_submissions;
create trigger link_automated_project_to_submission
after insert or update of project_id on public.form_submissions
for each row execute function public.link_automated_project_to_submission();

create or replace function public.finalize_automated_submission_conversion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sub_rec public.form_submissions;
  project_name text;
  configured_admin uuid;
begin
  if new.event_type <> 'created' then
    return new;
  end if;

  select * into sub_rec
  from public.form_submissions
  where id = new.submission_id and project_id is not null
  for update;

  if sub_rec.id is null or sub_rec.converted_at is not null then
    return new;
  end if;

  select p.name into project_name from public.projects p where p.id = sub_rec.project_id;
  select nullif(ft.settings ->> 'auto_project_configured_by', '')::uuid
    into configured_admin
  from public.form_templates ft where ft.id = sub_rec.form_id;

  update public.form_submissions
     set status = 'converted',
         converted_at = now(),
         converted_by = configured_admin,
         updated_at = now()
   where id = sub_rec.id;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, old_value, new_value, note, metadata
  ) values (
    sub_rec.id, configured_admin, 'converted_to_project', sub_rec.status, 'converted',
    'Project created by Admin-configured form automation',
    jsonb_build_object(
      'project_id', sub_rec.project_id,
      'project_name', project_name,
      'client_id', sub_rec.client_id,
      'automatic', true,
      'answers_preserved', true
    )
  );

  return new;
end;
$$;

drop trigger if exists finalize_automated_submission_conversion on public.form_submission_events;
create trigger finalize_automated_submission_conversion
after insert on public.form_submission_events
for each row when (new.event_type = 'created')
execute function public.finalize_automated_submission_conversion();

-- ── 4. Status changes cannot impersonate or undo a conversion ───────────────
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
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.has_permission('submission.edit') then
    raise exception 'Not authorized to update submissions';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active' then
    raise exception 'User is not active';
  end if;

  select * into sub_rec
  from public.form_submissions
  where id = p_submission_id
  for update;
  if sub_rec.id is null then raise exception 'Submission not found'; end if;

  if p_status = 'converted' then
    raise exception 'Use Convert to Project to set the Converted status';
  end if;
  if sub_rec.status = 'converted' or sub_rec.converted_at is not null then
    raise exception 'A converted submission cannot be moved to another status';
  end if;
  if p_status not in (
    'new', 'reviewing', 'need_information',
    'qualified', 'rejected', 'approved', 'archived'
  ) then
    raise exception 'Invalid submission status';
  end if;

  old_status := sub_rec.status;
  update public.form_submissions
     set status = p_status, updated_at = now()
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
    p_submission_id, auth.uid(), action_event_type, old_status, p_status,
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

-- ── 5. Atomic, Admin-only controlled conversion RPC ─────────────────────────
create or replace function public.convert_submission_to_project(
  p_submission_id uuid,
  p_client_id uuid,
  p_new_client jsonb,
  p_project_name text,
  p_description text,
  p_project_type text,
  p_priority text,
  p_status text,
  p_phase integer,
  p_phase_name text,
  p_start_date date,
  p_due_date date,
  p_budget numeric,
  p_currency text,
  p_owner_id uuid,
  p_manager_id uuid,
  p_team_member_ids uuid[]
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  sub_rec public.form_submissions;
  project_rec public.projects;
  client_rec public.clients;
  caller_profile public.profiles;
  resolved_client_id uuid;
  clean_project_name text := btrim(coalesce(p_project_name, ''));
  clean_project_type text := btrim(coalesce(p_project_type, ''));
  clean_currency text := upper(btrim(coalesce(p_currency, 'USD')));
  clean_client_name text;
  clean_client_email text;
  answer_count integer;
  attachment_count integer;
  requested_team_count integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.has_permission('admin.manage') then
    raise exception 'Only an Admin can convert a submission to a project';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active'
     or public.must_change_password_pending() then
    raise exception 'Admin account is not active';
  end if;

  -- Serializes concurrent conversion attempts for the same submission.
  select * into sub_rec
  from public.form_submissions
  where id = p_submission_id
  for update;

  if sub_rec.id is null then raise exception 'Submission not found'; end if;
  if sub_rec.status not in ('qualified', 'approved') then
    raise exception 'Submission must be Qualified or Approved before conversion';
  end if;
  if sub_rec.project_id is not null or sub_rec.converted_at is not null
     or exists (select 1 from public.projects p where p.source_submission_id = sub_rec.id) then
    raise exception 'This submission has already been converted';
  end if;

  if clean_project_name = '' or length(clean_project_name) > 200 then
    raise exception 'Project name is required and must be at most 200 characters';
  end if;
  if clean_project_type = '' or length(clean_project_type) > 100 then
    raise exception 'Project type is required and must be at most 100 characters';
  end if;
  if p_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'Invalid project priority';
  end if;
  if p_status not in ('active', 'review', 'completed', 'on-hold', 'cancelled') then
    raise exception 'Invalid initial project status';
  end if;
  if p_phase is null or p_phase not between 1 and 10 then
    raise exception 'Project phase must be between 1 and 10';
  end if;
  if p_start_date is not null and p_due_date is not null and p_due_date < p_start_date then
    raise exception 'Project deadline cannot be before its start date';
  end if;
  if p_budget is not null and p_budget < 0 then raise exception 'Budget cannot be negative'; end if;
  if clean_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a 3-letter code'; end if;

  -- Select an existing client OR create one inside this same transaction.
  if p_client_id is not null and p_new_client is not null then
    raise exception 'Select an existing client or create a new client, not both';
  elsif p_client_id is not null then
    select * into client_rec from public.clients where id = p_client_id;
    if client_rec.id is null then raise exception 'Selected client was not found'; end if;
    resolved_client_id := client_rec.id;
  elsif p_new_client is not null then
    clean_client_name := btrim(coalesce(p_new_client ->> 'name', ''));
    clean_client_email := lower(nullif(btrim(coalesce(p_new_client ->> 'email', '')), ''));
    if clean_client_name = '' or length(clean_client_name) > 200 then
      raise exception 'New client name is required and must be at most 200 characters';
    end if;
    if clean_client_email is not null and exists (
      select 1 from public.clients where lower(coalesce(email, '')) = clean_client_email
    ) then
      raise exception 'A client with this e-mail already exists; select that client instead';
    end if;
    if coalesce(p_new_client ->> 'type', 'smb') not in ('enterprise', 'smb', 'individual', 'potential') then
      raise exception 'Invalid client type';
    end if;

    insert into public.clients (
      name, type, status, contact_person, email, phone, notes, created_by
    ) values (
      clean_client_name,
      coalesce(p_new_client ->> 'type', 'smb'),
      'active',
      nullif(btrim(coalesce(p_new_client ->> 'contact_person', '')), ''),
      clean_client_email,
      nullif(btrim(coalesce(p_new_client ->> 'phone', '')), ''),
      'Created during controlled conversion of submission ' || sub_rec.id::text,
      auth.uid()
    ) returning * into client_rec;
    resolved_client_id := client_rec.id;
  else
    raise exception 'A client must be selected or created';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_owner_id and p.status = 'active' and p.role <> 'client'::public.app_role
  ) then
    raise exception 'Select an active internal project owner';
  end if;
  if p_manager_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_manager_id and p.status = 'active' and p.role <> 'client'::public.app_role
  ) then
    raise exception 'Selected project manager is not an active internal team member';
  end if;

  select count(distinct member_id), count(*)
    into requested_team_count, answer_count
  from unnest(coalesce(p_team_member_ids, '{}'::uuid[])) member_id;
  -- The second count above is only temporary; use it to detect duplicate/null input.
  if requested_team_count <> coalesce(array_length(p_team_member_ids, 1), 0)
     or exists (select 1 from unnest(coalesce(p_team_member_ids, '{}'::uuid[])) x where x is null) then
    raise exception 'Team member selections must be unique and non-empty';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_team_member_ids, '{}'::uuid[])) member_id
    left join public.profiles p on p.id = member_id
    where p.id is null or p.status <> 'active' or p.role = 'client'::public.app_role
  ) then
    raise exception 'Every selected team member must be an active internal user';
  end if;

  insert into public.projects (
    name, description, client_id, type, priority, status, phase, phase_name,
    progress, budget, currency, start_date, due_date, completed_date,
    owner_id, manager_id, source_submission_id, created_by
  ) values (
    clean_project_name,
    nullif(btrim(coalesce(p_description, '')), ''),
    resolved_client_id,
    clean_project_type,
    p_priority,
    p_status,
    p_phase,
    nullif(btrim(coalesce(p_phase_name, '')), ''),
    case when p_status = 'completed' then 100 else 0 end,
    p_budget,
    clean_currency,
    p_start_date,
    p_due_date,
    case when p_status = 'completed' then coalesce(p_due_date, current_date) else null end,
    p_owner_id,
    p_manager_id,
    sub_rec.id,
    auth.uid()
  ) returning * into project_rec;

  insert into public.project_members (project_id, user_id, assigned_by)
  select project_rec.id, member_id, auth.uid()
  from (
    select distinct member_id
    from unnest(
      coalesce(p_team_member_ids, '{}'::uuid[])
      || array[p_owner_id]
      || case when p_manager_id is null then '{}'::uuid[] else array[p_manager_id] end
    ) member_id
    where member_id is not null
  ) members;

  update public.form_submissions
     set status = 'converted',
         client_id = resolved_client_id,
         project_id = project_rec.id,
         converted_at = now(),
         converted_by = auth.uid(),
         updated_at = now()
   where id = sub_rec.id;

  select count(*) into answer_count
  from public.form_submission_answers where submission_id = sub_rec.id;
  select count(*) into attachment_count
  from public.form_submission_attachments where submission_id = sub_rec.id;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, old_value, new_value, note, metadata
  ) values (
    sub_rec.id,
    auth.uid(),
    'converted_to_project',
    sub_rec.status,
    'converted',
    'Submission deliberately converted to project “' || project_rec.name || '”',
    jsonb_build_object(
      'project_id', project_rec.id,
      'project_name', project_rec.name,
      'client_id', resolved_client_id,
      'owner_id', p_owner_id,
      'manager_id', p_manager_id,
      'team_member_ids', coalesce(p_team_member_ids, '{}'::uuid[]),
      'priority', project_rec.priority,
      'project_type', project_rec.type,
      'answer_count', answer_count,
      'attachment_count', attachment_count,
      'answers_preserved', true,
      'automatic', false
    )
  );

  return project_rec;
end;
$$;

revoke all on function public.convert_submission_to_project(
  uuid, uuid, jsonb, text, text, text, text, text, integer, text,
  date, date, numeric, text, uuid, uuid, uuid[]
) from public, anon;
grant execute on function public.convert_submission_to_project(
  uuid, uuid, jsonb, text, text, text, text, text, integer, text,
  date, date, numeric, text, uuid, uuid, uuid[]
) to authenticated;

commit;
