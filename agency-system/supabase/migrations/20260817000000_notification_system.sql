-- Notification System: Form submissions, project assignments, task assignments, and persistence
-- Enables automatic notifications for Admins on form submission and Employees on project/task assignment.

begin;

-- 1. Ensure columns and constraints on public.notifications
alter table public.notifications add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.notifications add column if not exists submission_id uuid references public.form_submissions(id) on delete cascade;
alter table public.notifications add column if not exists task_id uuid references public.tasks(id) on delete cascade;

comment on column public.notifications.metadata is 'Rich structured metadata (submission details, assigner info, form name, client name, etc.)';
comment on column public.notifications.submission_id is 'Direct foreign key link to form_submissions when applicable';
comment on column public.notifications.task_id is 'Direct foreign key link to tasks when applicable';

-- Widen type check constraint to include all supported notification types
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in ('info', 'assignment', 'project_update', 'task_update', 'task_assignment', 'form_submission', 'submission')
);

create index if not exists idx_notifications_recipient on public.notifications(recipient_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications(recipient_id) where read_at is null;
create index if not exists idx_notifications_submission on public.notifications(submission_id);
create index if not exists idx_notifications_task on public.notifications(task_id);


-- 2. Trigger: Notify Admins when a Dynamic Form is submitted
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
begin
  select * into form_rec from public.form_templates where id = new.form_id;

  client_display_name := coalesce(
    nullif(trim(new.respondent_name), ''),
    nullif(trim(new.company_name), ''),
    nullif(trim(new.respondent_email), ''),
    'Anonymous client'
  );

  notif_title := 'New ' || coalesce(form_rec.title, 'Form') || ' submission';
  notif_message := 'New submission #' || substring(new.id::text, 1, 8) || ' received from ' || client_display_name || ' for ' || coalesce(form_rec.title, 'Form') || '.';

  insert into public.notifications (
    recipient_id,
    actor_id,
    project_id,
    submission_id,
    type,
    title,
    message,
    action_url,
    metadata
  )
  select
    p.id,
    (select id from public.profiles where id = auth.uid()),
    new.project_id,
    new.id,
    'form_submission',
    notif_title,
    notif_message,
    '/admin/forms/' || new.form_id::text || '?tab=submissions&submission=' || new.id::text,
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
      'submitted_at', new.submitted_at
    )
  from public.profiles p
  where p.status = 'active'
    and (
      p.role = 'admin'::public.app_role
      or exists (
        select 1 from public.role_permissions rp
        join public.permissions perm on perm.id = rp.permission_id
        where rp.role_id = p.role_id and perm.key = 'admin.manage'
      )
    );

  return new;
end;
$$;

drop trigger if exists notify_form_submission on public.form_submissions;
create trigger notify_form_submission after insert on public.form_submissions
for each row execute function public.notify_form_submission();


-- 3. Trigger: Notify Admins when an Intake Form is submitted
create or replace function public.notify_intake_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_display_name text;
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    client_display_name := coalesce(
      nullif(trim(new.contact_name), ''),
      nullif(trim(new.company_name), ''),
      nullif(trim(new.contact_email), ''),
      'Anonymous client'
    );

    insert into public.notifications (
      recipient_id,
      actor_id,
      project_id,
      type,
      title,
      message,
      action_url,
      metadata
    )
    select
      p.id,
      (select id from public.profiles where id = auth.uid()),
      new.project_id,
      'submission',
      'New intake form submission',
      'New intake #' || substring(new.id::text, 1, 8) || ' submitted by ' || client_display_name || '.',
      '/intake?id=' || new.id::text,
      jsonb_build_object(
        'intake_id', new.id,
        'client_name', client_display_name,
        'contact_email', new.contact_email,
        'contact_phone', new.phone,
        'company_name', new.company_name,
        'services', new.service_types,
        'submitted_at', coalesce(new.submitted_at, now())
      )
    from public.profiles p
    where p.status = 'active'
      and (
        p.role = 'admin'::public.app_role
        or exists (
          select 1 from public.role_permissions rp
          join public.permissions perm on perm.id = rp.permission_id
          where rp.role_id = p.role_id and perm.key = 'admin.manage'
        )
      );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_intake_submission on public.intake_forms;
create trigger notify_intake_submission after insert or update of status on public.intake_forms
for each row execute function public.notify_intake_submission();


-- 4. Trigger: Notify Employee on Project Assignment
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

  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'An administrator')
  into assigner_name
  from public.profiles
  where id = coalesce(new.assigned_by, auth.uid());

  if assigner_name is null then
    assigner_name := 'An administrator';
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    project_id,
    type,
    title,
    message,
    action_url,
    metadata
  )
  values (
    new.user_id,
    coalesce(new.assigned_by, (select id from public.profiles where id = auth.uid())),
    new.project_id,
    'assignment',
    'You have been assigned to a new project',
    'You were assigned to project “' || coalesce(proj_rec.name, 'a project') || '” (Status: ' || coalesce(proj_rec.status::text, 'active') || ') by ' || assigner_name || '.',
    '/projects/' || new.project_id::text,
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

drop trigger if exists notify_project_assignment on public.project_members;
create trigger notify_project_assignment after insert on public.project_members
for each row execute function public.notify_project_assignment();


-- 5. Trigger: Notify Employee on Task Assignment
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
      '/projects/' || new.project_id::text || '?task=' || new.id::text,
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

drop trigger if exists notify_task_assignment on public.tasks;
create trigger notify_task_assignment after insert or update of assignee_id on public.tasks
for each row execute function public.notify_task_assignment();


-- 6. Ensure strict RLS on notifications table
alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (public.is_active() and public.has_permission('notification.view') and recipient_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (public.is_active() and public.has_permission('notification.view') and recipient_id = auth.uid())
  with check (public.is_active() and public.has_permission('notification.view') and recipient_id = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (public.is_active() and public.has_permission('notification.view') and recipient_id = auth.uid());

revoke all on public.notifications from anon;
grant select, update (read_at), delete on public.notifications to authenticated;

commit;
