-- Session 14 — Project Activity & Audit Timeline
--
-- A unified, append-only history of project-level events so every meaningful
-- change (creation, submission conversion, ownership, status, deadline, team
-- membership, file uploads/deletes) is recorded with who, what, when, and
-- context. Task-level events already live in `task_activity`; the project
-- detail page merges both feeds into one timeline.
--
-- Audit/system events are deliberately kept SEPARATE from client-facing
-- comments: `project_activity` is written exclusively by SECURITY DEFINER
-- triggers and read via RLS, while human/client discussion stays in `comments`.

create table if not exists public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  event_type text not null check (event_type in (
    'created',
    'submission_converted',
    'owner_changed',
    'manager_changed',
    'member_added',
    'member_removed',
    'status_changed',
    'deadline_changed',
    'file_uploaded',
    'file_deleted'
  )),
  old_value text,
  new_value text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.project_activity is
  'Append-only project audit history. Written exclusively by SECURITY DEFINER triggers; never by clients directly. Read access follows the project.';
comment on column public.project_activity.metadata is
  'Machine-readable context (ids, names) so the feed stays readable after accounts and records are removed.';

create index if not exists idx_project_activity_project on public.project_activity(project_id, created_at);

alter table public.project_activity enable row level security;

-- Read: anyone who may open the project. Every event is written by definer
-- triggers, so there is no insert/update/delete policy at all.
create policy project_activity_select_authorized on public.project_activity for select to authenticated
  using (
    public.is_active()
    and public.can_access_project(project_id)
  );

grant select on public.project_activity to authenticated;
revoke all on public.project_activity from anon;

-- ── 1. Project-level events ─────────────────────────────────────────────────
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
  -- Only attribute the event to a real profile. Some creation paths (e.g. a
  -- submission auto-converting to a project under an anonymous caller) pass an
  -- id that is not a persisted profile; such events are recorded as System.
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
      new.id,
      v_actor,
      'owner_changed',
      v_old_owner,
      v_new_owner,
      jsonb_build_object('old_owner_id', old.owner_id, 'new_owner_id', new.owner_id)
    );
  end if;

  if new.manager_id is distinct from old.manager_id then
    select coalesce(nullif(trim(full_name), ''), email) into v_old_manager from public.profiles where id = old.manager_id;
    select coalesce(nullif(trim(full_name), ''), email) into v_new_manager from public.profiles where id = new.manager_id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (
      new.id,
      v_actor,
      'manager_changed',
      v_old_manager,
      v_new_manager,
      jsonb_build_object('old_manager_id', old.manager_id, 'new_manager_id', new.manager_id)
    );
  end if;

  return new;
end;
$$;

comment on function public.record_project_activity() is
  'Writes project_activity rows for creation, submission conversion, status, deadline, owner, and manager changes.';

drop trigger if exists record_project_activity on public.projects;
create trigger record_project_activity
after insert or update of status, due_date, owner_id, manager_id on public.projects
for each row execute function public.record_project_activity();

-- ── 2. Team membership events ───────────────────────────────────────────────
create or replace function public.record_project_member_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_actor uuid := auth.uid();
begin
  if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
    v_actor := null;
  end if;

  select coalesce(nullif(trim(full_name), ''), email) into v_name
  from public.profiles where id = coalesce(new.user_id, old.user_id);

  if tg_op = 'INSERT' then
    insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
    values (
      new.project_id,
      v_actor,
      'member_added',
      v_name,
      jsonb_build_object('user_id', new.user_id, 'assigned_by', new.assigned_by)
    );
  elsif tg_op = 'DELETE' then
    insert into public.project_activity (project_id, actor_id, event_type, old_value, metadata)
    values (
      old.project_id,
      v_actor,
      'member_removed',
      v_name,
      jsonb_build_object('user_id', old.user_id)
    );
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.record_project_member_activity() is
  'Records when a team member is added to or removed from a project.';

drop trigger if exists record_project_member_activity on public.project_members;
create trigger record_project_member_activity
after insert or delete on public.project_members
for each row execute function public.record_project_member_activity();

-- ── 3. File upload/delete events ────────────────────────────────────────────
create or replace function public.record_project_file_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  if tg_op = 'INSERT' and new.project_id is not null then
    v_actor := new.uploaded_by;
    if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
      v_actor := null;
    end if;
    insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
    values (
      new.project_id,
      v_actor,
      'file_uploaded',
      new.name,
      jsonb_build_object('file_id', new.id, 'file_type', new.type, 'size', new.size)
    );
  elsif tg_op = 'DELETE' and old.project_id is not null then
    v_actor := auth.uid();
    if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
      v_actor := null;
    end if;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, metadata)
    values (
      old.project_id,
      v_actor,
      'file_deleted',
      old.name,
      jsonb_build_object('file_id', old.id, 'file_type', old.type)
    );
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.record_project_file_activity() is
  'Records project file uploads and deletions so the timeline shows important file activity.';

drop trigger if exists record_project_file_activity on public.files;
create trigger record_project_file_activity
after insert or delete on public.files
for each row execute function public.record_project_file_activity();

commit;
