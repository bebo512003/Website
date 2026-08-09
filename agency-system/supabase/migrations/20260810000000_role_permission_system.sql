-- Role & permission system
--   * Roles and permissions are first-class, metadata-driven catalog rows. A role name
--     grants nothing by itself — only the permissions explicitly assigned to that role.
--   * New permissions can be added later (admin_manage can insert into `permissions`);
--     new roles can be created by an administrator and assigned to team members.
--   * Every authorization check (RLS policies, RPCs, route access) goes through
--     `has_permission(required_permission)` so backend enforcement is data-driven.

begin;

-- ── 1. Permission catalog (extensible) ──────────────────────────────────────
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  category text not null default 'general',
  description text,
  created_at timestamptz not null default now()
);

comment on table public.permissions is 'Catalog of all grantable permissions. Add rows here to introduce new capabilities; no code change is required to reuse them in RLS via has_permission().';

insert into public.permissions (key, name, category, description) values
  ('workspace.access',    'Workspace access',     'general',       'Base access to the staff workspace.'),
  ('dashboard.view',      'View dashboard',       'general',       'See the workspace overview dashboard.'),
  ('project.view',        'View projects',        'projects',      'View projects you can access.'),
  ('project.view_all',    'View all projects',    'projects',      'View every project in the workspace.'),
  ('project.create',      'Create projects',      'projects',      'Create new projects.'),
  ('project.edit',        'Edit projects',        'projects',      'Update project details, status, and progress.'),
  ('project.delete',      'Delete projects',      'projects',      'Delete projects.'),
  ('project.assign',      'Assign projects',      'projects',      'Assign employees to projects.'),
  ('client.view',         'View clients',         'clients',       'View client records you can access.'),
  ('client.view_all',     'View all clients',     'clients',       'View every client record.'),
  ('client.create',       'Create clients',       'clients',       'Create new client records.'),
  ('client.edit',         'Edit clients',         'clients',       'Update client records and interactions.'),
  ('client.delete',       'Delete clients',       'clients',       'Delete client records.'),
  ('task.view',           'View tasks',           'tasks',         'View tasks in projects you can access.'),
  ('task.create',         'Create tasks',         'tasks',         'Create tasks in accessible projects.'),
  ('task.edit',           'Edit tasks',           'tasks',         'Update tasks (status, priority, etc.).'),
  ('task.delete',         'Delete tasks',         'tasks',         'Delete tasks.'),
  ('task.assign',         'Assign tasks',         'tasks',         'Assign tasks to people.'),
  ('file.view',           'View files',           'files',         'View files in projects you can access.'),
  ('file.upload',         'Upload files',         'files',         'Upload files to accessible projects.'),
  ('file.edit',           'Edit files',           'files',         'Update and rename files.'),
  ('file.delete',         'Delete files',         'files',         'Delete files.'),
  ('submission.view',     'View submissions',     'submissions',   'View intake/submission records.'),
  ('submission.edit',     'Edit submissions',     'submissions',   'Update submission records.'),
  ('submission.assign',   'Assign submissions',   'submissions',   'Assign submissions to projects or people.'),
  ('employee.view',       'View employees',       'employees',     'View the team member directory.'),
  ('employee.edit',       'Edit employees',       'employees',     'Edit team member details.'),
  ('employee.delete',     'Delete employees',     'employees',     'Remove team members.'),
  ('employee.manage',     'Manage employees',     'employees',     'Change system roles, status, and job roles.'),
  ('role.view',           'View roles',           'access-control','View the role catalog.'),
  ('role.create',         'Create roles',         'access-control','Create new roles.'),
  ('role.edit',           'Edit roles',           'access-control','Edit roles.'),
  ('role.delete',         'Delete roles',         'access-control','Delete roles.'),
  ('role.assign_permissions', 'Assign permissions to roles', 'access-control', 'Grant or revoke permissions on roles.'),
  ('permission.view',     'View permissions',     'access-control','View the permission catalog.'),
  ('permission.manage',   'Manage permissions',   'access-control','Add or edit permissions in the catalog.'),
  ('settings.view',       'View settings',        'settings',      'Open the settings area.'),
  ('settings.edit',       'Edit system settings', 'settings',      'Change workspace settings.'),
  ('report.view',         'View reports',         'reports',       'Open the reports area.'),
  ('notification.view',   'View notifications',   'notifications', 'View your notifications inbox.'),
  ('admin.manage',        'Manage system',        'admin',         'Full system administration.'),
  ('portal.view',         'View client portal',   'portal',        'Access the client portal.')
on conflict (key) do update set
  name = excluded.name, category = excluded.category, description = excluded.description;

-- ── 2. Role catalog (extensible) ─────────────────────────────────────────────
create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_roles is 'Application roles. Permissions are granted through role_permissions, never inferred from the role name.';

drop trigger if exists set_app_roles_updated_at on public.app_roles;
create trigger set_app_roles_updated_at before update on public.app_roles
for each row execute function public.set_updated_at();

insert into public.app_roles (key, name, description, is_system) values
  ('admin',    'Admin',    'Full access, including managing roles, permissions, employees, and system settings.', true),
  ('manager',  'Manager',  'Manages projects, clients, tasks, files, and submissions. Cannot delete employees, manage admins, or change system settings.', true),
  ('employee', 'Employee', 'Team member with access to assigned projects, tasks, and files.', true),
  ('client',   'Client',   'External client account with portal-only access.', true)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, is_system = true;

-- ── 3. Role ↔ permission junction ────────────────────────────────────────────
create table if not exists public.role_permissions (
  role_id uuid not null references public.app_roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

comment on table public.role_permissions is 'Explicitly grants a permission to a role. Nothing is implied by role name.';

-- Link a profile to the role that carries its permissions.
alter table public.profiles add column if not exists role_id uuid;
do $$ begin
  alter table public.profiles add constraint profiles_role_id_fkey
    foreign key (role_id) references public.app_roles(id) on delete set null;
exception when duplicate_object then null; end $$;
create index if not exists idx_profiles_role on public.profiles(role_id);

-- Backfill existing profiles to the matching system role.
update public.profiles p
set role_id = r.id
from public.app_roles r
where r.key = p.role::text and p.role_id is null;

-- ── 4. Seed the default role → permission matrix ────────────────────────────
do $$
declare
  admin_key text := 'admin';
  manager_key text := 'manager';
  employee_key text := 'employee';
  client_key text := 'client';
  perm_row record;
begin
  -- Admin: every permission in the catalog.
  for perm_row in select p.key from public.permissions p loop
    insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.app_roles r, public.permissions p
    where r.key = admin_key and p.key = perm_row.key
    on conflict do nothing;
  end loop;

  -- Manager: full operational control minus admin/system/role-management powers.
  for perm_row in select p.key from public.permissions p
    where p.key in (
      'workspace.access','dashboard.view',
      'project.view','project.view_all','project.create','project.edit','project.delete','project.assign',
      'client.view','client.view_all','client.create','client.edit',
      'task.view','task.create','task.edit','task.delete','task.assign',
      'file.view','file.upload','file.edit','file.delete',
      'submission.view','submission.edit','submission.assign',
      'employee.view','employee.edit',
      'role.view','permission.view',
      'settings.view','report.view','notification.view'
    ) loop
    insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.app_roles r, public.permissions p
    where r.key = manager_key and p.key = perm_row.key
    on conflict do nothing;
  end loop;

  -- Employee: assigned-project operational access only.
  for perm_row in select p.key from public.permissions p
    where p.key in (
      'workspace.access','dashboard.view',
      'project.view','client.view',
      'task.view','task.edit',
      'file.view','file.upload',
      'submission.view','employee.view',
      'report.view','notification.view'
    ) loop
    insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.app_roles r, public.permissions p
    where r.key = employee_key and p.key = perm_row.key
    on conflict do nothing;
  end loop;

  -- Client: portal only.
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.app_roles r, public.permissions p
  where r.key = client_key and p.key = 'portal.view'
  on conflict do nothing;
end $$;

-- ── 5. Authorization helpers ─────────────────────────────────────────────────
-- Effective role of the current user: the profile's assigned role, or (for
-- legacy/back-compat) the system role matching the profile's role enum.
create or replace function public.user_role_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role_id from public.profiles p where p.id = auth.uid()),
    (select r.id from public.app_roles r where r.key = public.current_user_role()::text and r.is_system)
  );
$$;

create or replace function public.get_user_permissions()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.key order by p.key), array[]::text[])
  from public.app_roles r
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id
  where r.id = public.user_role_id() and r.is_active;
$$;

create or replace function public.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.is_active()
    and required_permission = any(public.get_user_permissions());
$$;

-- Staff identity is now itself permission-driven: no permission, no staff access.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.is_active()
    and public.has_permission('workspace.access');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('admin.manage');
$$;

-- Kept for legacy callers (e.g. intake policies): managers/admins see all projects.
create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('admin.manage') or public.has_permission('project.view_all');
$$;

create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.has_permission('project.view')
    and (
      public.has_permission('project.view_all')
      or (public.is_active() and exists (
        select 1 from public.project_members pm
        where pm.project_id = target_project_id and pm.user_id = auth.uid()
      ))
    );
$$;

create or replace function public.can_access_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.has_permission('client.view')
    and (
      public.has_permission('client.view_all')
      or (public.is_active() and exists (
        select 1 from public.projects p
        join public.project_members pm on pm.project_id = p.id
        where p.client_id = target_client_id and pm.user_id = auth.uid()
      ))
    );
$$;

create or replace function public.can_access_entity(target_type text, target_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active() then return false; end if;
  if public.has_permission('admin.manage') then return true; end if;
  if target_type = 'project' then return public.can_access_project(target_id); end if;
  if target_type = 'client' then return public.can_access_client(target_id); end if;
  if target_type = 'task' then
    return exists (select 1 from public.tasks where id = target_id and public.can_access_project(project_id));
  end if;
  if target_type = 'file' then
    return exists (
      select 1 from public.files
      where id = target_id
        and (uploaded_by = auth.uid() or (project_id is not null and public.can_access_project(project_id)))
    );
  end if;
  return false;
end;
$$;

-- Keep profiles.role (legacy enum) and profiles.role_id consistent: system roles
-- map 1:1 onto the enum; custom roles only touch role_id.
create or replace function public.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare role_key text;
begin
  if new.role_id is not null then
    select key into role_key from public.app_roles where id = new.role_id;
    if role_key in ('admin', 'manager', 'employee', 'client') then
      new.role := role_key::public.app_role;
    end if;
  end if;
  if new.role_id is null and new.role is not null then
    select id into new.role_id from public.app_roles where key = new.role::text and is_system;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_profile_role on public.profiles;
create trigger sync_profile_role before insert or update of role, role_id on public.profiles
for each row execute function public.sync_profile_role();

-- ── 6. Sign-up routing sets the assigned role too ────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  initial_role public.app_role;
  matched_client_id uuid;
  target_role_id uuid;
begin
  if coalesce(new.is_anonymous, false) or coalesce(new.raw_app_meta_data->>'provider', '') = 'anonymous' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('agency_os_first_admin'));

  if not exists (select 1 from public.profiles) then
    initial_role := 'admin'::public.app_role;
    matched_client_id := null;
  else
    select c.id into matched_client_id
    from public.clients c
    where coalesce(new.email, '') <> ''
      and lower(c.email) = lower(new.email)
    order by c.created_at asc
    limit 1;
    initial_role := case
      when matched_client_id is not null then 'client'::public.app_role
      else 'employee'::public.app_role
    end;
  end if;

  select id into target_role_id from public.app_roles where key = initial_role::text and is_system;

  insert into public.profiles (id, email, full_name, role, role_id, client_id)
  values (new.id, coalesce(new.email, ''), nullif(trim(new.raw_user_meta_data->>'full_name'), ''), initial_role, target_role_id, matched_client_id)
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role_id = coalesce(excluded.role_id, public.profiles.role_id);
  return new;
end;
$$;

-- ── 7. Role/permission management RPCs (permission-gated) ────────────────────
create or replace function public.list_permissions()
returns setof public.permissions
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('permission.view') and not public.has_permission('admin.manage') then
    return;
  end if;
  return query select * from public.permissions order by category, name;
end;
$$;

create or replace function public.list_roles()
returns table (id uuid, key text, name text, description text, is_system boolean, is_active boolean, permission_keys text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('role.view') and not public.has_permission('admin.manage') then
    return;
  end if;
  return query
    select r.id, r.key, r.name, r.description, r.is_system, r.is_active,
      coalesce(array_agg(distinct p.key order by p.key) filter (where p.key is not null), array[]::text[])
    from public.app_roles r
    left join public.role_permissions rp on rp.role_id = r.id
    left join public.permissions p on p.id = rp.permission_id
    group by r.id
    order by r.is_system desc, r.name;
end;
$$;

create or replace function public.create_app_role(p_name text, p_description text)
returns public.app_roles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.app_roles;
  p_key text;
begin
  if not public.has_permission('role.create') then raise exception 'Permission denied: role.create'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Role name is required'; end if;
  p_key := lower(regexp_replace(trim(p_name), '[^a-z0-9]+', '_', 'gi'));
  p_key := regexp_replace(p_key, '^_+|_+$', '', 'g') || '_role';
  insert into public.app_roles (key, name, description, created_by)
  values (p_key, trim(p_name), nullif(trim(p_description), ''), auth.uid())
  returning * into result;
  return result;
end;
$$;

create or replace function public.update_app_role(p_role_id uuid, p_name text, p_description text, p_is_active boolean)
returns public.app_roles
language plpgsql
security definer
set search_path = public
as $$
declare result public.app_roles;
begin
  if not public.has_permission('role.edit') then raise exception 'Permission denied: role.edit'; end if;
  if not exists (select 1 from public.app_roles where id = p_role_id) then raise exception 'Role not found'; end if;
  update public.app_roles
  set name = coalesce(nullif(trim(p_name), ''), name),
      description = nullif(trim(p_description), ''),
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
  where id = p_role_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.delete_app_role(p_role_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('role.delete') then raise exception 'Permission denied: role.delete'; end if;
  if (select is_system from public.app_roles where id = p_role_id) then
    raise exception 'System roles cannot be deleted';
  end if;
  delete from public.app_roles where id = p_role_id;
  return found;
end;
$$;

create or replace function public.set_role_permissions(p_role_id uuid, p_permission_keys text[])
returns public.app_roles
language plpgsql
security definer
set search_path = public
as $$
declare result public.app_roles;
begin
  if not public.has_permission('role.assign_permissions') then raise exception 'Permission denied: role.assign_permissions'; end if;
  if not exists (select 1 from public.app_roles where id = p_role_id) then raise exception 'Role not found'; end if;
  delete from public.role_permissions where role_id = p_role_id;
  if p_permission_keys is not null then
    insert into public.role_permissions (role_id, permission_id)
    select p_role_id, p.id from public.permissions p where p.key = any(p_permission_keys)
    on conflict do nothing;
  end if;
  select * into result from public.app_roles where id = p_role_id;
  return result;
end;
$$;

create or replace function public.assign_user_role(p_user_id uuid, p_role_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare result public.profiles;
begin
  if not public.has_permission('employee.manage') then raise exception 'Permission denied: employee.manage'; end if;
  if not exists (select 1 from public.app_roles where id = p_role_id and is_active) then
    raise exception 'Role not found or inactive';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role <> 'client'::public.app_role) then
    raise exception 'Only team members can be assigned a role';
  end if;
  if p_user_id = auth.uid() and p_role_id <> (select id from public.app_roles where key = 'admin')
     and (select count(*) from public.profiles where role_id = (select id from public.app_roles where key = 'admin')) = 1 then
    raise exception 'The workspace must retain at least one administrator';
  end if;
  update public.profiles set role_id = p_role_id, updated_at = now()
  where id = p_user_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.add_permission(p_key text, p_name text, p_category text, p_description text)
returns public.permissions
language plpgsql
security definer
set search_path = public
as $$
declare result public.permissions;
begin
  if not public.has_permission('permission.manage') then raise exception 'Permission denied: permission.manage'; end if;
  if nullif(trim(p_key), '') is null or nullif(trim(p_name), '') is null then
    raise exception 'Permission key and name are required';
  end if;
  insert into public.permissions (key, name, category, description)
  values (lower(trim(p_key)), trim(p_name), coalesce(nullif(trim(p_category), ''), 'general'), nullif(trim(p_description), ''))
  on conflict (key) do update set
    name = excluded.name, category = excluded.category, description = excluded.description
  returning * into result;
  return result;
end;
$$;

-- ── 8. Existing admin RPCs now require permissions (not role names) ──────────
create or replace function public.set_user_role(target_user_id uuid, new_role public.app_role)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
  target_role_id uuid;
begin
  if not public.has_permission('employee.manage') then raise exception 'Administrator access required'; end if;

  if target_user_id = auth.uid() and new_role <> 'admin'::public.app_role
    and (select count(*) from public.profiles where role = 'admin'::public.app_role) = 1 then
    raise exception 'The workspace must retain at least one administrator';
  end if;

  select id into target_role_id from public.app_roles where key = new_role::text and is_system;

  update public.profiles set role = new_role, role_id = target_role_id, updated_at = now()
  where id = target_user_id returning * into result;
  if result.id is null then raise exception 'User not found'; end if;
  return result;
end;
$$;

create or replace function public.set_user_status(target_user_id uuid, new_status text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare result public.profiles;
begin
  if not public.has_permission('employee.manage') then raise exception 'Administrator access required'; end if;
  if new_status not in ('active', 'inactive') then raise exception 'Invalid status'; end if;

  if target_user_id = auth.uid() and new_status = 'inactive'
    and (select count(*) from public.profiles where role = 'admin'::public.app_role and status = 'active') = 1 then
    raise exception 'The workspace must retain at least one active administrator';
  end if;

  update public.profiles set status = new_status, updated_at = now()
  where id = target_user_id returning * into result;
  if result.id is null then raise exception 'User not found'; end if;
  return result;
end;
$$;

create or replace function public.set_user_employee_role(target_user_id uuid, new_employee_role_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare result public.profiles;
begin
  if not public.has_permission('employee.manage') then raise exception 'Administrator access required'; end if;
  if not exists (select 1 from public.profiles where id = target_user_id and role <> 'client'::public.app_role) then
    raise exception 'Job roles can only be assigned to team members (or the user does not exist)';
  end if;
  if new_employee_role_id is not null and not exists (select 1 from public.employee_roles where id = new_employee_role_id) then
    raise exception 'Employee role not found';
  end if;

  update public.profiles set employee_role_id = new_employee_role_id, updated_at = now()
  where id = target_user_id returning * into result;
  return result;
end;
$$;

create or replace function public.set_user_client_link(target_user_id uuid, new_client_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare result public.profiles;
begin
  if not public.has_permission('employee.manage') then raise exception 'Administrator access required'; end if;
  if not exists (select 1 from public.profiles where id = target_user_id and role = 'client'::public.app_role) then
    raise exception 'A client record can only be linked to a client account';
  end if;
  if new_client_id is not null and not exists (select 1 from public.clients where id = new_client_id) then
    raise exception 'Client record not found';
  end if;

  update public.profiles set client_id = new_client_id, updated_at = now()
  where id = target_user_id returning * into result;
  return result;
end;
$$;

revoke all on function public.list_permissions() from public, anon;
revoke all on function public.list_roles() from public, anon;
revoke all on function public.create_app_role(text, text) from public, anon;
revoke all on function public.update_app_role(uuid, text, text, boolean) from public, anon;
revoke all on function public.delete_app_role(uuid) from public, anon;
revoke all on function public.set_role_permissions(uuid, text[]) from public, anon;
revoke all on function public.assign_user_role(uuid, uuid) from public, anon;
revoke all on function public.add_permission(text, text, text, text) from public, anon;
revoke all on function public.set_user_role(uuid, public.app_role) from public, anon;
revoke all on function public.set_user_status(uuid, text) from public, anon;
revoke all on function public.set_user_employee_role(uuid, uuid) from public, anon;
revoke all on function public.set_user_client_link(uuid, uuid) from public, anon;

grant execute on function public.list_permissions() to authenticated;
grant execute on function public.list_roles() to authenticated;
grant execute on function public.create_app_role(text, text) to authenticated;
grant execute on function public.update_app_role(uuid, text, text, boolean) to authenticated;
grant execute on function public.delete_app_role(uuid) to authenticated;
grant execute on function public.set_role_permissions(uuid, text[]) to authenticated;
grant execute on function public.assign_user_role(uuid, uuid) to authenticated;
grant execute on function public.add_permission(text, text, text, text) to authenticated;
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.set_user_status(uuid, text) to authenticated;
grant execute on function public.set_user_employee_role(uuid, uuid) to authenticated;
grant execute on function public.set_user_client_link(uuid, uuid) to authenticated;

grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.get_user_permissions() to authenticated;
grant execute on function public.user_role_id() to authenticated;

-- ── 9. Row level security ────────────────────────────────────────────────────
alter table public.permissions enable row level security;
alter table public.app_roles enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions for select to authenticated
  using (public.is_active() and public.is_staff());
drop policy if exists permissions_manage on public.permissions;
create policy permissions_manage on public.permissions for all to authenticated
  using (public.has_permission('permission.manage'))
  with check (public.has_permission('permission.manage'));

drop policy if exists app_roles_select on public.app_roles;
create policy app_roles_select on public.app_roles for select to authenticated
  using (public.is_active() and public.is_staff());
drop policy if exists app_roles_insert on public.app_roles;
create policy app_roles_insert on public.app_roles for insert to authenticated
  with check (public.has_permission('role.create') and created_by = auth.uid());
drop policy if exists app_roles_update on public.app_roles;
create policy app_roles_update on public.app_roles for update to authenticated
  using (public.has_permission('role.edit')) with check (public.has_permission('role.edit'));
drop policy if exists app_roles_delete on public.app_roles;
create policy app_roles_delete on public.app_roles for delete to authenticated
  using (public.has_permission('role.delete'));

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (public.is_active() and public.is_staff());
drop policy if exists role_permissions_insert on public.role_permissions;
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check (public.has_permission('role.assign_permissions'));
drop policy if exists role_permissions_delete on public.role_permissions;
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using (public.has_permission('role.assign_permissions'));

-- Profiles: staff see the directory; non-staff see themselves.
drop policy if exists profiles_select_staff_or_self on public.profiles;
create policy profiles_select_staff_or_self on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

-- Job roles (employee_roles) are a job-title catalog managed by admins.
drop policy if exists employee_roles_select on public.employee_roles;
create policy employee_roles_select on public.employee_roles for select to authenticated
  using (public.is_active() and public.is_staff());
drop policy if exists employee_roles_insert_admin on public.employee_roles;
create policy employee_roles_insert_admin on public.employee_roles for insert to authenticated
  with check (public.has_permission('employee.manage') and created_by = auth.uid());
drop policy if exists employee_roles_update_admin on public.employee_roles;
create policy employee_roles_update_admin on public.employee_roles for update to authenticated
  using (public.has_permission('employee.manage')) with check (public.has_permission('employee.manage'));
drop policy if exists employee_roles_delete_admin on public.employee_roles;
create policy employee_roles_delete_admin on public.employee_roles for delete to authenticated
  using (public.has_permission('employee.manage'));

-- Clients
drop policy if exists clients_insert_management on public.clients;
create policy clients_insert_management on public.clients for insert to authenticated
  with check (public.has_permission('client.create') and created_by = auth.uid());
drop policy if exists clients_update_management on public.clients;
create policy clients_update_management on public.clients for update to authenticated
  using (public.has_permission('client.edit')) with check (public.has_permission('client.edit'));
drop policy if exists clients_delete_management on public.clients;
create policy clients_delete_management on public.clients for delete to authenticated
  using (public.has_permission('client.delete'));

-- Projects
drop policy if exists projects_insert_management on public.projects;
create policy projects_insert_management on public.projects for insert to authenticated
  with check (public.has_permission('project.create') and created_by = auth.uid());
drop policy if exists projects_update_management on public.projects;
create policy projects_update_management on public.projects for update to authenticated
  using (public.has_permission('project.edit')) with check (public.has_permission('project.edit'));
drop policy if exists projects_delete_management on public.projects;
create policy projects_delete_management on public.projects for delete to authenticated
  using (public.has_permission('project.delete'));

-- Project members
drop policy if exists project_members_insert_management on public.project_members;
create policy project_members_insert_management on public.project_members for insert to authenticated
  with check (
    public.has_permission('project.assign')
    and assigned_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = project_members.user_id
        and p.role <> 'client'::public.app_role
        and p.status = 'active'
    )
  );
drop policy if exists project_members_delete_management on public.project_members;
create policy project_members_delete_management on public.project_members for delete to authenticated
  using (public.has_permission('project.assign'));

-- Tasks
drop policy if exists tasks_insert_authorized on public.tasks;
create policy tasks_insert_authorized on public.tasks for insert to authenticated
  with check (
    public.has_permission('task.create')
    and public.can_access_project(project_id)
    and created_by = auth.uid()
    and (public.has_permission('task.assign') or assignee_id is null or assignee_id = auth.uid())
  );
drop policy if exists tasks_update_authorized on public.tasks;
create policy tasks_update_authorized on public.tasks for update to authenticated
  using (public.is_active() and (public.has_permission('task.edit') or assignee_id = auth.uid() or created_by = auth.uid()))
  with check (
    public.can_access_project(project_id)
    and (public.has_permission('task.edit') or assignee_id = auth.uid() or (assignee_id is null and created_by = auth.uid()))
  );
drop policy if exists tasks_delete_authorized on public.tasks;
create policy tasks_delete_authorized on public.tasks for delete to authenticated
  using (public.is_active() and public.has_permission('task.delete'));

-- Files
drop policy if exists files_select_authorized on public.files;
create policy files_select_authorized on public.files for select to authenticated
  using (public.is_active() and public.has_permission('file.view') and (uploaded_by = auth.uid() or (project_id is not null and public.can_access_project(project_id))));
drop policy if exists files_insert_authorized on public.files;
create policy files_insert_authorized on public.files for insert to authenticated
  with check (public.has_permission('file.upload') and uploaded_by = auth.uid() and project_id is not null and public.can_access_project(project_id));
drop policy if exists files_update_authorized on public.files;
create policy files_update_authorized on public.files for update to authenticated
  using (public.is_active() and public.has_permission('file.edit'))
  with check (project_id is not null and public.can_access_project(project_id));
drop policy if exists files_delete_authorized on public.files;
create policy files_delete_authorized on public.files for delete to authenticated
  using (public.is_active() and public.has_permission('file.delete'));

-- Interactions
drop policy if exists interactions_update_management on public.interactions;
create policy interactions_update_management on public.interactions for update to authenticated
  using (public.is_active() and (public.has_permission('client.edit') or created_by = auth.uid()))
  with check (public.can_access_client(client_id));
drop policy if exists interactions_delete_management on public.interactions;
create policy interactions_delete_management on public.interactions for delete to authenticated
  using (public.is_active() and (public.has_permission('client.edit') or created_by = auth.uid()));

-- Comments
drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments for update to authenticated
  using (public.is_active() and author_id = auth.uid())
  with check (author_id = auth.uid() and public.can_access_entity(entity_type, entity_id));
drop policy if exists comments_delete_own_or_management on public.comments;
create policy comments_delete_own_or_management on public.comments for delete to authenticated
  using (public.is_active() and (author_id = auth.uid() or public.is_admin()));

-- Notifications
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

-- Intake submissions: staff who can view/edit submissions see them in addition to
-- the anonymous/own rules already defined by earlier migrations.
drop policy if exists intake_forms_select_staff on public.intake_forms;
create policy intake_forms_select_staff on public.intake_forms for select to authenticated
  using (public.has_permission('submission.view'));
drop policy if exists intake_forms_update_staff on public.intake_forms;
create policy intake_forms_update_staff on public.intake_forms for update to authenticated
  using (public.has_permission('submission.edit')) with check (public.has_permission('submission.edit'));

-- Storage: project files
drop policy if exists project_files_select on storage.objects;
create policy project_files_select on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.has_permission('file.view') and public.can_access_project(((storage.foldername(name))[1])::uuid));
drop policy if exists project_files_insert on storage.objects;
create policy project_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and owner_id = auth.uid()::text and public.has_permission('file.upload') and public.can_access_project(((storage.foldername(name))[1])::uuid));
drop policy if exists project_files_update on storage.objects;
create policy project_files_update on storage.objects for update to authenticated
  using (bucket_id = 'project-files' and (owner_id = auth.uid()::text or public.has_permission('file.edit')));
drop policy if exists project_files_delete on storage.objects;
create policy project_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and (owner_id = auth.uid()::text or public.has_permission('file.delete')));

commit;
