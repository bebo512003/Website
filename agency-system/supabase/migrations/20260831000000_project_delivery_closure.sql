-- Session 15 — Project Delivery & Closure Workflow
--
-- Completes the operational lifecycle after Active / In Review:
--   Ready for Delivery → Delivered → Completed → Archive
--
-- What this adds (all INTERNAL staff data):
--   * A versioned delivery package (`project_deliveries`) with final delivery files
--   * A delivery state machine (preparing / ready / delivered / revision / approved)
--   * An INTERNAL client-approval placeholder — staff-recorded only
--   * Database-enforced completion guards (no accidental Complete)
--   * Archive / unarchive after Completed or Cancelled
--
-- Client-facing approval is deliberately NOT implemented here. Future portal
-- approval must live in a separate table (e.g. `client_approvals`) and must
-- never write to `project_deliveries`. Clients have no SELECT/INSERT/UPDATE
-- on these tables.

begin;

-- ── 1. Project archive flag (not a lifecycle status) ────────────────────────
alter table public.projects
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

comment on column public.projects.archived_at is
  'When set, the project is archived (hidden from the default workspace). Archive is independent of status and is only allowed after Completed or Cancelled.';
comment on column public.projects.archived_by is
  'Staff member who archived the project.';

create index if not exists idx_projects_archived
  on public.projects(archived_at)
  where archived_at is not null;

-- ── 2. Internal delivery package ────────────────────────────────────────────
create table if not exists public.project_deliveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version >= 1),
  status text not null default 'preparing' check (status in (
    'preparing',
    'ready',
    'delivered',
    'revision_requested',
    'approved',
    'superseded'
  )),
  notes text,
  delivered_at timestamptz,
  delivered_by uuid references public.profiles(id) on delete set null,
  -- INTERNAL placeholder. This is a staff record of what the client said —
  -- not a client-submitted action. Do not reuse this table for a future
  -- client portal; add a separate client-owned table instead.
  approval_state text not null default 'not_requested' check (approval_state in (
    'not_requested',
    'awaiting_client',
    'approved_internally',
    'revision_required'
  )),
  approval_recorded_by uuid references public.profiles(id) on delete set null,
  approval_recorded_at timestamptz,
  approval_note text,
  revision_note text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, version)
);

comment on table public.project_deliveries is
  'INTERNAL staff delivery packages. Versioned so a revision creates a new package. Never writable by client accounts. Future client-facing approval must not live here.';
comment on column public.project_deliveries.approval_state is
  'Staff-recorded placeholder for client approval. Not a client portal action.';
comment on column public.project_deliveries.status is
  'Package state: preparing → ready → delivered → (approved | revision_requested). superseded is reserved for abandoned drafts.';

create index if not exists idx_project_deliveries_project
  on public.project_deliveries(project_id, version desc);
create index if not exists idx_project_deliveries_status
  on public.project_deliveries(project_id, status);

drop trigger if exists set_project_deliveries_updated_at on public.project_deliveries;
create trigger set_project_deliveries_updated_at
  before update on public.project_deliveries
  for each row execute function public.set_updated_at();

-- ── 3. Final delivery files (working files stay on `files`) ─────────────────
create table if not exists public.project_delivery_files (
  delivery_id uuid not null references public.project_deliveries(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null default auth.uid(),
  added_at timestamptz not null default now(),
  primary key (delivery_id, file_id)
);

comment on table public.project_delivery_files is
  'The final delivery set for one internal delivery package. Distinct from working project files.';

create index if not exists idx_project_delivery_files_file
  on public.project_delivery_files(file_id);

-- ── 4. RLS — staff read only; writes go through SECURITY DEFINER RPCs ───────
alter table public.project_deliveries enable row level security;
alter table public.project_delivery_files enable row level security;

drop policy if exists project_deliveries_select_staff on public.project_deliveries;
create policy project_deliveries_select_staff on public.project_deliveries
  for select to authenticated
  using (
    public.is_active()
    and public.is_staff()
    and public.can_access_project(project_id)
  );

drop policy if exists project_delivery_files_select_staff on public.project_delivery_files;
create policy project_delivery_files_select_staff on public.project_delivery_files
  for select to authenticated
  using (
    public.is_active()
    and public.is_staff()
    and exists (
      select 1 from public.project_deliveries d
      where d.id = project_delivery_files.delivery_id
        and public.can_access_project(d.project_id)
    )
  );

grant select on public.project_deliveries to authenticated;
grant select on public.project_delivery_files to authenticated;
revoke all on public.project_deliveries from anon;
revoke all on public.project_delivery_files from anon;

-- ── 5. Activity event types for delivery / archive ──────────────────────────
alter table public.project_activity drop constraint if exists project_activity_event_type_check;
alter table public.project_activity add constraint project_activity_event_type_check check (
  event_type in (
    'created',
    'submission_converted',
    'owner_changed',
    'manager_changed',
    'member_added',
    'member_removed',
    'status_changed',
    'deadline_changed',
    'file_uploaded',
    'file_deleted',
    'delivery_prepared',
    'delivery_ready',
    'delivery_sent',
    'delivery_file_added',
    'delivery_file_removed',
    'revision_requested',
    'approval_recorded',
    'archived',
    'unarchived'
  )
);

-- Record archive / unarchive alongside the existing project-level events.
create or replace function public.record_project_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.created_by, new.owner_id);
  v_old_owner text;
  v_new_owner text;
  v_old_manager text;
  v_new_manager text;
begin
  if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
    v_actor := null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
    values (
      new.id,
      v_actor,
      'created',
      new.name,
      jsonb_build_object(
        'client_id', new.client_id,
        'project_type', new.type,
        'owner_id', new.owner_id,
        'manager_id', new.manager_id,
        'status', new.status
      )
    );

    if new.source_submission_id is not null then
      insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
      values (
        new.id,
        v_actor,
        'submission_converted',
        new.name,
        jsonb_build_object('source_submission_id', new.source_submission_id)
      );
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value)
    values (new.id, v_actor, 'status_changed', old.status, new.status);
  end if;

  if new.due_date is distinct from old.due_date then
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value)
    values (new.id, v_actor, 'deadline_changed', old.due_date::text, new.due_date::text);
  end if;

  if new.owner_id is distinct from old.owner_id then
    select coalesce(nullif(trim(full_name), ''), email) into v_old_owner from public.profiles where id = old.owner_id;
    select coalesce(nullif(trim(full_name), ''), email) into v_new_owner from public.profiles where id = new.owner_id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (
      new.id, v_actor, 'owner_changed', v_old_owner, v_new_owner,
      jsonb_build_object('old_owner_id', old.owner_id, 'new_owner_id', new.owner_id)
    );
  end if;

  if new.manager_id is distinct from old.manager_id then
    select coalesce(nullif(trim(full_name), ''), email) into v_old_manager from public.profiles where id = old.manager_id;
    select coalesce(nullif(trim(full_name), ''), email) into v_new_manager from public.profiles where id = new.manager_id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (
      new.id, v_actor, 'manager_changed', v_old_manager, v_new_manager,
      jsonb_build_object('old_manager_id', old.manager_id, 'new_manager_id', new.manager_id)
    );
  end if;

  if new.archived_at is distinct from old.archived_at then
    if new.archived_at is not null and old.archived_at is null then
      insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
      values (new.id, v_actor, 'archived', new.status, jsonb_build_object('archived_by', new.archived_by));
    elsif new.archived_at is null and old.archived_at is not null then
      insert into public.project_activity (project_id, actor_id, event_type, old_value, metadata)
      values (new.id, v_actor, 'unarchived', old.status, jsonb_build_object('previously_archived_by', old.archived_by));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists record_project_activity on public.projects;
create trigger record_project_activity
after insert or update of status, due_date, owner_id, manager_id, archived_at on public.projects
for each row execute function public.record_project_activity();

-- ── 6. Delivery helpers ─────────────────────────────────────────────────────
create or replace function public.current_project_delivery(p_project_id uuid)
returns public.project_deliveries
language sql
stable
security definer
set search_path = public
as $$
  select d.*
  from public.project_deliveries d
  where d.project_id = p_project_id
    and d.status <> 'superseded'
  order by d.version desc
  limit 1;
$$;

comment on function public.current_project_delivery(uuid) is
  'Latest non-superseded internal delivery package for a project.';

create or replace function public.project_delivery_file_count(p_project_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.project_delivery_files f
  join public.project_deliveries d on d.id = f.delivery_id
  where d.project_id = p_project_id
    and d.status <> 'superseded'
    and d.id = (select id from public.current_project_delivery(p_project_id));
$$;

create or replace function public.project_completion_blockers(p_project_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  file_count integer;
  blockers text[] := '{}';
begin
  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then
    return array['Project not found'];
  end if;
  if proj.archived_at is not null then
    blockers := blockers || 'The project is archived';
  end if;
  if proj.status is distinct from 'delivered' and proj.status is distinct from 'completed' then
    blockers := blockers || 'The project must be in Delivered before it can be completed';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null then
    blockers := blockers || 'Prepare a delivery package and attach at least one final delivery file';
    return blockers;
  end if;

  select count(*)::integer into file_count
  from public.project_delivery_files where delivery_id = pkg.id;

  if file_count < 1 then
    blockers := blockers || 'Attach at least one final delivery file';
  end if;
  if pkg.status not in ('delivered', 'approved') then
    blockers := blockers || 'Mark the delivery package as delivered';
  end if;
  if pkg.approval_state is distinct from 'approved_internally' then
    blockers := blockers || 'Record the internal client-approval placeholder';
  end if;
  return blockers;
end;
$$;

comment on function public.project_completion_blockers(uuid) is
  'Human-readable reasons a project cannot be completed. Empty array means the delivery conditions are met.';

create or replace function public.project_can_complete(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(cardinality(public.project_completion_blockers(p_project_id)), 0) = 0;
$$;

create or replace function public.project_delivery_readiness(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  file_count integer := 0;
  blockers text[];
begin
  if auth.uid() is null or not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to this project.';
  end if;

  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then raise exception 'Project not found'; end if;
  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is not null then
    select count(*)::integer into file_count
    from public.project_delivery_files where delivery_id = pkg.id;
  end if;
  blockers := public.project_completion_blockers(p_project_id);

  return jsonb_build_object(
    'project_status', proj.status,
    'archived', proj.archived_at is not null,
    'has_package', pkg.id is not null,
    'delivery_id', pkg.id,
    'delivery_version', pkg.version,
    'delivery_status', pkg.status,
    'approval_state', pkg.approval_state,
    'file_count', file_count,
    'can_complete', coalesce(cardinality(blockers), 0) = 0 and proj.status = 'delivered',
    'can_archive', proj.archived_at is null and proj.status in ('completed', 'cancelled'),
    'can_unarchive', proj.archived_at is not null,
    'blockers', to_jsonb(coalesce(blockers, '{}'))
  );
end;
$$;

-- ── 7. Package / file integrity ─────────────────────────────────────────────
create or replace function public.enforce_delivery_file_same_project()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  pkg public.project_deliveries;
  file_project uuid;
begin
  select * into pkg from public.project_deliveries where id = new.delivery_id;
  if pkg.id is null then
    raise exception 'Delivery package not found.';
  end if;
  if pkg.status <> 'preparing' then
    raise exception 'Final delivery files can only be added while the package is being prepared. Request a revision to open a new package.';
  end if;
  select project_id into file_project from public.files where id = new.file_id;
  if file_project is null or file_project is distinct from pkg.project_id then
    raise exception 'A delivery file must belong to the same project as the delivery package.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_delivery_file_same_project on public.project_delivery_files;
create trigger enforce_delivery_file_same_project
before insert on public.project_delivery_files
for each row execute function public.enforce_delivery_file_same_project();

create or replace function public.enforce_delivery_file_unlocked()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  pkg_status text;
begin
  select status into pkg_status from public.project_deliveries where id = old.delivery_id;
  if pkg_status is not null and pkg_status <> 'preparing' then
    raise exception 'Final delivery files are locked on this package. Request a revision before changing the set.';
  end if;
  return old;
end;
$$;

drop trigger if exists enforce_delivery_file_unlocked on public.project_delivery_files;
create trigger enforce_delivery_file_unlocked
before delete on public.project_delivery_files
for each row execute function public.enforce_delivery_file_unlocked();

create or replace function public.guard_locked_delivery_file_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.project_delivery_files df
    join public.project_deliveries d on d.id = df.delivery_id
    where df.file_id = old.id
      and d.status in ('ready', 'delivered', 'approved')
  ) then
    raise exception 'This file is locked as a final delivery file. Request a revision before deleting it.';
  end if;
  return old;
end;
$$;

drop trigger if exists guard_locked_delivery_file_delete on public.files;
create trigger guard_locked_delivery_file_delete
before delete on public.files
for each row execute function public.guard_locked_delivery_file_delete();

-- ── 8. Status transition + completion / archive guards ──────────────────────
create or replace function public.enforce_project_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  blockers text[];
  file_count integer;
begin
  if tg_op = 'INSERT' then
    if new.status in ('ready-for-delivery', 'delivered', 'completed') then
      raise exception 'New projects cannot start at %. Attach final delivery files and move through the delivery workflow.', new.status;
    end if;
    if new.archived_at is not null then
      raise exception 'New projects cannot be created already archived.';
    end if;
    return new;
  end if;

  if old.archived_at is not null and new.status is distinct from old.status then
    raise exception 'Archived projects cannot change status. Unarchive the project first.';
  end if;

  if new.status is distinct from old.status then
    if not public.valid_project_status_transition(old.status, new.status) then
      raise exception 'Invalid status transition from % to %.', old.status, new.status;
    end if;

    if new.status in ('ready-for-delivery', 'delivered') then
      select public.project_delivery_file_count(new.id) into file_count;
      if coalesce(file_count, 0) < 1 then
        raise exception 'Cannot move to % without at least one final delivery file.', new.status;
      end if;
    end if;

    if new.status = 'completed' then
      blockers := public.project_completion_blockers(new.id);
      -- The helper treats "must be delivered" as a blocker when status is not
      -- yet completed; while we are transitioning FROM delivered the other
      -- blockers are what matter.
      blockers := array(
        select b from unnest(coalesce(blockers, '{}')) b
        where b <> 'The project must be in Delivered before it can be completed'
      );
      if old.status is distinct from 'delivered' then
        blockers := blockers || 'The project must be in Delivered before it can be completed';
      end if;
      if coalesce(cardinality(blockers), 0) > 0 then
        raise exception 'Cannot complete this project: %', array_to_string(blockers, '; ');
      end if;
      new.completed_date := coalesce(new.completed_date, current_date);
      new.progress := 100;
    end if;
  end if;

  if new.archived_at is not null and old.archived_at is null then
    if new.status not in ('completed', 'cancelled') then
      raise exception 'Only Completed or Cancelled projects can be archived.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_project_status_transition on public.projects;
create trigger enforce_project_status_transition
before insert or update of status, archived_at, completed_date, progress on public.projects
for each row execute function public.enforce_project_status_transition();

-- Keep the delivery package in sync when staff move status from the project UI.
create or replace function public.sync_delivery_on_project_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pkg public.project_deliveries;
  next_version integer;
  actor uuid := auth.uid();
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select * into pkg from public.current_project_delivery(new.id);

  if new.status = 'ready-for-delivery' and pkg.id is not null and pkg.status = 'preparing' then
    update public.project_deliveries set status = 'ready' where id = pkg.id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (new.id, actor, 'delivery_ready', 'preparing', 'ready', jsonb_build_object('delivery_id', pkg.id, 'version', pkg.version));
  end if;

  if new.status = 'delivered' and pkg.id is not null and pkg.status in ('preparing', 'ready') then
    update public.project_deliveries
       set status = 'delivered',
           delivered_at = coalesce(delivered_at, now()),
           delivered_by = coalesce(delivered_by, actor)
     where id = pkg.id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (new.id, actor, 'delivery_sent', pkg.status, 'delivered', jsonb_build_object('delivery_id', pkg.id, 'version', pkg.version));
  end if;

  if old.status in ('ready-for-delivery', 'delivered') and new.status = 'in-review' then
    if pkg.id is not null and pkg.status not in ('revision_requested', 'preparing') then
      update public.project_deliveries
         set status = 'revision_requested',
             approval_state = 'revision_required',
             revision_note = coalesce(nullif(trim(revision_note), ''), 'Returned to review for revision')
       where id = pkg.id;
      insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
      values (new.id, actor, 'revision_requested', pkg.status, 'revision_requested', jsonb_build_object('delivery_id', pkg.id, 'version', pkg.version));
    end if;
    if not exists (
      select 1 from public.project_deliveries
      where project_id = new.id and status = 'preparing'
    ) then
      select coalesce(max(version), 0) + 1 into next_version
      from public.project_deliveries where project_id = new.id;
      insert into public.project_deliveries (project_id, version, status, created_by)
      values (new.id, next_version, 'preparing', actor);
      insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
      values (new.id, actor, 'delivery_prepared', 'v' || next_version::text, jsonb_build_object('version', next_version));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_delivery_on_project_status on public.projects;
create trigger sync_delivery_on_project_status
after update of status on public.projects
for each row execute function public.sync_delivery_on_project_status();

-- ── 9. Conversion cannot skip the delivery workflow ─────────────────────────
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
  -- Delivery-stage statuses require final files + approval and cannot be the
  -- starting state of a newly converted project.
  if p_status not in (
    'draft', 'planned', 'active', 'waiting-for-client', 'in-review', 'on-hold', 'cancelled'
  ) then
    raise exception 'Invalid initial project status. Converted projects start before Ready for delivery.';
  end if;
  if p_phase is null or p_phase not between 1 and 10 then
    raise exception 'Project phase must be between 1 and 10';
  end if;
  if p_start_date is not null and p_due_date is not null and p_due_date < p_start_date then
    raise exception 'Project deadline cannot be before its start date';
  end if;
  if p_budget is not null and p_budget < 0 then raise exception 'Budget cannot be negative'; end if;
  if clean_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a 3-letter code'; end if;

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
    0,
    p_budget,
    clean_currency,
    p_start_date,
    p_due_date,
    null,
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

-- ── 10. Delivery workflow RPCs ──────────────────────────────────────────────
create or replace function public.assert_staff_can_access_project(p_project_id uuid)
returns public.projects
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  proj public.projects;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_active() or public.must_change_password_pending() then
    raise exception 'Your account cannot manage project delivery until it is active and the temporary password is replaced.';
  end if;
  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then raise exception 'Project not found'; end if;
  if not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to this project.';
  end if;
  if proj.archived_at is not null then
    raise exception 'This project is archived. Unarchive it before changing delivery.';
  end if;
  return proj;
end;
$$;

create or replace function public.prepare_project_delivery(p_project_id uuid, p_notes text default null)
returns public.project_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  next_version integer;
  clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not (public.has_permission('project.edit') or public.has_permission('file.upload')) then
    raise exception 'You do not have permission to prepare a delivery package.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is not null and pkg.status = 'preparing' then
    if clean_notes is not null then
      update public.project_deliveries set notes = clean_notes where id = pkg.id returning * into pkg;
    end if;
    return pkg;
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.project_deliveries where project_id = p_project_id;

  insert into public.project_deliveries (project_id, version, status, notes, created_by)
  values (p_project_id, next_version, 'preparing', clean_notes, auth.uid())
  returning * into pkg;

  insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
  values (p_project_id, auth.uid(), 'delivery_prepared', 'v' || next_version::text,
          jsonb_build_object('delivery_id', pkg.id, 'version', next_version));
  return pkg;
end;
$$;

create or replace function public.add_project_delivery_file(p_project_id uuid, p_file_id uuid)
returns public.project_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  file_rec public.files;
  file_name text;
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not (public.has_permission('project.edit') or public.has_permission('file.upload')) then
    raise exception 'You do not have permission to attach final delivery files.';
  end if;

  select * into file_rec from public.files where id = p_file_id;
  if file_rec.id is null or file_rec.project_id is distinct from p_project_id then
    raise exception 'Choose a file that belongs to this project.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null or pkg.status <> 'preparing' then
    pkg := public.prepare_project_delivery(p_project_id, null);
  end if;

  insert into public.project_delivery_files (delivery_id, file_id, added_by)
  values (pkg.id, p_file_id, auth.uid())
  on conflict (delivery_id, file_id) do nothing;

  select name into file_name from public.files where id = p_file_id;
  insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
  values (p_project_id, auth.uid(), 'delivery_file_added', file_name,
          jsonb_build_object('delivery_id', pkg.id, 'file_id', p_file_id));

  select * into pkg from public.project_deliveries where id = pkg.id;
  return pkg;
end;
$$;

create or replace function public.remove_project_delivery_file(p_project_id uuid, p_file_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  pkg public.project_deliveries;
  file_name text;
begin
  perform public.assert_staff_can_access_project(p_project_id);
  if not (public.has_permission('project.edit') or public.has_permission('file.upload')) then
    raise exception 'You do not have permission to change the delivery set.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null then raise exception 'There is no delivery package on this project.'; end if;
  if pkg.status <> 'preparing' then
    raise exception 'Final delivery files are locked. Request a revision to change the set.';
  end if;

  select name into file_name from public.files where id = p_file_id;
  delete from public.project_delivery_files
  where delivery_id = pkg.id and file_id = p_file_id;
  if not found then
    raise exception 'That file is not part of the current delivery package.';
  end if;

  insert into public.project_activity (project_id, actor_id, event_type, old_value, metadata)
  values (p_project_id, auth.uid(), 'delivery_file_removed', file_name,
          jsonb_build_object('delivery_id', pkg.id, 'file_id', p_file_id));
  return true;
end;
$$;

create or replace function public.mark_delivery_ready(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  file_count integer;
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to mark a delivery ready.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null then raise exception 'Prepare a delivery package first.'; end if;
  select count(*)::integer into file_count from public.project_delivery_files where delivery_id = pkg.id;
  if file_count < 1 then
    raise exception 'Attach at least one final delivery file before marking the package ready.';
  end if;

  if pkg.status = 'preparing' then
    update public.project_deliveries set status = 'ready' where id = pkg.id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (p_project_id, auth.uid(), 'delivery_ready', 'preparing', 'ready',
            jsonb_build_object('delivery_id', pkg.id, 'version', pkg.version));
  end if;

  if proj.status <> 'ready-for-delivery' then
    update public.projects set status = 'ready-for-delivery' where id = p_project_id
    returning * into proj;
  end if;
  return proj;
end;
$$;

create or replace function public.mark_project_delivered(p_project_id uuid, p_note text default null)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  file_count integer;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to mark a project delivered.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null then raise exception 'Prepare a delivery package first.'; end if;
  select count(*)::integer into file_count from public.project_delivery_files where delivery_id = pkg.id;
  if file_count < 1 then
    raise exception 'Cannot mark delivered without at least one final delivery file.';
  end if;

  update public.project_deliveries
     set status = 'delivered',
         notes = coalesce(clean_note, notes),
         delivered_at = coalesce(delivered_at, now()),
         delivered_by = coalesce(delivered_by, auth.uid())
   where id = pkg.id;

  insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
  values (p_project_id, auth.uid(), 'delivery_sent', pkg.status, 'delivered',
          jsonb_build_object('delivery_id', pkg.id, 'version', pkg.version));

  if proj.status in ('active', 'waiting-for-client') then
    update public.projects set status = 'in-review' where id = p_project_id;
  end if;
  select * into proj from public.projects where id = p_project_id;
  if proj.status = 'in-review' then
    update public.projects set status = 'ready-for-delivery' where id = p_project_id;
  end if;
  select * into proj from public.projects where id = p_project_id;
  if proj.status = 'ready-for-delivery' then
    update public.projects set status = 'delivered' where id = p_project_id
    returning * into proj;
  elsif proj.status <> 'delivered' then
    raise exception 'Cannot mark delivered from the current project status (%).', proj.status;
  end if;
  return proj;
end;
$$;

create or replace function public.request_project_revision(p_project_id uuid, p_note text)
returns public.project_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  next_pkg public.project_deliveries;
  next_version integer;
  clean_note text := btrim(coalesce(p_note, ''));
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to request a revision.';
  end if;
  if length(clean_note) = 0 then
    raise exception 'A revision note is required.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is not null and pkg.status not in ('revision_requested', 'preparing') then
    update public.project_deliveries
       set status = 'revision_requested',
           approval_state = 'revision_required',
           revision_note = clean_note
     where id = pkg.id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (p_project_id, auth.uid(), 'revision_requested', pkg.status, 'revision_requested',
            jsonb_build_object('delivery_id', pkg.id, 'version', pkg.version, 'note', left(clean_note, 280)));
  end if;

  select * into next_pkg from public.project_deliveries
  where project_id = p_project_id and status = 'preparing'
  order by version desc limit 1;

  if next_pkg.id is null then
    select coalesce(max(version), 0) + 1 into next_version
    from public.project_deliveries where project_id = p_project_id;
    insert into public.project_deliveries (project_id, version, status, notes, created_by)
    values (p_project_id, next_version, 'preparing', 'Revision of v' || coalesce(pkg.version, 0)::text, auth.uid())
    returning * into next_pkg;
    insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
    values (p_project_id, auth.uid(), 'delivery_prepared', 'v' || next_version::text,
            jsonb_build_object('delivery_id', next_pkg.id, 'version', next_version, 'revision_of', pkg.id));
  end if;

  if proj.status <> 'in-review' then
    update public.projects set status = 'in-review' where id = p_project_id;
  end if;
  return next_pkg;
end;
$$;

-- INTERNAL placeholder only. Does not represent a client portal action.
create or replace function public.record_internal_client_approval(p_project_id uuid, p_note text, p_state text default 'approved_internally')
returns public.project_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  clean_note text := btrim(coalesce(p_note, ''));
  clean_state text := coalesce(nullif(btrim(p_state), ''), 'approved_internally');
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to record client approval.';
  end if;
  if clean_state not in ('not_requested', 'awaiting_client', 'approved_internally', 'revision_required') then
    raise exception 'Invalid internal approval state.';
  end if;
  if clean_state = 'approved_internally' and length(clean_note) = 0 then
    raise exception 'Add a short internal note describing how the client approved.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null then
    raise exception 'Prepare and deliver a package before recording approval.';
  end if;

  update public.project_deliveries
     set approval_state = clean_state,
         approval_note = case when length(clean_note) > 0 then clean_note else approval_note end,
         approval_recorded_by = case when clean_state = 'approved_internally' then auth.uid() else approval_recorded_by end,
         approval_recorded_at = case when clean_state = 'approved_internally' then now() else approval_recorded_at end,
         status = case
           when clean_state = 'approved_internally' and status = 'delivered' then 'approved'
           else status
         end
   where id = pkg.id
   returning * into pkg;

  insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
  values (
    p_project_id, auth.uid(), 'approval_recorded', null, clean_state,
    jsonb_build_object(
      'delivery_id', pkg.id,
      'internal_placeholder', true,
      'not_client_facing', true,
      'note', left(clean_note, 280)
    )
  );
  return pkg;
end;
$$;

create or replace function public.complete_project(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  blockers text[];
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to complete this project.';
  end if;
  blockers := public.project_completion_blockers(p_project_id);
  if coalesce(cardinality(blockers), 0) > 0 then
    raise exception 'Cannot complete this project: %', array_to_string(blockers, '; ');
  end if;
  update public.projects set status = 'completed' where id = p_project_id
  returning * into proj;
  return proj;
end;
$$;

create or replace function public.archive_project(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_active() or public.must_change_password_pending() then
    raise exception 'Your account cannot archive projects right now.';
  end if;
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to archive this project.';
  end if;
  if not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to this project.';
  end if;
  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then raise exception 'Project not found'; end if;
  if proj.archived_at is not null then return proj; end if;
  if proj.status not in ('completed', 'cancelled') then
    raise exception 'Only Completed or Cancelled projects can be archived.';
  end if;
  update public.projects
     set archived_at = now(), archived_by = auth.uid()
   where id = p_project_id
   returning * into proj;
  return proj;
end;
$$;

create or replace function public.unarchive_project(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_active() or public.must_change_password_pending() then
    raise exception 'Your account cannot unarchive projects right now.';
  end if;
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to unarchive this project.';
  end if;
  if not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to this project.';
  end if;
  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then raise exception 'Project not found'; end if;
  if proj.archived_at is null then return proj; end if;
  update public.projects
     set archived_at = null, archived_by = null
   where id = p_project_id
   returning * into proj;
  return proj;
end;
$$;

revoke all on function public.current_project_delivery(uuid) from public, anon;
revoke all on function public.project_delivery_file_count(uuid) from public, anon;
revoke all on function public.project_completion_blockers(uuid) from public, anon;
revoke all on function public.project_can_complete(uuid) from public, anon;
revoke all on function public.project_delivery_readiness(uuid) from public, anon;
revoke all on function public.assert_staff_can_access_project(uuid) from public, anon;
revoke all on function public.prepare_project_delivery(uuid, text) from public, anon;
revoke all on function public.add_project_delivery_file(uuid, uuid) from public, anon;
revoke all on function public.remove_project_delivery_file(uuid, uuid) from public, anon;
revoke all on function public.mark_delivery_ready(uuid) from public, anon;
revoke all on function public.mark_project_delivered(uuid, text) from public, anon;
revoke all on function public.request_project_revision(uuid, text) from public, anon;
revoke all on function public.record_internal_client_approval(uuid, text, text) from public, anon;
revoke all on function public.complete_project(uuid) from public, anon;
revoke all on function public.archive_project(uuid) from public, anon;
revoke all on function public.unarchive_project(uuid) from public, anon;

grant execute on function public.current_project_delivery(uuid) to authenticated;
grant execute on function public.project_delivery_file_count(uuid) to authenticated;
grant execute on function public.project_completion_blockers(uuid) to authenticated;
grant execute on function public.project_can_complete(uuid) to authenticated;
grant execute on function public.project_delivery_readiness(uuid) to authenticated;
grant execute on function public.prepare_project_delivery(uuid, text) to authenticated;
grant execute on function public.add_project_delivery_file(uuid, uuid) to authenticated;
grant execute on function public.remove_project_delivery_file(uuid, uuid) to authenticated;
grant execute on function public.mark_delivery_ready(uuid) to authenticated;
grant execute on function public.mark_project_delivered(uuid, text) to authenticated;
grant execute on function public.request_project_revision(uuid, text) to authenticated;
grant execute on function public.record_internal_client_approval(uuid, text, text) to authenticated;
grant execute on function public.complete_project(uuid) to authenticated;
grant execute on function public.archive_project(uuid) to authenticated;
grant execute on function public.unarchive_project(uuid) to authenticated;

commit;
