-- Session 13 — Employee My Work & Task Management
--
-- Strengthens the task system around the people who actually execute it:
--
--   1. User-scoped permission helpers so the database can ask "may THIS user
--      touch this project?" — not only "may the current user?".
--   2. A database-enforced assignee guard: a task can only be assigned to an
--      active team member who belongs to the task's project, or to someone the
--      permission model explicitly grants project-wide access to
--      (`project.view_all`). Clients and outsiders can never own tasks, no
--      matter which UI or API client sends the write.
--   3. A tamper-evident `task_activity` feed (audit trail + work notes) that
--      follows the task's current project access: everyone authorized for a
--      task sees the same history; nobody outside the project does.
--   4. Removal hygiene: when a member leaves a project, their OPEN tasks are
--      released back to unassigned (completed history is preserved), so My
--      Work never shows work nobody can reach.
--   5. Task-assignment notifications deep-link into the new /my-work page.
--
-- Reminder scheduling is intentionally NOT part of this session.

begin;

-- ── 1. User-scoped permission helpers ───────────────────────────────────────
-- Mirrors get_user_permissions()/has_permission() for an arbitrary user. The
-- caller's own checks stay on the no-arg helpers; these exist so guards and
-- RPCs can reason about a *target* user (e.g. a prospective task assignee).
create or replace function public.user_has_permission(p_user_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.profiles prof
      join public.app_roles r on r.id = prof.role_id and r.is_active
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
      where prof.id = p_user_id
        and prof.status = 'active'
        and not prof.must_change_password
        and p.key = p_permission
    );
$$;

comment on function public.user_has_permission(uuid, text) is
  'True when the target user is an active team account whose role carries the given permission key.';

-- Project access for an arbitrary user: same semantics as can_access_project
-- (project.view + either project.view_all or active membership).
create or replace function public.can_user_access_project(p_user_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_project_id is not null
    and public.user_has_permission(p_user_id, 'project.view')
    and (
      public.user_has_permission(p_user_id, 'project.view_all')
      or exists (
        select 1
        from public.project_members pm
        join public.profiles prof on prof.id = pm.user_id and prof.status = 'active'
        where pm.project_id = p_project_id and pm.user_id = p_user_id
      )
    );
$$;

comment on function public.can_user_access_project(uuid, uuid) is
  'True when the target user may open the project (member, or a project.view_all role such as Manager/Admin).';

-- ── 2. Task assignee guard ──────────────────────────────────────────────────
-- Authorization at the row level, below every UI:
--   * unassigned tasks are always allowed;
--   * the assignee must be an active, non-client team account;
--   * the assignee must belong to the task's project …
--   * … unless the permission model explicitly grants them project-wide
--     access (project.view_all — Managers/Admins or a custom role).
-- The trigger runs on project_id changes too, so moving a task between
-- projects re-validates the assignee against the destination team.
create or replace function public.enforce_task_assignee_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Reassigning to ANOTHER person is a management action: it requires the
  -- task.assign permission. Anyone who may edit may still pick up a task for
  -- themselves (or hand their own task back to unassigned). Operator contexts
  -- without an authenticated user (SQL editor maintenance) are exempt — RLS
  -- already blocks that path for API clients.
  if tg_op = 'UPDATE'
    and auth.uid() is not null
    and new.assignee_id is distinct from old.assignee_id
    and new.assignee_id is not null
    and new.assignee_id is distinct from auth.uid()
    and not public.has_permission('task.assign')
  then
    raise exception 'Only users with the “Assign tasks” permission can assign tasks to other people.';
  end if;

  if new.assignee_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = new.assignee_id
      and p.status = 'active'
      and p.role <> 'client'::public.app_role
      and not p.must_change_password
  ) then
    raise exception 'Tasks can only be assigned to active team member accounts (never to clients, inactive, or pending-password accounts).';
  end if;

  if exists (
    select 1 from public.project_members pm
    where pm.project_id = new.project_id and pm.user_id = new.assignee_id
  ) then
    return new;
  end if;

  if public.user_has_permission(new.assignee_id, 'project.view_all') then
    return new;
  end if;

  raise exception 'Task assignee must belong to this project. Add them to the project team first, or grant a role with “View all projects”.';
end;
$$;

comment on function public.enforce_task_assignee_guard() is
  'Rejects task assignments to users outside the project team unless the permission model explicitly allows them (project.view_all), and limits assigning OTHER people to holders of task.assign.';

drop trigger if exists enforce_task_assignee_membership on public.tasks;
drop trigger if exists enforce_task_assignee_guard on public.tasks;
create trigger enforce_task_assignee_guard
before insert or update of assignee_id, project_id on public.tasks
for each row execute function public.enforce_task_assignee_guard();

-- ── 3. Task activity feed ───────────────────────────────────────────────────
-- One append-only history row per meaningful event. The actor column is a
-- nullable audit attribution (on delete set null, like every other audit FK),
-- and metadata keeps machine-readable context (ids, names) so the feed stays
-- readable even after accounts are removed.
create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  event_type text not null check (event_type in (
    'note',
    'created',
    'status_changed',
    'priority_changed',
    'assignee_changed',
    'due_date_changed',
    'title_changed',
    'description_changed',
    'project_changed'
  )),
  old_value text,
  new_value text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.task_activity is
  'Append-only task history: automatic change events plus team work notes. Access follows the task''s current project.';
comment on column public.task_activity.project_id is
  'Denormalized project of the task at write time; select access always re-checks the task''s CURRENT project.';

create index if not exists idx_task_activity_task on public.task_activity(task_id, created_at);
create index if not exists idx_task_activity_project on public.task_activity(project_id);

alter table public.task_activity enable row level security;

-- Read: exactly the people who may open the task itself (its current project).
create policy task_activity_select_authorized on public.task_activity for select to authenticated
  using (
    public.is_active()
    and exists (
      select 1 from public.tasks t
      where t.id = task_activity.task_id
        and public.can_access_project(t.project_id)
    )
  );

-- Write: only work notes, directly by users allowed to edit tasks on that
-- project. Every other event is written exclusively by SECURITY DEFINER
-- triggers, so history rows can never be forged through the table API.
create policy task_activity_insert_note on public.task_activity for insert to authenticated
  with check (
    event_type = 'note'
    and actor_id = auth.uid()
    and public.has_permission('task.edit')
    and exists (
      select 1 from public.tasks t
      where t.id = task_activity.task_id
        and t.project_id = task_activity.project_id
        and public.can_access_project(t.project_id)
    )
  );

-- No update/delete policies: the feed is append-only for every role.

-- ── 4. Automatic activity recording ─────────────────────────────────────────
create or replace function public.record_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.created_by);
  v_old_assignee text;
  v_new_assignee text;
  v_old_project text;
  v_new_project text;
begin
  if tg_op = 'INSERT' then
    select coalesce(nullif(trim(full_name), ''), email) into v_new_assignee
    from public.profiles where id = new.assignee_id;

    insert into public.task_activity (task_id, project_id, actor_id, event_type, new_value, metadata)
    values (
      new.id,
      new.project_id,
      v_actor,
      'created',
      new.title,
      jsonb_build_object(
        'status', new.status,
        'priority', new.priority,
        'due_date', new.due_date,
        'assignee_id', new.assignee_id,
        'assignee_name', v_new_assignee
      )
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'status_changed', old.status, new.status);
  end if;

  if new.priority is distinct from old.priority then
    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'priority_changed', old.priority, new.priority);
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    select coalesce(nullif(trim(full_name), ''), email) into v_old_assignee
    from public.profiles where id = old.assignee_id;
    select coalesce(nullif(trim(full_name), ''), email) into v_new_assignee
    from public.profiles where id = new.assignee_id;

    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value, metadata)
    values (
      new.id,
      new.project_id,
      v_actor,
      'assignee_changed',
      v_old_assignee,
      v_new_assignee,
      jsonb_build_object('old_assignee_id', old.assignee_id, 'new_assignee_id', new.assignee_id)
    );
  end if;

  if new.due_date is distinct from old.due_date then
    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'due_date_changed', old.due_date::text, new.due_date::text);
  end if;

  if new.title is distinct from old.title then
    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'title_changed', old.title, new.title);
  end if;

  if new.description is distinct from old.description then
    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'description_changed', left(coalesce(old.description, ''), 500), left(coalesce(new.description, ''), 500));
  end if;

  if new.project_id is distinct from old.project_id then
    select name into v_old_project from public.projects where id = old.project_id;
    select name into v_new_project from public.projects where id = new.project_id;

    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value, metadata)
    values (
      new.id,
      new.project_id,
      v_actor,
      'project_changed',
      v_old_project,
      v_new_project,
      jsonb_build_object('old_project_id', old.project_id, 'new_project_id', new.project_id)
    );
  end if;

  return new;
end;
$$;

comment on function public.record_task_activity() is
  'Writes one task_activity row per changed task field (creation, status, priority, assignee, due date, title, description, project move).';

drop trigger if exists record_task_activity on public.tasks;
create trigger record_task_activity
after insert or update of status, priority, assignee_id, due_date, title, description, project_id on public.tasks
for each row execute function public.record_task_activity();

-- ── 5. Work notes RPC ───────────────────────────────────────────────────────
-- Mirrors add_form_submission_note: one permission-checked entry point that
-- validates the note and attributes it to the caller. Direct table inserts
-- remain possible through the note-only RLS policy above; both paths produce
-- the same shape of row.
create or replace function public.add_task_note(p_task_id uuid, p_note text)
returns public.task_activity
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_row public.task_activity;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found.';
  end if;

  if not public.is_active() or public.must_change_password_pending() then
    raise exception 'Your account cannot add task notes until it is active and the temporary password is replaced.';
  end if;

  if not public.can_access_project(v_task.project_id) then
    raise exception 'You do not have access to this task.';
  end if;

  if not public.has_permission('task.edit') then
    raise exception 'You do not have permission to add task notes.';
  end if;

  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'A task note cannot be empty.';
  end if;

  insert into public.task_activity (task_id, project_id, actor_id, event_type, new_value)
  values (v_task.id, v_task.project_id, auth.uid(), 'note', left(trim(p_note), 2000))
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.add_task_note(uuid, text) is
  'Adds a work note to a task the caller may edit; stored as an immutable task_activity row.';

grant execute on function public.add_task_note(uuid, text) to authenticated;

-- ── 6. Assignee directory RPC ───────────────────────────────────────────────
-- The single source of truth for "who may receive a task in this project":
-- active team accounts that are project members PLUS anyone the permission
-- model grants project-wide access to (project.view_all). Mirrors the
-- enforce_task_assignee_guard trigger exactly, so the UI only offers
-- choices the database will accept. Security definer because employees
-- without team-directory access still need valid choices for their own
-- projects — the result is scoped to one project the caller may open.
create or replace function public.list_task_assignees(p_project_id uuid)
returns table (
  id uuid,
  full_name text,
  email text,
  job_title text,
  role public.app_role,
  is_member boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_active() or not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to this project.';
  end if;

  return query
  select
    prof.id,
    prof.full_name,
    prof.email,
    prof.job_title,
    prof.role,
    (pm.user_id is not null) as is_member
  from public.profiles prof
  left join public.project_members pm
    on pm.project_id = p_project_id and pm.user_id = prof.id
  where prof.status = 'active'
    and prof.role <> 'client'::public.app_role
    and not prof.must_change_password
    and (
      pm.user_id is not null
      or public.user_has_permission(prof.id, 'project.view_all')
    )
  order by (pm.user_id is not null) desc, prof.full_name asc nulls last, prof.email asc;
end;
$$;

comment on function public.list_task_assignees(uuid) is
  'Valid task assignees for one project: active team members plus project.view_all staff, ordered with members first.';

grant execute on function public.list_task_assignees(uuid) to authenticated;

-- ── 7. Member-removal hygiene ───────────────────────────────────────────────
-- Leaving a project must never strand open work on someone who can no longer
-- reach it: open tasks release to unassigned and the activity feed records the
-- change (actor = whoever removed the member). Completed tasks keep their
-- attribution — history is not rewritten.
create or replace function public.unassign_tasks_on_member_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tasks
  set assignee_id = null
  where project_id = old.project_id
    and assignee_id = old.user_id
    and status <> 'done';
  return old;
end;
$$;

comment on function public.unassign_tasks_on_member_removal() is
  'Releases open tasks to unassigned when their assignee leaves the project; completed tasks stay attributed.';

drop trigger if exists unassign_tasks_on_member_removal on public.project_members;
create trigger unassign_tasks_on_member_removal
after delete on public.project_members
for each row execute function public.unassign_tasks_on_member_removal();

-- ── 8. Task notifications deep-link into My Work ────────────────────────────
-- Identical to the previous trigger except the action_url: the assignee lands
-- on their personal My Work page with the task opened, instead of the project
-- task list.
create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_rec public.projects;
  assigner_name text;
begin
  if new.assignee_id is not null
    and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
    and exists (
      select 1 from public.profiles p
      where p.id = new.assignee_id
        and p.status = 'active'
        and p.role <> 'client'::public.app_role
    ) then

    select * into proj_rec from public.projects where id = new.project_id;

    select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'A team member')
    into assigner_name
    from public.profiles
    where id = coalesce(new.created_by, auth.uid());

    if assigner_name is null then
      assigner_name := 'A team member';
    end if;

    insert into public.notifications (
      recipient_id,
      actor_id,
      project_id,
      task_id,
      type,
      title,
      message,
      action_url,
      metadata
    )
    values (
      new.assignee_id,
      coalesce(new.created_by, (select id from public.profiles where id = auth.uid())),
      new.project_id,
      new.id,
      'task_assignment',
      'New task assignment: ' || new.title,
      'You were assigned “' || new.title || '” in project “' || coalesce(proj_rec.name, 'a project') || '” by ' || assigner_name || case when new.due_date is not null then ' (Due: ' || to_char(new.due_date, 'YYYY-MM-DD') || ')' else '' end || '.',
      '/my-work?task=' || new.id::text,
      jsonb_build_object(
        'task_id', new.id,
        'task_title', new.title,
        'project_id', new.project_id,
        'project_name', coalesce(proj_rec.name, 'Project'),
        'assigned_by', assigner_name,
        'due_date', new.due_date,
        'priority', new.priority,
        'status', new.status,
        'assigned_at', now()
      )
    );
  end if;
  return new;
end;
$$;

-- ── 9. Grants & cleanup ─────────────────────────────────────────────────────
grant select, insert on public.task_activity to authenticated;
revoke all on public.task_activity from anon;

grant execute on function public.user_has_permission(uuid, text) to authenticated;
grant execute on function public.can_user_access_project(uuid, uuid) to authenticated;

commit;
