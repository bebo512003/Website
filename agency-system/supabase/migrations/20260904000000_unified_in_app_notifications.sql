-- Session 19 — Unified in-app notification system
--
-- Normalizes every inbox row around a domain event. Inserts go through one
-- SECURITY DEFINER helper (`emit_in_app_notification`) that:
--   * never notifies the actor
--   * never notifies inactive / pending-password accounts
--   * never notifies a client of a staff-only event (and vice versa)
--   * deduplicates on (recipient_id, dedupe_key)
--
-- Email is intentionally not added. `read_at` remains the unread flag.
--
-- Event catalog (recipient / title / link):
--   submission.created         staff with submission.view   /admin/forms/… or /submissions
--   submission.assigned        assigned reviewer            /submissions?submission=
--   submission.status_changed  reviewer, else submission.view staff
--   project.created            owner + manager              /projects/{id}
--   project.assigned           new owner / manager          /projects/{id}
--   team_member.assigned       added member (not lead)      /projects/{id}
--   task.assigned              assignee                     /my-work?task=
--   task.updated               current assignee             /my-work?task=
--   client.feedback            owner + manager              /projects/{id}
--   file.shared                linked client portal accounts /portal/projects/{id}
--   delivery.ready             staff team (ready) + clients (delivered)

begin;

-- ── 1. Schema: domain event + dedupe ────────────────────────────────────────
alter table public.notifications
  add column if not exists event text,
  add column if not exists dedupe_key text;

comment on column public.notifications.event is
  'Domain event key (submission.created, task.assigned, …). Source of truth for the inbox.';
comment on column public.notifications.dedupe_key is
  'Per-recipient uniqueness token so the same event is never delivered twice.';

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
    'delivery.ready'
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
    'delivery_ready'
  )
);

create unique index if not exists idx_notifications_dedupe
  on public.notifications (recipient_id, dedupe_key);

create index if not exists idx_notifications_event
  on public.notifications (recipient_id, event, created_at desc);

-- Clients need to read their own inbox for file.shared / delivery.ready.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r, public.permissions p
where r.key = 'client' and p.key = 'notification.view'
on conflict do nothing;

-- ── 2. Core emitter ─────────────────────────────────────────────────────────
create or replace function public.notification_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'A team member')
  from public.profiles
  where id = p_user_id;
$$;

create or replace function public.emit_in_app_notification(
  p_recipient_id uuid,
  p_event text,
  p_type text,
  p_title text,
  p_message text,
  p_action_url text,
  p_dedupe_key text,
  p_actor_id uuid default null,
  p_project_id uuid default null,
  p_submission_id uuid default null,
  p_task_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := coalesce(
    p_actor_id,
    (select id from public.profiles where id = auth.uid())
  );
  recipient public.profiles;
  inserted_id uuid;
  client_events text[] := array['file.shared', 'delivery.ready'];
begin
  if actor is not null and not exists (select 1 from public.profiles where id = actor) then
    actor := null;
  end if;
  if p_recipient_id is null or nullif(btrim(coalesce(p_dedupe_key, '')), '') is null then
    return null;
  end if;
  if actor is not null and p_recipient_id is not distinct from actor then
    return null;
  end if;

  select * into recipient from public.profiles where id = p_recipient_id;
  if recipient.id is null
     or recipient.status <> 'active'
     or recipient.must_change_password then
    return null;
  end if;

  -- Clients only receive the portal-facing events; staff never receive those
  -- same rows (file.shared / the client copy of delivery.ready use a distinct
  -- dedupe_key and are addressed only to client accounts).
  if recipient.role = 'client'::public.app_role then
    if p_event <> all (client_events) then
      return null;
    end if;
  else
    if p_event = 'file.shared' then
      return null;
    end if;
  end if;

  insert into public.notifications (
    recipient_id, actor_id, project_id, submission_id, task_id,
    type, event, title, message, action_url, metadata, dedupe_key
  ) values (
    p_recipient_id,
    actor,
    p_project_id,
    p_submission_id,
    p_task_id,
    p_type,
    p_event,
    p_title,
    p_message,
    p_action_url,
    coalesce(p_metadata, '{}'::jsonb),
    p_dedupe_key
  )
  on conflict (recipient_id, dedupe_key) do nothing
  returning id into inserted_id;

  return inserted_id;
end;
$$;

comment on function public.emit_in_app_notification(uuid, text, text, text, text, text, text, uuid, uuid, uuid, uuid, jsonb) is
  'Single in-app notification writer. Dedupes, skips the actor, skips inactive accounts. No email.';

create or replace function public.notify_staff_with_permission(
  p_permission text,
  p_event text,
  p_type text,
  p_title text,
  p_message text,
  p_action_url text,
  p_dedupe_prefix text,
  p_actor_id uuid default null,
  p_project_id uuid default null,
  p_submission_id uuid default null,
  p_task_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  sent integer := 0;
begin
  for rec in
    select p.id
    from public.profiles p
    where p.status = 'active'
      and p.role <> 'client'::public.app_role
      and not p.must_change_password
      and public.user_has_permission(p.id, p_permission)
  loop
    if public.emit_in_app_notification(
      rec.id, p_event, p_type, p_title, p_message, p_action_url,
      p_dedupe_prefix || ':' || rec.id::text,
      p_actor_id, p_project_id, p_submission_id, p_task_id, p_metadata
    ) is not null then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;

create or replace function public.notify_client_accounts(
  p_client_id uuid,
  p_event text,
  p_type text,
  p_title text,
  p_message text,
  p_action_url text,
  p_dedupe_prefix text,
  p_actor_id uuid default null,
  p_project_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  sent integer := 0;
begin
  if p_client_id is null then
    return 0;
  end if;
  for rec in
    select p.id
    from public.profiles p
    where p.client_id = p_client_id
      and p.role = 'client'::public.app_role
      and p.status = 'active'
      and not p.must_change_password
  loop
    if public.emit_in_app_notification(
      rec.id, p_event, p_type, p_title, p_message, p_action_url,
      p_dedupe_prefix || ':' || rec.id::text,
      p_actor_id, p_project_id, null, null, p_metadata
    ) is not null then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;

-- ── 3. New submission ───────────────────────────────────────────────────────
create or replace function public.notify_form_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  form_rec public.form_templates;
  client_display_name text;
  notif_title text;
  notif_message text;
  action text;
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
  return new;
end;
$$;

-- ── 4. Submission assigned / status changed ─────────────────────────────────
create or replace function public.notify_submission_review_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  form_rec public.form_templates;
  client_display text;
  actor_name text;
  reviewer_name text;
  action text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  select * into form_rec from public.form_templates where id = new.form_id;
  client_display := coalesce(
    nullif(btrim(new.company_name), ''),
    nullif(btrim(new.respondent_name), ''),
    nullif(btrim(new.respondent_email), ''),
    'a client'
  );
  actor_name := coalesce(public.notification_display_name(auth.uid()), 'A team member');
  action := '/submissions?submission=' || new.id::text;

  if new.reviewer_id is distinct from old.reviewer_id and new.reviewer_id is not null then
    perform public.emit_in_app_notification(
      new.reviewer_id,
      'submission.assigned',
      'assignment',
      'You were assigned to review a submission',
      'You were assigned to review the submission from ' || client_display
        || ' for form “' || coalesce(form_rec.title, 'Form') || '” by ' || actor_name || '.',
      action,
      'submission.assigned:' || new.id::text || ':' || new.reviewer_id::text,
      auth.uid(),
      new.project_id,
      new.id,
      null,
      jsonb_build_object(
        'submission_id', new.id,
        'form_id', new.form_id,
        'form_name', coalesce(form_rec.title, 'Form'),
        'client_name', client_display,
        'respondent_name', new.respondent_name,
        'respondent_email', new.respondent_email,
        'company_name', new.company_name,
        'assigned_by', actor_name,
        'assigned_at', now()
      )
    );
  end if;

  if new.status is distinct from old.status and new.status is distinct from 'converted' then
    select coalesce(nullif(trim(full_name), ''), email) into reviewer_name
    from public.profiles where id = new.reviewer_id;

    if new.reviewer_id is not null then
      perform public.emit_in_app_notification(
        new.reviewer_id,
        'submission.status_changed',
        'submission',
        'Submission status updated',
        'Submission from ' || client_display || ' moved from '
          || replace(old.status, '_', ' ') || ' to ' || replace(new.status, '_', ' ')
          || ' by ' || actor_name || '.',
        action,
        'submission.status_changed:' || new.id::text || ':' || new.status,
        auth.uid(),
        new.project_id,
        new.id,
        null,
        jsonb_build_object(
          'submission_id', new.id,
          'form_name', coalesce(form_rec.title, 'Form'),
          'client_name', client_display,
          'status', new.status,
          'previous_status', old.status,
          'reviewer_name', reviewer_name
        )
      );
    else
      perform public.notify_staff_with_permission(
        'submission.view',
        'submission.status_changed',
        'submission',
        'Submission status updated',
        'Submission from ' || client_display || ' moved from '
          || replace(old.status, '_', ' ') || ' to ' || replace(new.status, '_', ' ')
          || ' by ' || actor_name || '.',
        action,
        'submission.status_changed:' || new.id::text || ':' || new.status,
        auth.uid(),
        new.project_id,
        new.id,
        null,
        jsonb_build_object(
          'submission_id', new.id,
          'form_name', coalesce(form_rec.title, 'Form'),
          'client_name', client_display,
          'status', new.status,
          'previous_status', old.status
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_submission_review_events on public.form_submissions;
create trigger notify_submission_review_events
after update of reviewer_id, status on public.form_submissions
for each row execute function public.notify_submission_review_events();

-- The assignment RPC also inserted a notification directly. Route it through
-- emit so a re-assign of the same reviewer cannot create a second row. The
-- trigger above is the source of truth; drop the inline insert by wrapping
-- the existing insert in a no-op when a matching dedupe_key already exists.
-- We replace only the insert block by redefining the function from the last
-- shipped version, calling emit instead of a raw insert.

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
  clean_note text := btrim(coalesce(p_note, ''));
  action_event_type text;
  now_ts timestamptz := now();
  actor_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.has_permission('submission.assign') then
    raise exception 'Not authorized to assign submissions';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active' then
    raise exception 'User is not active';
  end if;

  select * into sub_rec from public.form_submissions where id = p_submission_id;
  if sub_rec.id is null then raise exception 'Submission not found'; end if;

  old_reviewer_id := sub_rec.reviewer_id;
  if old_reviewer_id is not null then
    select coalesce(nullif(full_name, ''), email) into old_reviewer_name
    from public.profiles where id = old_reviewer_id;
  end if;

  actor_name := coalesce(nullif(caller_profile.full_name, ''), caller_profile.email, 'An administrator');

  if p_reviewer_id is not null then
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
      p_submission_id, auth.uid(), action_event_type, old_reviewer_name, new_reviewer_name,
      case when length(clean_note) > 0 then clean_note else null end,
      jsonb_build_object(
        'reviewer_id', p_reviewer_id,
        'reviewer_name', new_reviewer_name,
        'previous_reviewer_id', old_reviewer_id,
        'actor_name', actor_name
      )
    );
    -- Inbox row is written by notify_submission_review_events.
  else
    update public.form_submissions
       set reviewer_id = null, reviewed_at = null, updated_at = now_ts
     where id = p_submission_id;

    if length(clean_note) > 0 then
      insert into public.form_submission_notes (submission_id, author_id, note)
      values (p_submission_id, auth.uid(), clean_note);
    end if;

    insert into public.form_submission_events (
      submission_id, actor_id, event_type, old_value, new_value, note, metadata
    ) values (
      p_submission_id, auth.uid(), 'reviewer_unassigned', old_reviewer_name, null,
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

-- ── 5. Project created / assigned / team member ─────────────────────────────
create or replace function public.notify_project_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text := coalesce(public.notification_display_name(auth.uid()), 'A team member');
  meta jsonb;
begin
  meta := jsonb_build_object(
    'project_id', new.id,
    'project_name', new.name,
    'status', new.status,
    'assigned_by', actor_name
  );

  if new.owner_id is not null then
    perform public.emit_in_app_notification(
      new.owner_id,
      'project.created',
      'project_update',
      'New project created',
      '“' || new.name || '” was created and you are the project owner.',
      '/projects/' || new.id::text,
      'project.created:' || new.id::text || ':' || new.owner_id::text,
      auth.uid(), new.id, null, null, meta || jsonb_build_object('role', 'owner')
    );
  end if;

  if new.manager_id is not null and new.manager_id is distinct from new.owner_id then
    perform public.emit_in_app_notification(
      new.manager_id,
      'project.created',
      'project_update',
      'New project created',
      '“' || new.name || '” was created and you are the project manager.',
      '/projects/' || new.id::text,
      'project.created:' || new.id::text || ':' || new.manager_id::text,
      auth.uid(), new.id, null, null, meta || jsonb_build_object('role', 'manager')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_project_created on public.projects;
create trigger notify_project_created
after insert on public.projects
for each row execute function public.notify_project_created();

-- Owner / manager change only. The previous blast to every member on any
-- status/progress/health edit duplicated delivery.ready and assignment rows.
create or replace function public.notify_project_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text := coalesce(public.notification_display_name(auth.uid()), 'A team member');
begin
  if new.owner_id is distinct from old.owner_id and new.owner_id is not null then
    perform public.emit_in_app_notification(
      new.owner_id,
      'project.assigned',
      'assignment',
      'You were assigned as project owner',
      actor_name || ' assigned you as owner of “' || new.name || '”.',
      '/projects/' || new.id::text,
      'project.assigned:' || new.id::text || ':' || new.owner_id::text || ':owner',
      auth.uid(), new.id, null, null,
      jsonb_build_object('project_id', new.id, 'project_name', new.name, 'role', 'owner', 'assigned_by', actor_name)
    );
  end if;

  if new.manager_id is distinct from old.manager_id and new.manager_id is not null then
    perform public.emit_in_app_notification(
      new.manager_id,
      'project.assigned',
      'assignment',
      'You were assigned as project manager',
      actor_name || ' assigned you as manager of “' || new.name || '”.',
      '/projects/' || new.id::text,
      'project.assigned:' || new.id::text || ':' || new.manager_id::text || ':manager',
      auth.uid(), new.id, null, null,
      jsonb_build_object('project_id', new.id, 'project_name', new.name, 'role', 'manager', 'assigned_by', actor_name)
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_project_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_rec public.projects;
  assigner_name text;
begin
  select * into proj_rec from public.projects where id = new.project_id;
  if proj_rec.id is null then
    return new;
  end if;

  -- Owner / manager already received project.created or project.assigned.
  if new.user_id is not distinct from proj_rec.owner_id
     or new.user_id is not distinct from proj_rec.manager_id then
    return new;
  end if;

  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'An administrator')
    into assigner_name
  from public.profiles
  where id = coalesce(new.assigned_by, auth.uid());

  if assigner_name is null then
    assigner_name := 'An administrator';
  end if;

  perform public.emit_in_app_notification(
    new.user_id,
    'team_member.assigned',
    'assignment',
    'You have been assigned to a new project',
    'You were assigned to project “' || coalesce(proj_rec.name, 'a project')
      || '” (Status: ' || coalesce(proj_rec.status::text, 'active') || ') by ' || assigner_name || '.',
    '/projects/' || new.project_id::text,
    'team_member.assigned:' || new.project_id::text || ':' || new.user_id::text,
    coalesce(new.assigned_by, auth.uid()),
    new.project_id,
    null,
    null,
    jsonb_build_object(
      'project_id', new.project_id,
      'project_name', coalesce(proj_rec.name, 'Project'),
      'assigned_by', assigner_name,
      'status', coalesce(proj_rec.status::text, 'active'),
      'assigned_at', now()
    )
  );
  return new;
end;
$$;

-- ── 6. Task assigned / updated ──────────────────────────────────────────────
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
  if new.assignee_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;

  select * into proj_rec from public.projects where id = new.project_id;
  assigner_name := coalesce(
    public.notification_display_name(coalesce(auth.uid(), new.created_by)),
    'A team member'
  );

  perform public.emit_in_app_notification(
    new.assignee_id,
    'task.assigned',
    'task_assignment',
    'New task assignment: ' || new.title,
    'You were assigned “' || new.title || '” in project “'
      || coalesce(proj_rec.name, 'a project') || '” by ' || assigner_name
      || case when new.due_date is not null then ' (Due: ' || to_char(new.due_date, 'YYYY-MM-DD') || ')' else '' end
      || '.',
    '/my-work?task=' || new.id::text,
    'task.assigned:' || new.id::text || ':' || new.assignee_id::text,
    coalesce(auth.uid(), new.created_by),
    new.project_id,
    null,
    new.id,
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
  return new;
end;
$$;

create or replace function public.notify_task_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_rec public.projects;
  actor_name text;
  bits text := '';
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if new.assignee_id is null then
    return new;
  end if;
  -- Assignment is its own event.
  if new.assignee_id is distinct from old.assignee_id
     and new.status is not distinct from old.status
     and new.priority is not distinct from old.priority
     and new.due_date is not distinct from old.due_date
     and new.title is not distinct from old.title then
    return new;
  end if;
  if (new.status, new.priority, new.due_date, new.title)
     is not distinct from (old.status, old.priority, old.due_date, old.title) then
    return new;
  end if;

  select * into proj_rec from public.projects where id = new.project_id;
  actor_name := coalesce(public.notification_display_name(auth.uid()), 'A team member');

  if new.status is distinct from old.status then
    bits := bits || 'status → ' || new.status;
  end if;
  if new.priority is distinct from old.priority then
    bits := bits || case when bits <> '' then ', ' else '' end || 'priority → ' || new.priority;
  end if;
  if new.due_date is distinct from old.due_date then
    bits := bits || case when bits <> '' then ', ' else '' end
      || 'due date → ' || coalesce(to_char(new.due_date, 'YYYY-MM-DD'), 'none');
  end if;
  if new.title is distinct from old.title then
    bits := bits || case when bits <> '' then ', ' else '' end || 'title updated';
  end if;

  perform public.emit_in_app_notification(
    new.assignee_id,
    'task.updated',
    'task_update',
    'Task updated: ' || new.title,
    actor_name || ' updated “' || new.title || '” in “'
      || coalesce(proj_rec.name, 'a project') || '” (' || bits || ').',
    '/my-work?task=' || new.id::text,
    'task.updated:' || new.id::text || ':' || coalesce(new.status, '') || ':'
      || coalesce(new.priority, '') || ':' || coalesce(new.due_date::text, '') || ':' || md5(new.title),
    auth.uid(),
    new.project_id,
    null,
    new.id,
    jsonb_build_object(
      'task_id', new.id,
      'task_title', new.title,
      'project_id', new.project_id,
      'project_name', coalesce(proj_rec.name, 'Project'),
      'status', new.status,
      'priority', new.priority,
      'due_date', new.due_date
    )
  );
  return new;
end;
$$;

drop trigger if exists notify_task_updated on public.tasks;
create trigger notify_task_updated
after update of status, priority, due_date, title on public.tasks
for each row execute function public.notify_task_updated();

-- ── 7. Client feedback / approval / revision (reuse existing helper) ────────
create or replace function public.notify_project_owners(
  p_project_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_action_url text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  ev text;
  dedupe text;
  recipient uuid;
begin
  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then
    return;
  end if;

  ev := case p_type
    when 'client_feedback' then 'client.feedback'
    when 'client_approval' then 'client.approval'
    when 'client_revision' then 'client.revision'
    else 'client.feedback'
  end;

  dedupe := ev || ':' || p_project_id::text || ':' || coalesce(
    p_metadata->>'message_id',
    p_metadata->>'delivery_id',
    md5(coalesce(p_message, p_title, ''))
  );

  foreach recipient in array array[proj.owner_id, proj.manager_id]
  loop
    perform public.emit_in_app_notification(
      recipient, ev, p_type, p_title, p_message, p_action_url,
      dedupe || ':' || recipient::text,
      auth.uid(), proj.id, null, null, coalesce(p_metadata, '{}'::jsonb)
    );
  end loop;
end;
$$;

-- ── 8. File shared → client portal accounts ─────────────────────────────────
create or replace function public.share_project_file_with_client(
  p_project_id uuid,
  p_file_id uuid,
  p_note text default null
)
returns public.client_shared_files
language plpgsql
security definer
set search_path = public
as $$
declare
  file_rec public.files;
  row public.client_shared_files;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  proj public.projects;
  actor_name text;
begin
  perform public.assert_staff_can_access_project(p_project_id);
  if not (
    public.has_permission('project.edit')
    or public.has_permission('file.upload')
    or public.has_permission('portal.collaborate')
  ) then
    raise exception 'You do not have permission to share files with the client.';
  end if;

  select * into file_rec from public.files where id = p_file_id;
  if file_rec.id is null or file_rec.project_id is distinct from p_project_id then
    raise exception 'Choose a file that belongs to this project.';
  end if;

  insert into public.client_shared_files (project_id, file_id, shared_by, note)
  values (p_project_id, p_file_id, auth.uid(), clean_note)
  on conflict (project_id, file_id) do update
    set note = coalesce(excluded.note, public.client_shared_files.note),
        shared_by = excluded.shared_by,
        shared_at = now()
  returning * into row;

  insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
  values (
    p_project_id, auth.uid(), 'file_shared', file_rec.name,
    jsonb_build_object('file_id', p_file_id, 'shared_file_id', row.id)
  );

  select * into proj from public.projects where id = p_project_id;
  actor_name := coalesce(public.notification_display_name(auth.uid()), 'Your team');

  perform public.notify_client_accounts(
    proj.client_id,
    'file.shared',
    'file_shared',
    'A file was shared on ' || proj.name,
    actor_name || ' shared “' || file_rec.name || '” on “' || proj.name || '”.',
    '/portal/projects/' || p_project_id::text,
    'file.shared:' || p_project_id::text || ':' || p_file_id::text,
    auth.uid(),
    p_project_id,
    jsonb_build_object(
      'project_id', p_project_id,
      'project_name', proj.name,
      'file_id', p_file_id,
      'file_name', file_rec.name
    )
  );
  return row;
end;
$$;

-- ── 9. Delivery ready ───────────────────────────────────────────────────────
-- Staff are notified when the package becomes ready. Clients are notified
-- when the package is actually delivered (the moment it is visible to them).
create or replace function public.notify_delivery_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  actor_name text;
  recipient uuid;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select * into proj from public.projects where id = new.project_id;
  if proj.id is null then
    return new;
  end if;
  actor_name := coalesce(public.notification_display_name(auth.uid()), 'A team member');

  if new.status in ('ready', 'delivered') then
    for recipient in
      select distinct uid
      from unnest(
        array[proj.owner_id, proj.manager_id] || coalesce((
          select array_agg(pm.user_id) from public.project_members pm where pm.project_id = proj.id
        ), '{}'::uuid[])
      ) as uid
      where uid is not null
    loop
      perform public.emit_in_app_notification(
        recipient,
        'delivery.ready',
        'delivery_ready',
        'Delivery ready: ' || proj.name,
        actor_name || ' marked delivery v' || new.version::text
          || case when new.status = 'delivered' then ' delivered' else ' ready' end
          || ' on “' || proj.name || '”.',
        '/projects/' || proj.id::text,
        'delivery.ready:' || proj.id::text || ':' || new.version::text || ':' || recipient::text,
        auth.uid(),
        proj.id,
        null,
        null,
        jsonb_build_object(
          'project_id', proj.id,
          'project_name', proj.name,
          'delivery_id', new.id,
          'version', new.version,
          'status', new.status
        )
      );
    end loop;
  end if;

  if new.status = 'delivered' then
    perform public.notify_client_accounts(
      proj.client_id,
      'delivery.ready',
      'delivery_ready',
      'Your delivery is ready',
      'Delivery v' || new.version::text || ' for “' || proj.name || '” is ready to review.',
      '/portal/projects/' || proj.id::text,
      'delivery.ready.client:' || proj.id::text || ':' || new.version::text,
      auth.uid(),
      proj.id,
      jsonb_build_object(
        'project_id', proj.id,
        'project_name', proj.name,
        'delivery_id', new.id,
        'version', new.version,
        'status', new.status
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_delivery_ready on public.project_deliveries;
create trigger notify_delivery_ready
after insert or update of status on public.project_deliveries
for each row execute function public.notify_delivery_ready();

-- ── 10. Grants ──────────────────────────────────────────────────────────────
revoke all on function public.notification_display_name(uuid) from public, anon;
revoke all on function public.emit_in_app_notification(uuid, text, text, text, text, text, text, uuid, uuid, uuid, uuid, jsonb) from public, anon;
revoke all on function public.notify_staff_with_permission(text, text, text, text, text, text, text, uuid, uuid, uuid, uuid, jsonb) from public, anon;
revoke all on function public.notify_client_accounts(uuid, text, text, text, text, text, text, uuid, uuid, jsonb) from public, anon;

-- Keep the existing grants on the public RPCs we replaced.
revoke all on function public.share_project_file_with_client(uuid, uuid, text) from public, anon;
grant execute on function public.share_project_file_with_client(uuid, uuid, text) to authenticated;
revoke all on function public.assign_form_submission_reviewer(uuid, uuid, text) from public, anon;
grant execute on function public.assign_form_submission_reviewer(uuid, uuid, text) to authenticated;

commit;
