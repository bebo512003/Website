-- Session 12 — Project Ownership, Status & Lifecycle
--
-- Turns the project record into a first-class deliverable with an explicit,
-- ordered lifecycle (Draft → Planned → Active → Waiting for Client → In Review
-- → Ready for Delivery → Delivered → Completed, plus On Hold and Cancelled),
-- a database-enforced status state machine, a project health indicator, and a
-- guarantee that the owner and manager are always project members — so
-- ownership is both visible everywhere and actually grants access.

begin;

-- ── 1. Expand the lifecycle ─────────────────────────────────────────────────
-- Migrate the legacy 'review' stage before widening the CHECK constraint so
-- existing rows keep working under the new vocabulary.
update public.projects set status = 'in-review' where status = 'review';

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check check (
  status in (
    'draft',
    'planned',
    'active',
    'waiting-for-client',
    'in-review',
    'ready-for-delivery',
    'delivered',
    'completed',
    'on-hold',
    'cancelled'
  )
);

comment on column public.projects.status is
  'Project lifecycle stage. Transitions are enforced by enforce_project_status_transition.';
comment on column public.projects.due_date is
  'Project deadline — the date the deliverable is due.';

-- ── 2. Project health ───────────────────────────────────────────────────────
alter table public.projects add column if not exists health text;
update public.projects set health = 'on-track' where health is null;
alter table public.projects alter column health set default 'on-track';
alter table public.projects alter column health set not null;
alter table public.projects drop constraint if exists projects_health_check;
alter table public.projects add constraint projects_health_check check (
  health in ('on-track', 'at-risk', 'off-track', 'blocked')
);
comment on column public.projects.health is
  'Operational health independent of lifecycle stage: on-track, at-risk, off-track, or blocked.';

create index if not exists idx_projects_health on public.projects(health);

-- ── 3. Valid status transitions (the lifecycle state machine) ───────────────
create or replace function public.valid_project_status_transition(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select (p_from = p_to)
    or (p_from, p_to) in (
      -- Draft can be planned, or dropped entirely.
      ('draft', 'planned'),
      ('draft', 'cancelled'),
      -- Planned work can start, pause, or be dropped.
      ('planned', 'active'),
      ('planned', 'on-hold'),
      ('planned', 'cancelled'),
      -- Active work either blocks on the client, goes to review, pauses, or is dropped.
      ('active', 'waiting-for-client'),
      ('active', 'in-review'),
      ('active', 'on-hold'),
      ('active', 'cancelled'),
      -- Client responses bring work back to active or on to review.
      ('waiting-for-client', 'active'),
      ('waiting-for-client', 'in-review'),
      ('waiting-for-client', 'on-hold'),
      ('waiting-for-client', 'cancelled'),
      -- Review approves into delivery, or bounces back for rework / more input.
      ('in-review', 'active'),
      ('in-review', 'waiting-for-client'),
      ('in-review', 'ready-for-delivery'),
      ('in-review', 'on-hold'),
      ('in-review', 'cancelled'),
      -- Ready for delivery hands off, bounces back, pauses, or is dropped.
      ('ready-for-delivery', 'delivered'),
      ('ready-for-delivery', 'in-review'),
      ('ready-for-delivery', 'on-hold'),
      ('ready-for-delivery', 'cancelled'),
      -- Delivered work is completed, or sent back for revisions.
      ('delivered', 'completed'),
      ('delivered', 'in-review'),
      ('delivered', 'on-hold'),
      -- On Hold resumes into any in-flight stage, or is cancelled.
      ('on-hold', 'draft'),
      ('on-hold', 'planned'),
      ('on-hold', 'active'),
      ('on-hold', 'waiting-for-client'),
      ('on-hold', 'in-review'),
      ('on-hold', 'ready-for-delivery'),
      ('on-hold', 'delivered'),
      ('on-hold', 'cancelled'),
      -- Cancelled work can be reopened as a fresh draft. Completed is terminal.
      ('cancelled', 'draft')
    );
$$;

create or replace function public.enforce_project_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if not public.valid_project_status_transition(old.status, new.status) then
      raise exception 'Invalid status transition from % to %.', old.status, new.status;
    end if;
    if new.status = 'completed' then
      new.completed_date := coalesce(new.completed_date, current_date);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_project_status_transition on public.projects;
create trigger enforce_project_status_transition
before update of status on public.projects
for each row execute function public.enforce_project_status_transition();

-- ── 4. Owner & manager are always project members ───────────────────────────
-- Ownership must grant access: whenever an owner or manager is set, they are
-- added to project_members. This runs as SECURITY DEFINER so the guarantee
-- holds regardless of which role performs the update.
create or replace function public.sync_project_lead_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is not null then
    insert into public.project_members (project_id, user_id, assigned_by)
    values (new.id, new.owner_id, coalesce(auth.uid(), new.created_by))
    on conflict (project_id, user_id) do nothing;
  end if;
  if new.manager_id is not null and new.manager_id is distinct from new.owner_id then
    insert into public.project_members (project_id, user_id, assigned_by)
    values (new.id, new.manager_id, coalesce(auth.uid(), new.created_by))
    on conflict (project_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_project_lead_membership on public.projects;
create trigger sync_project_lead_membership
after insert or update of owner_id, manager_id on public.projects
for each row execute function public.sync_project_lead_membership();

-- Backfill: any existing project whose owner or manager is missing from the
-- member list gets them added (idempotent).
insert into public.project_members (project_id, user_id, assigned_by)
select p.id, p.owner_id, p.created_by
from public.projects p
where p.owner_id is not null
on conflict (project_id, user_id) do nothing;

insert into public.project_members (project_id, user_id, assigned_by)
select p.id, p.manager_id, p.created_by
from public.projects p
where p.manager_id is not null
  and p.manager_id is distinct from p.owner_id
on conflict (project_id, user_id) do nothing;

-- ── 5. Project update notifications also watch health ───────────────────────
create or replace function public.notify_project_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.status, old.progress, old.phase, old.due_date, old.health) is distinct from
     (new.status, new.progress, new.phase, new.due_date, new.health) then
    insert into public.notifications (recipient_id, actor_id, project_id, type, title, message, action_url)
    select pm.user_id, auth.uid(), new.id, 'project_update', 'Project updated',
           new.name || ' has new progress, status, or health information.',
           '/projects/' || new.id::text
    from public.project_members pm
    where pm.project_id = new.id and pm.user_id is distinct from auth.uid();
  end if;
  return new;
end;
$$;

-- ── 6. Submission → project conversion accepts the full lifecycle ───────────
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
  if p_status not in (
    'draft', 'planned', 'active', 'waiting-for-client', 'in-review',
    'ready-for-delivery', 'delivered', 'completed', 'on-hold', 'cancelled'
  ) then
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
  ) members
  on conflict (project_id, user_id) do nothing;

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
