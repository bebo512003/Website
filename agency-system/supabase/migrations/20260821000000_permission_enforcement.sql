-- Session 04 — Roles, custom roles & permission enforcement.
--
-- Closes the gap where a granted capability (e.g. form.manage) was useless
-- because the corresponding UI lived behind an unrelated admin.manage route.
-- Also tightens the default Employee matrix: submissions and client records
-- are no longer granted by role name; they must be checked explicitly.
--
-- Capabilities remain checkbox-driven. This migration only:
--   * adds form.view to the catalog
--   * reseeds the four system-role defaults
--   * lets form.view read the form inventory (drafts included)
--   * adds has_any_permission() for route-equivalent checks

begin;

-- ── 1. Catalog ───────────────────────────────────────────────────────────────
insert into public.permissions (key, name, category, description) values
  ('form.view', 'View forms', 'forms', 'Open the form inventory, including drafts that are not public.')
on conflict (key) do update set
  name = excluded.name, category = excluded.category, description = excluded.description;

-- Admin always receives every catalog row, including newly added keys.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
cross join public.permissions p
where r.key = 'admin' and r.is_system
on conflict do nothing;

-- ── 2. System-role defaults (explicit, never implied by the role name) ───────
-- Manager keeps operational access. Employee loses submissions + clients.
-- Custom roles are left untouched.
delete from public.role_permissions rp
using public.app_roles r
where rp.role_id = r.id
  and r.is_system
  and r.key in ('manager', 'employee', 'client');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
join public.permissions p on p.key = any(array[
  'workspace.access','dashboard.view',
  'project.view','project.view_all','project.create','project.edit','project.delete','project.assign',
  'client.view','client.view_all','client.create','client.edit',
  'task.view','task.create','task.edit','task.delete','task.assign',
  'file.view','file.upload','file.edit','file.delete',
  'submission.view','submission.edit','submission.assign',
  'employee.view','employee.edit',
  'role.view','permission.view',
  'settings.view','report.view','notification.view'
])
where r.key = 'manager' and r.is_system
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
join public.permissions p on p.key = any(array[
  'workspace.access','dashboard.view',
  'project.view',
  'task.view','task.edit',
  'file.view','file.upload',
  'employee.view',
  'report.view','notification.view'
])
where r.key = 'employee' and r.is_system
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
join public.permissions p on p.key = 'portal.view'
where r.key = 'client' and r.is_system
on conflict do nothing;

update public.app_roles
set description = 'Full access, including managing roles, permissions, employees, and system settings.'
where key = 'admin' and is_system;

update public.app_roles
set description = 'Manages projects, clients, tasks, files, and submissions. Cannot delete employees, manage admins, or change system settings.'
where key = 'manager' and is_system;

update public.app_roles
set description = 'Team member with access to assigned projects, tasks, and files. Submissions and client records require an explicit grant.'
where key = 'employee' and is_system;

update public.app_roles
set description = 'External client account with portal-only access.'
where key = 'client' and is_system;

-- ── 3. form.view can read the inventory (manage still owns writes) ───────────
drop policy if exists form_templates_select_view on public.form_templates;
create policy form_templates_select_view on public.form_templates for select to authenticated
using (public.has_permission('form.view'));

drop policy if exists form_questions_select_view on public.form_questions;
create policy form_questions_select_view on public.form_questions for select to authenticated
using (public.has_permission('form.view'));

-- ── 4. Route-equivalent helper ───────────────────────────────────────────────
create or replace function public.has_any_permission(required_permissions text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.is_active()
    and not public.must_change_password_pending()
    and exists (
      select 1
      from unnest(coalesce(required_permissions, array[]::text[])) required(key)
      where public.has_permission(required.key)
    );
$$;

revoke all on function public.has_any_permission(text[]) from public, anon;
grant execute on function public.has_any_permission(text[]) to authenticated;

comment on function public.has_any_permission(text[]) is
  'True when the caller holds at least one of the listed permission keys. Used by route-equivalent checks so form.manage is not blocked by an unrelated admin.manage requirement.';

commit;
