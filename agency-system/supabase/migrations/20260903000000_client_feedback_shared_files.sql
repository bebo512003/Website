-- Session 18 — Client Feedback, Shared Files & Approval
--
-- Extends the invitation-only Client Portal with a collaboration layer that is
-- deliberately SEPARATE from internal staff data:
--
--   * `client_shared_files`     — only files staff select (or that sit on a
--                                 delivered package) are visible to the client.
--   * `client_messages`         — client-visible conversation. Internal
--                                 discussion stays in `comments` and is never
--                                 readable by client accounts.
--   * `client_approvals`        — client-owned approval / revision / feedback
--                                 actions. Session 15 reserved this table so
--                                 clients never write `project_deliveries`
--                                 directly; SECURITY DEFINER RPCs apply the
--                                 operational side-effects.
--
-- Isolation rules (enforced in PostgreSQL, not only the UI):
--   * Clients never SELECT the raw `files`, `comments`, `project_deliveries`,
--     `project_delivery_files`, or `project_activity` tables.
--   * Portal reads/writes go through SECURITY DEFINER RPCs scoped to
--     `client_portal_client_id()`.
--   * Storage SELECT on `project-files` is allowed for a client only when the
--     object is a shared or delivered file on their own project.
--   * Client feedback notifies the project owner (and manager, if different).
--   * Approval updates the delivery package + completion blockers.
--   * A client revision request is a first-class operational event and opens
--     a new preparing package (same path as a staff revision).

begin;

-- ── 1. Catalog / constraint extensions ──────────────────────────────────────
insert into public.permissions (key, name, category, description) values
  ('portal.collaborate', 'Client portal collaboration', 'portal',
   'Share selected files with a client and post client-visible messages.')
on conflict (key) do update set
  name = excluded.name, category = excluded.category, description = excluded.description;

-- Admin and Manager can share files / reply to the client by default.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r, public.permissions p
where r.key in ('admin', 'manager') and p.key = 'portal.collaborate'
on conflict do nothing;

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
    'client_revision'
  )
);

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
    'unarchived',
    'file_shared',
    'file_unshared',
    'client_feedback',
    'client_approved',
    'client_revision_requested'
  )
);

alter table public.project_deliveries drop constraint if exists project_deliveries_approval_state_check;
alter table public.project_deliveries add constraint project_deliveries_approval_state_check check (
  approval_state in (
    'not_requested',
    'awaiting_client',
    'approved_internally',
    'revision_required',
    'approved_by_client'
  )
);

comment on column public.project_deliveries.approval_state is
  'Staff placeholder (approved_internally / awaiting_client) OR a real client-portal action (approved_by_client). Clients never write this column directly.';

-- ── 2. Client-visible tables (never mixed with internal comments) ───────────
create table if not exists public.client_shared_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  shared_by uuid references public.profiles(id) on delete set null default auth.uid(),
  note text,
  shared_at timestamptz not null default now(),
  unique (project_id, file_id)
);

comment on table public.client_shared_files is
  'Explicit allow-list of project files a client may see. Working files stay private until shared, or until they sit on a delivered package.';

create index if not exists idx_client_shared_files_project on public.client_shared_files(project_id);
create index if not exists idx_client_shared_files_file on public.client_shared_files(file_id);

create table if not exists public.client_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  body text not null,
  kind text not null default 'message' check (kind in ('message', 'feedback', 'approval', 'revision')),
  created_at timestamptz not null default now()
);

comment on table public.client_messages is
  'Client-visible conversation. Internal staff discussion lives in `comments` and is never readable by client accounts.';

create index if not exists idx_client_messages_project on public.client_messages(project_id, created_at);

create table if not exists public.client_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  delivery_id uuid references public.project_deliveries(id) on delete set null,
  action text not null check (action in ('approved', 'revision_requested', 'feedback')),
  message text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.client_approvals is
  'Client-owned operational actions (approve / request revision / feedback). The only table a client action may write. Side-effects on delivery/project state happen inside SECURITY DEFINER RPCs.';

create index if not exists idx_client_approvals_project on public.client_approvals(project_id, created_at desc);

-- ── 3. RLS — staff read; clients never touch the raw tables ─────────────────
alter table public.client_shared_files enable row level security;
alter table public.client_messages enable row level security;
alter table public.client_approvals enable row level security;

drop policy if exists client_shared_files_select_staff on public.client_shared_files;
create policy client_shared_files_select_staff on public.client_shared_files
  for select to authenticated
  using (
    public.is_staff()
    and public.can_access_project(project_id)
  );

drop policy if exists client_messages_select_staff on public.client_messages;
create policy client_messages_select_staff on public.client_messages
  for select to authenticated
  using (
    public.is_staff()
    and public.can_access_project(project_id)
  );

drop policy if exists client_messages_insert_staff on public.client_messages;
create policy client_messages_insert_staff on public.client_messages
  for insert to authenticated
  with check (
    public.is_staff()
    and author_id = auth.uid()
    and public.can_access_project(project_id)
    and kind = 'message'
  );

drop policy if exists client_approvals_select_staff on public.client_approvals;
create policy client_approvals_select_staff on public.client_approvals
  for select to authenticated
  using (
    public.is_staff()
    and public.can_access_project(project_id)
  );

grant select on public.client_shared_files to authenticated;
grant select, insert on public.client_messages to authenticated;
grant select on public.client_approvals to authenticated;
revoke all on public.client_shared_files from anon;
revoke all on public.client_messages from anon;
revoke all on public.client_approvals from anon;

-- Defence in depth: internal comments are staff-only, even if project access
-- helpers are ever loosened for the portal.
drop policy if exists comments_select_authorized on public.comments;
create policy comments_select_authorized on public.comments
  for select to authenticated
  using (
    public.is_staff()
    and public.can_access_entity(entity_type, entity_id)
  );

drop policy if exists comments_insert_authorized on public.comments;
create policy comments_insert_authorized on public.comments
  for insert to authenticated
  with check (
    public.is_staff()
    and author_id = auth.uid()
    and public.can_access_entity(entity_type, entity_id)
  );

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments
  for update to authenticated
  using (public.is_staff() and public.is_active() and author_id = auth.uid())
  with check (
    public.is_staff()
    and author_id = auth.uid()
    and public.can_access_entity(entity_type, entity_id)
  );

drop policy if exists comments_delete_own_or_management on public.comments;
create policy comments_delete_own_or_management on public.comments
  for delete to authenticated
  using (
    public.is_staff()
    and public.is_active()
    and (author_id = auth.uid() or public.is_admin())
  );

comment on table public.comments is
  'INTERNAL staff discussion. Clients have no SELECT/INSERT. Client-visible messages live in `client_messages`.';

-- ── 4. Identity / visibility helpers ────────────────────────────────────────
create or replace function public.client_owns_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_project_id is not null
    and public.client_portal_client_id() is not null
    and exists (
      select 1 from public.projects p
      where p.id = p_project_id
        and p.client_id = public.client_portal_client_id()
    );
$$;

comment on function public.client_owns_project(uuid) is
  'True when the caller is an active client account and the project belongs to their CRM record.';

create or replace function public.client_can_read_file(p_file_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  my_client_id uuid := public.client_portal_client_id();
  file_project uuid;
  file_client uuid;
begin
  if my_client_id is null or p_file_id is null then
    return false;
  end if;
  if public.must_change_password_pending() then
    return false;
  end if;

  select f.project_id, p.client_id
    into file_project, file_client
  from public.files f
  join public.projects p on p.id = f.project_id
  where f.id = p_file_id;

  if file_project is null or file_client is distinct from my_client_id then
    return false;
  end if;

  if exists (
    select 1 from public.client_shared_files s
    where s.file_id = p_file_id and s.project_id = file_project
  ) then
    return true;
  end if;

  -- Delivered / approved package files are "selected" as the final set.
  return exists (
    select 1
    from public.project_delivery_files df
    join public.project_deliveries d on d.id = df.delivery_id
    where df.file_id = p_file_id
      and d.project_id = file_project
      and d.status in ('delivered', 'approved')
  );
end;
$$;

create or replace function public.client_can_read_storage_object(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  file_id uuid;
begin
  if p_object_name is null or btrim(p_object_name) = '' then
    return false;
  end if;
  select id into file_id from public.files where storage_path = p_object_name;
  if file_id is null then
    return false;
  end if;
  return public.client_can_read_file(file_id);
end;
$$;

-- Storage: clients may SELECT (and therefore create a signed URL for) only
-- the files the helpers above accept. No insert/update/delete.
drop policy if exists project_files_select_client on storage.objects;
create policy project_files_select_client on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-files'
    and public.client_can_read_storage_object(name)
  );

-- ── 5. Completion blockers accept a real client approval ────────────────────
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
  if pkg.approval_state not in ('approved_internally', 'approved_by_client') then
    blockers := blockers || 'Record client approval or the internal approval placeholder';
  end if;
  return blockers;
end;
$$;

-- ── 6. Auto-share delivered files ───────────────────────────────────────────
create or replace function public.share_delivered_files_with_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('delivered', 'approved')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.client_shared_files (project_id, file_id, shared_by, note)
    select new.project_id, df.file_id, coalesce(new.delivered_by, auth.uid()),
           'Shared automatically with the client as part of delivery v' || new.version::text
    from public.project_delivery_files df
    where df.delivery_id = new.id
    on conflict (project_id, file_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists share_delivered_files_with_client on public.project_deliveries;
create trigger share_delivered_files_with_client
after insert or update of status on public.project_deliveries
for each row execute function public.share_delivered_files_with_client();

-- ── 7. Notify the project owner (and manager) ───────────────────────────────
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
begin
  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then
    return;
  end if;

  insert into public.notifications (
    recipient_id, actor_id, project_id, type, title, message, action_url, metadata
  )
  select distinct recipient.id, auth.uid(), proj.id, p_type, p_title, p_message, p_action_url, coalesce(p_metadata, '{}'::jsonb)
  from public.profiles recipient
  where recipient.status = 'active'
    and recipient.role <> 'client'::public.app_role
    and recipient.id is distinct from auth.uid()
    and recipient.id in (proj.owner_id, proj.manager_id)
    and recipient.id is not null;
end;
$$;

-- ── 8. Staff RPCs: share files + client-visible replies ─────────────────────
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
  return row;
end;
$$;

create or replace function public.unshare_project_file_with_client(p_project_id uuid, p_file_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  file_name text;
begin
  perform public.assert_staff_can_access_project(p_project_id);
  if not (
    public.has_permission('project.edit')
    or public.has_permission('file.upload')
    or public.has_permission('portal.collaborate')
  ) then
    raise exception 'You do not have permission to change the client file set.';
  end if;

  select name into file_name from public.files where id = p_file_id;
  delete from public.client_shared_files
  where project_id = p_project_id and file_id = p_file_id;
  if not found then
    raise exception 'That file is not in the client-shared set.';
  end if;

  insert into public.project_activity (project_id, actor_id, event_type, old_value, metadata)
  values (
    p_project_id, auth.uid(), 'file_unshared', file_name,
    jsonb_build_object('file_id', p_file_id)
  );
  return true;
end;
$$;

create or replace function public.add_client_visible_message(p_project_id uuid, p_body text)
returns public.client_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  row public.client_messages;
  clean_body text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_staff() or public.must_change_password_pending() then
    raise exception 'Only staff can post a client-visible reply from the workspace.';
  end if;
  if not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to this project.';
  end if;
  if length(clean_body) = 0 then
    raise exception 'A message cannot be empty.';
  end if;
  if length(clean_body) > 4000 then
    raise exception 'A message cannot be longer than 4000 characters.';
  end if;

  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then raise exception 'Project not found'; end if;

  insert into public.client_messages (project_id, author_id, body, kind)
  values (p_project_id, auth.uid(), clean_body, 'message')
  returning * into row;
  return row;
end;
$$;

-- ── 9. Client portal RPCs ───────────────────────────────────────────────────
create or replace function public.assert_client_portal_project(p_project_id uuid)
returns public.projects
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  proj public.projects;
  my_client_id uuid := public.client_portal_client_id();
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if my_client_id is null then
    raise exception 'Client portal access is not available for this account.';
  end if;
  if public.must_change_password_pending() then
    raise exception 'Replace the temporary password before using the portal.';
  end if;
  select * into proj from public.projects where id = p_project_id;
  if proj.id is null or proj.client_id is distinct from my_client_id then
    raise exception 'This project does not exist or is not linked to your account.';
  end if;
  return proj;
end;
$$;

create or replace function public.get_client_portal_collaboration(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  my_id uuid := auth.uid();
  can_act boolean := false;
begin
  proj := public.assert_client_portal_project(p_project_id);
  select * into pkg from public.current_project_delivery(p_project_id);

  can_act := proj.archived_at is null
    and proj.status in ('ready-for-delivery', 'delivered')
    and pkg.id is not null
    and pkg.status in ('delivered', 'approved')
    and pkg.approval_state is distinct from 'approved_by_client';

  return jsonb_build_object(
    'project_status', proj.status,
    'archived', proj.archived_at is not null,
    'can_approve', can_act and proj.status = 'delivered' and pkg.status in ('delivered', 'approved'),
    'can_request_revision', can_act,
    'delivery', case
      when pkg.id is not null and pkg.status in ('delivered', 'approved', 'revision_requested') then
        jsonb_build_object(
          'id', pkg.id,
          'version', pkg.version,
          'status', pkg.status,
          'delivered_at', pkg.delivered_at,
          'approval_state', case
            when pkg.approval_state = 'approved_by_client' then 'approved_by_client'
            when pkg.approval_state = 'revision_required' then 'revision_required'
            when pkg.status in ('delivered', 'approved') then 'awaiting_you'
            else 'not_ready'
          end
        )
      else null
    end,
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'type', f.type,
        'size', f.size,
        'mime_type', f.mime_type,
        'storage_path', f.storage_path,
        'created_at', f.created_at,
        'source', case
          when exists (
            select 1 from public.project_delivery_files df
            join public.project_deliveries d on d.id = df.delivery_id
            where df.file_id = f.id and d.project_id = proj.id and d.status in ('delivered', 'approved')
          ) and exists (
            select 1 from public.client_shared_files s
            where s.file_id = f.id and s.project_id = proj.id
          ) then 'both'
          when exists (
            select 1 from public.project_delivery_files df
            join public.project_deliveries d on d.id = df.delivery_id
            where df.file_id = f.id and d.project_id = proj.id and d.status in ('delivered', 'approved')
          ) then 'delivery'
          else 'shared'
        end
      ) order by f.created_at desc)
      from public.files f
      where f.project_id = proj.id
        and public.client_can_read_file(f.id)
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'body', m.body,
        'kind', m.kind,
        'created_at', m.created_at,
        'mine', m.author_id = my_id,
        'author_label', case
          when m.author_id = my_id then 'You'
          when author.role = 'client'::public.app_role then coalesce(nullif(trim(author.full_name), ''), 'Your account')
          else coalesce(nullif(trim(author.full_name), ''), 'Your team')
        end,
        'from_client', coalesce(author.role = 'client'::public.app_role, false)
      ) order by m.created_at)
      from public.client_messages m
      left join public.profiles author on author.id = m.author_id
      where m.project_id = proj.id
    ), '[]'::jsonb),
    'approvals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'action', a.action,
        'message', a.message,
        'created_at', a.created_at
      ) order by a.created_at)
      from public.client_approvals a
      where a.project_id = proj.id
        and a.created_by = my_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.add_client_portal_feedback(p_project_id uuid, p_body text)
returns public.client_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  row public.client_messages;
  clean_body text := btrim(coalesce(p_body, ''));
  actor_name text;
begin
  proj := public.assert_client_portal_project(p_project_id);
  if length(clean_body) = 0 then
    raise exception 'Feedback cannot be empty.';
  end if;
  if length(clean_body) > 4000 then
    raise exception 'Feedback cannot be longer than 4000 characters.';
  end if;

  insert into public.client_messages (project_id, author_id, body, kind)
  values (p_project_id, auth.uid(), clean_body, 'feedback')
  returning * into row;

  insert into public.client_approvals (project_id, action, message, created_by)
  values (p_project_id, 'feedback', clean_body, auth.uid());

  insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
  values (
    p_project_id, auth.uid(), 'client_feedback', left(clean_body, 280),
    jsonb_build_object('message_id', row.id, 'client_facing', true)
  );

  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'The client')
    into actor_name
  from public.profiles where id = auth.uid();

  perform public.notify_project_owners(
    p_project_id,
    'client_feedback',
    'Client feedback on ' || proj.name,
    coalesce(actor_name, 'The client') || ' left feedback on “' || proj.name || '”: ' || left(clean_body, 180),
    '/projects/' || p_project_id::text,
    jsonb_build_object(
      'project_id', p_project_id,
      'project_name', proj.name,
      'message_id', row.id,
      'kind', 'feedback'
    )
  );
  return row;
end;
$$;

create or replace function public.approve_client_portal_delivery(p_project_id uuid, p_note text default null)
returns public.client_approvals
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  row public.client_approvals;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  actor_name text;
begin
  proj := public.assert_client_portal_project(p_project_id);
  if proj.archived_at is not null then
    raise exception 'This project is archived and can no longer be approved.';
  end if;
  if proj.status not in ('delivered', 'ready-for-delivery') then
    raise exception 'There is no delivery waiting for your approval.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null or pkg.status not in ('delivered', 'approved') then
    raise exception 'Your team has not delivered a package for you to approve yet.';
  end if;
  if pkg.approval_state = 'approved_by_client' then
    raise exception 'You have already approved this delivery.';
  end if;

  insert into public.client_approvals (project_id, delivery_id, action, message, created_by)
  values (p_project_id, pkg.id, 'approved', clean_note, auth.uid())
  returning * into row;

  insert into public.client_messages (project_id, author_id, body, kind)
  values (
    p_project_id,
    auth.uid(),
    coalesce(clean_note, 'Approved the latest delivery.'),
    'approval'
  );

  -- Operational side-effect: staff-owned delivery row is updated by this
  -- definer function, never by a client table write.
  update public.project_deliveries
     set status = 'approved',
         approval_state = 'approved_by_client',
         approval_recorded_by = auth.uid(),
         approval_recorded_at = now(),
         approval_note = coalesce(clean_note, approval_note)
   where id = pkg.id;

  if proj.status = 'ready-for-delivery' then
    update public.projects set status = 'delivered' where id = p_project_id;
  end if;

  insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
  values (
    p_project_id, auth.uid(), 'client_approved', 'approved_by_client',
    jsonb_build_object(
      'delivery_id', pkg.id,
      'version', pkg.version,
      'client_facing', true,
      'internal_placeholder', false,
      'note', left(coalesce(clean_note, ''), 280)
    )
  );

  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'The client')
    into actor_name
  from public.profiles where id = auth.uid();

  perform public.notify_project_owners(
    p_project_id,
    'client_approval',
    'Client approved ' || proj.name,
    coalesce(actor_name, 'The client') || ' approved delivery v' || pkg.version::text || ' on “' || proj.name || '”.',
    '/projects/' || p_project_id::text,
    jsonb_build_object(
      'project_id', p_project_id,
      'project_name', proj.name,
      'delivery_id', pkg.id,
      'version', pkg.version,
      'action', 'approved'
    )
  );
  return row;
end;
$$;

create or replace function public.request_client_portal_revision(p_project_id uuid, p_note text)
returns public.client_approvals
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  row public.client_approvals;
  clean_note text := btrim(coalesce(p_note, ''));
  actor_name text;
begin
  proj := public.assert_client_portal_project(p_project_id);
  if length(clean_note) = 0 then
    raise exception 'Please describe what needs to change.';
  end if;
  if length(clean_note) > 4000 then
    raise exception 'A revision request cannot be longer than 4000 characters.';
  end if;
  if proj.archived_at is not null or proj.status in ('completed', 'cancelled') then
    raise exception 'This project can no longer accept a revision request.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null or pkg.status not in ('delivered', 'approved') then
    raise exception 'There is no delivered package to request a revision on.';
  end if;

  insert into public.client_approvals (project_id, delivery_id, action, message, created_by)
  values (p_project_id, pkg.id, 'revision_requested', clean_note, auth.uid())
  returning * into row;

  insert into public.client_messages (project_id, author_id, body, kind)
  values (p_project_id, auth.uid(), clean_note, 'revision');

  -- Distinct operational event BEFORE the status move so the timeline shows
  -- the client action even though the existing delivery trigger also records
  -- the package-level `revision_requested` event.
  insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
  values (
    p_project_id, auth.uid(), 'client_revision_requested', pkg.status, 'revision_requested',
    jsonb_build_object(
      'delivery_id', pkg.id,
      'version', pkg.version,
      'client_facing', true,
      'note', left(clean_note, 280)
    )
  );

  -- Moving Delivered / Ready-for-delivery → In review reuses the Session 15
  -- trigger: current package becomes revision_requested and a new preparing
  -- package is opened. The client never writes those rows directly.
  if proj.status <> 'in-review' then
    update public.projects set status = 'in-review' where id = p_project_id;
  else
    update public.project_deliveries
       set status = 'revision_requested',
           approval_state = 'revision_required',
           revision_note = clean_note
     where id = pkg.id;
  end if;

  -- Keep the client's wording on the package even when the trigger supplied
  -- a generic note.
  update public.project_deliveries
     set revision_note = clean_note,
         approval_state = 'revision_required'
   where id = pkg.id;

  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'The client')
    into actor_name
  from public.profiles where id = auth.uid();

  perform public.notify_project_owners(
    p_project_id,
    'client_revision',
    'Revision requested on ' || proj.name,
    coalesce(actor_name, 'The client') || ' requested a revision on “' || proj.name || '”: ' || left(clean_note, 180),
    '/projects/' || p_project_id::text,
    jsonb_build_object(
      'project_id', p_project_id,
      'project_name', proj.name,
      'delivery_id', pkg.id,
      'version', pkg.version,
      'action', 'revision_requested'
    )
  );
  return row;
end;
$$;

-- ── 10. Grants ──────────────────────────────────────────────────────────────
revoke all on function public.client_owns_project(uuid) from public, anon;
revoke all on function public.client_can_read_file(uuid) from public, anon;
revoke all on function public.client_can_read_storage_object(text) from public, anon;
revoke all on function public.notify_project_owners(uuid, text, text, text, text, jsonb) from public, anon;
revoke all on function public.share_project_file_with_client(uuid, uuid, text) from public, anon;
revoke all on function public.unshare_project_file_with_client(uuid, uuid) from public, anon;
revoke all on function public.add_client_visible_message(uuid, text) from public, anon;
revoke all on function public.assert_client_portal_project(uuid) from public, anon;
revoke all on function public.get_client_portal_collaboration(uuid) from public, anon;
revoke all on function public.add_client_portal_feedback(uuid, text) from public, anon;
revoke all on function public.approve_client_portal_delivery(uuid, text) from public, anon;
revoke all on function public.request_client_portal_revision(uuid, text) from public, anon;

grant execute on function public.client_owns_project(uuid) to authenticated;
grant execute on function public.client_can_read_file(uuid) to authenticated;
grant execute on function public.client_can_read_storage_object(text) to authenticated;
grant execute on function public.share_project_file_with_client(uuid, uuid, text) to authenticated;
grant execute on function public.unshare_project_file_with_client(uuid, uuid) to authenticated;
grant execute on function public.add_client_visible_message(uuid, text) to authenticated;
grant execute on function public.get_client_portal_collaboration(uuid) to authenticated;
grant execute on function public.add_client_portal_feedback(uuid, text) to authenticated;
grant execute on function public.approve_client_portal_delivery(uuid, text) to authenticated;
grant execute on function public.request_client_portal_revision(uuid, text) to authenticated;

commit;
