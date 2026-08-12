-- Session 20 — Deadline & escalation reminders
--
-- Server-side job (`run_deadline_reminders`) scans open tasks and open
-- projects and writes in-app notifications through emit_in_app_notification.
-- Every attempt that actually delivers (or is skipped after a successful
-- uniqueness claim) is recorded in reminder_events.
--
-- Recipients:
--   task.due_soon / task.due_today / task.overdue  → assignee
--   task.overdue.escalation                        → project manager, then owner
--   project.deadline_approaching / project.overdue → owner + manager
--
-- Inactive / pending-password accounts are never notified (emit already
-- enforces this). Dedupe is (kind, entity, recipient, due_date) so a due-date
-- change can produce a new reminder, but the same state never repeats.
--
-- Calendar math uses CURRENT_DATE on the database (typically UTC).

begin;

-- ── 1. Catalog: new domain events + UI type ────────────────────────────────
alter table public.notifications drop constraint if exists notifications_event_check;
alter table public.notifications add constraint notifications_event_check check (
  event is null or event in (
    'submission.created',
    'submission.assigned',
    'submission.status_changed',
    'project.created',
    'project.assigned',
    'team_member.assigned',
    'task.assigned',
    'task.updated',
    'client.feedback',
    'client.approval',
    'client.revision',
    'file.shared',
    'delivery.ready',
    'task.due_soon',
    'task.due_today',
    'task.overdue',
    'project.deadline_approaching',
    'project.overdue'
  )
);

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'info',
    'assignment',
    'project_update',
    'task_update',
    'task_assignment',
    'form_submission',
    'submission',
    'client_feedback',
    'client_approval',
    'client_revision',
    'file_shared',
    'delivery_ready',
    'deadline_reminder'
  )
);

-- ── 2. Reminder event log ──────────────────────────────────────────────────
create table if not exists public.reminder_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'task.due_soon',
    'task.due_today',
    'task.overdue',
    'task.overdue.escalation',
    'project.deadline_approaching',
    'project.overdue'
  )),
  entity_type text not null check (entity_type in ('task', 'project')),
  entity_id uuid not null,
  recipient_id uuid references public.profiles(id) on delete set null,
  notification_id uuid references public.notifications(id) on delete set null,
  due_date date not null,
  dedupe_key text not null,
  role text not null default 'assignee' check (role in ('assignee', 'manager', 'owner')),
  created_at timestamptz not null default now()
);

comment on table public.reminder_events is
  'Append-only record of deadline reminder deliveries. Unique on dedupe_key.';

create unique index if not exists idx_reminder_events_dedupe
  on public.reminder_events (dedupe_key);

create index if not exists idx_reminder_events_entity
  on public.reminder_events (entity_type, entity_id, created_at desc);

create index if not exists idx_reminder_events_recipient
  on public.reminder_events (recipient_id, created_at desc);

alter table public.reminder_events enable row level security;

-- Staff with notification.view can read the log for projects they can access;
-- nobody (including authenticated) may insert/update/delete via the table API.
create policy reminder_events_select_staff on public.reminder_events
  for select to authenticated
  using (
    public.is_active()
    and public.has_permission('notification.view')
    and (
      (entity_type = 'project' and public.can_access_project(entity_id))
      or (entity_type = 'task' and exists (
        select 1 from public.tasks t
        where t.id = entity_id and public.can_access_project(t.project_id)
      ))
    )
  );

revoke insert, update, delete on public.reminder_events from anon, authenticated;
grant select on public.reminder_events to authenticated;

-- ── 3. Delivery helper ─────────────────────────────────────────────────────
create or replace function public.record_deadline_reminder(
  p_kind text,
  p_entity_type text,
  p_entity_id uuid,
  p_recipient_id uuid,
  p_due_date date,
  p_role text,
  p_event text,
  p_title text,
  p_message text,
  p_action_url text,
  p_project_id uuid,
  p_task_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean := false;
  notif_id uuid;
  key text;
begin
  if p_recipient_id is null or p_due_date is null or p_entity_id is null then
    return false;
  end if;

  key := p_kind || ':' || p_entity_id::text || ':' || p_recipient_id::text || ':' || p_due_date::text;

  -- Claim uniqueness first so two overlapping cron ticks cannot double-send.
  begin
    insert into public.reminder_events (
      kind, entity_type, entity_id, recipient_id, due_date, dedupe_key, role
    ) values (
      p_kind, p_entity_type, p_entity_id, p_recipient_id, p_due_date, key, coalesce(p_role, 'assignee')
    );
    claimed := true;
  exception
    when unique_violation then
      return false;
  end;

  notif_id := public.emit_in_app_notification(
    p_recipient_id,
    p_event,
    'deadline_reminder',
    p_title,
    p_message,
    p_action_url,
    key,
    null, -- system actor: do not skip the recipient
    p_project_id,
    null,
    p_task_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'reminder_kind', p_kind,
      'reminder_role', coalesce(p_role, 'assignee'),
      'due_date', p_due_date
    )
  );

  if notif_id is null then
    -- Inactive / pending-password / client. Drop the claim so a later run
    -- can deliver once the account is eligible again.
    delete from public.reminder_events where dedupe_key = key;
    return false;
  end if;

  update public.reminder_events
     set notification_id = notif_id
   where dedupe_key = key;

  return true;
end;
$$;

-- ── 4. Scheduled job ───────────────────────────────────────────────────────
create or replace function public.run_deadline_reminders(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := coalesce(p_today, current_date);
  soon_days integer := 3;
  project_soon_days integer := 7;
  sent integer := 0;
  skipped integer := 0;
  rec record;
  delivered boolean;
  assignee_name text;
begin
  -- Open tasks with a due date and an assignee.
  for rec in
    select
      t.id,
      t.title,
      t.due_date,
      t.assignee_id,
      t.project_id,
      t.status,
      p.name as project_name,
      p.owner_id,
      p.manager_id,
      p.status as project_status,
      p.archived_at
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.due_date is not null
      and t.assignee_id is not null
      and t.status is distinct from 'done'
      and p.archived_at is null
      and p.status not in ('completed', 'cancelled')
  loop
    if rec.due_date > today and rec.due_date <= today + soon_days then
      delivered := public.record_deadline_reminder(
        'task.due_soon', 'task', rec.id, rec.assignee_id, rec.due_date, 'assignee',
        'task.due_soon',
        'Task due soon: ' || rec.title,
        '“' || rec.title || '” in “' || coalesce(rec.project_name, 'a project')
          || '” is due on ' || to_char(rec.due_date, 'YYYY-MM-DD') || '.',
        '/my-work?task=' || rec.id::text,
        rec.project_id, rec.id,
        jsonb_build_object('task_title', rec.title, 'project_name', rec.project_name, 'project_id', rec.project_id)
      );
      if delivered then sent := sent + 1; else skipped := skipped + 1; end if;
    elsif rec.due_date = today then
      delivered := public.record_deadline_reminder(
        'task.due_today', 'task', rec.id, rec.assignee_id, rec.due_date, 'assignee',
        'task.due_today',
        'Task due today: ' || rec.title,
        '“' || rec.title || '” in “' || coalesce(rec.project_name, 'a project')
          || '” is due today.',
        '/my-work?task=' || rec.id::text,
        rec.project_id, rec.id,
        jsonb_build_object('task_title', rec.title, 'project_name', rec.project_name, 'project_id', rec.project_id)
      );
      if delivered then sent := sent + 1; else skipped := skipped + 1; end if;
    elsif rec.due_date < today then
      delivered := public.record_deadline_reminder(
        'task.overdue', 'task', rec.id, rec.assignee_id, rec.due_date, 'assignee',
        'task.overdue',
        'Task overdue: ' || rec.title,
        '“' || rec.title || '” in “' || coalesce(rec.project_name, 'a project')
          || '” was due on ' || to_char(rec.due_date, 'YYYY-MM-DD') || '.',
        '/my-work?task=' || rec.id::text,
        rec.project_id, rec.id,
        jsonb_build_object('task_title', rec.title, 'project_name', rec.project_name, 'project_id', rec.project_id)
      );
      if delivered then sent := sent + 1; else skipped := skipped + 1; end if;

      select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'The assignee')
        into assignee_name
      from public.profiles where id = rec.assignee_id;

      -- Escalate to manager, then owner, never the assignee twice.
      if rec.manager_id is not null and rec.manager_id is distinct from rec.assignee_id then
        delivered := public.record_deadline_reminder(
          'task.overdue.escalation', 'task', rec.id, rec.manager_id, rec.due_date, 'manager',
          'task.overdue',
          'Escalation: overdue task ' || rec.title,
          coalesce(assignee_name, 'The assignee') || ' has an overdue task “' || rec.title
            || '” in “' || coalesce(rec.project_name, 'a project')
            || '” (due ' || to_char(rec.due_date, 'YYYY-MM-DD') || ').',
          '/projects/' || rec.project_id::text,
          rec.project_id, rec.id,
          jsonb_build_object(
            'task_title', rec.title,
            'project_name', rec.project_name,
            'project_id', rec.project_id,
            'assignee_id', rec.assignee_id,
            'escalation', true
          )
        );
        if delivered then sent := sent + 1; else skipped := skipped + 1; end if;
      end if;

      if rec.owner_id is not null
         and rec.owner_id is distinct from rec.assignee_id
         and rec.owner_id is distinct from rec.manager_id then
        delivered := public.record_deadline_reminder(
          'task.overdue.escalation', 'task', rec.id, rec.owner_id, rec.due_date, 'owner',
          'task.overdue',
          'Escalation: overdue task ' || rec.title,
          coalesce(assignee_name, 'The assignee') || ' has an overdue task “' || rec.title
            || '” in “' || coalesce(rec.project_name, 'a project')
            || '” (due ' || to_char(rec.due_date, 'YYYY-MM-DD') || ').',
          '/projects/' || rec.project_id::text,
          rec.project_id, rec.id,
          jsonb_build_object(
            'task_title', rec.title,
            'project_name', rec.project_name,
            'project_id', rec.project_id,
            'assignee_id', rec.assignee_id,
            'escalation', true
          )
        );
        if delivered then sent := sent + 1; else skipped := skipped + 1; end if;
      end if;
    end if;
  end loop;

  -- Open projects with a deadline.
  for rec in
    select
      p.id,
      p.name as project_name,
      p.due_date,
      p.owner_id,
      p.manager_id,
      p.status,
      p.archived_at
    from public.projects p
    where p.due_date is not null
      and p.archived_at is null
      and p.status not in ('completed', 'cancelled')
  loop
    if rec.due_date > today and rec.due_date <= today + project_soon_days then
      if rec.owner_id is not null then
        delivered := public.record_deadline_reminder(
          'project.deadline_approaching', 'project', rec.id, rec.owner_id, rec.due_date, 'owner',
          'project.deadline_approaching',
          'Project deadline approaching: ' || rec.project_name,
          '“' || rec.project_name || '” is due on ' || to_char(rec.due_date, 'YYYY-MM-DD') || '.',
          '/projects/' || rec.id::text,
          rec.id, null,
          jsonb_build_object('project_name', rec.project_name, 'project_id', rec.id)
        );
        if delivered then sent := sent + 1; else skipped := skipped + 1; end if;
      end if;
      if rec.manager_id is not null and rec.manager_id is distinct from rec.owner_id then
        delivered := public.record_deadline_reminder(
          'project.deadline_approaching', 'project', rec.id, rec.manager_id, rec.due_date, 'manager',
          'project.deadline_approaching',
          'Project deadline approaching: ' || rec.project_name,
          '“' || rec.project_name || '” is due on ' || to_char(rec.due_date, 'YYYY-MM-DD') || '.',
          '/projects/' || rec.id::text,
          rec.id, null,
          jsonb_build_object('project_name', rec.project_name, 'project_id', rec.id)
        );
        if delivered then sent := sent + 1; else skipped := skipped + 1; end if;
      end if;
    elsif rec.due_date < today then
      if rec.owner_id is not null then
        delivered := public.record_deadline_reminder(
          'project.overdue', 'project', rec.id, rec.owner_id, rec.due_date, 'owner',
          'project.overdue',
          'Project overdue: ' || rec.project_name,
          '“' || rec.project_name || '” was due on ' || to_char(rec.due_date, 'YYYY-MM-DD') || '.',
          '/projects/' || rec.id::text,
          rec.id, null,
          jsonb_build_object('project_name', rec.project_name, 'project_id', rec.id)
        );
        if delivered then sent := sent + 1; else skipped := skipped + 1; end if;
      end if;
      if rec.manager_id is not null and rec.manager_id is distinct from rec.owner_id then
        delivered := public.record_deadline_reminder(
          'project.overdue', 'project', rec.id, rec.manager_id, rec.due_date, 'manager',
          'project.overdue',
          'Project overdue: ' || rec.project_name,
          '“' || rec.project_name || '” was due on ' || to_char(rec.due_date, 'YYYY-MM-DD') || '.',
          '/projects/' || rec.id::text,
          rec.id, null,
          jsonb_build_object('project_name', rec.project_name, 'project_id', rec.id)
        );
        if delivered then sent := sent + 1; else skipped := skipped + 1; end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'today', today,
    'sent', sent,
    'skipped', skipped
  );
end;
$$;

comment on function public.run_deadline_reminders(date) is
  'Server-side deadline scan. Call from /api/cron/reminders (service role). Not for browsers.';

revoke all on function public.record_deadline_reminder(text, text, uuid, uuid, date, text, text, text, text, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.run_deadline_reminders(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.run_deadline_reminders(date) to service_role;
  end if;
end $$;

commit;
