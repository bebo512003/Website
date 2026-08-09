# Supabase setup

## 1. Create and configure a project

Create a Supabase project, then copy `.env.local.example` to `.env.local` and add the project URL and public anonymous key. Do not use the `service_role` key in browser environment variables.

## 2. Apply the schema

Use either approach:

- Paste `supabase/schema.sql` into the Supabase SQL Editor and run it once.
- Use the Supabase CLI to apply `supabase/migrations/20260808000000_secure_roles_and_projects.sql`.

The schema is safe for an existing early Agency OS database: it replaces permissive development policies, converts legacy role values, backfills profiles for real Auth users, and promotes the oldest real account only when no Admin exists.

If you already applied an earlier version of the schema, apply the newer migrations in
order. In particular `20260809000000_user_employee_architecture.sql` adds the `client`
account type, and `20260810000000_role_permission_system.sql` installs the granular
role/permission model described below.

## 3. Authentication settings

In **Authentication → URL Configuration**:

- Set the Site URL to the deployed `NEXT_PUBLIC_SITE_URL`.
- Add local and deployment callback URLs that end in `/auth`.
- Choose whether email confirmation is required.

The first account in an empty workspace is the bootstrap Admin. Later accounts start as Employees. After onboarding, public sign-up can be disabled for an invite-only workspace.

## Security model

RLS is enabled for:

- `profiles`
- `employee_roles`
- `app_roles`
- `permissions`
- `role_permissions`
- `clients`
- `projects`
- `project_members`
- `tasks`
- `files`
- `interactions`
- `comments`
- `notifications`

## Roles & permissions (granular RBAC)

Roles and permissions are separate, metadata-driven catalog tables:

- `permissions` — every grantable capability (e.g. `project.delete`, `employee.manage`,
  `admin.manage`, `role.assign_permissions`). Add rows here to introduce new capabilities;
  no code change is required to reuse them in RLS or route guards.
- `app_roles` — the role catalog (Admin, Manager, Employee, Client plus any custom roles).
- `role_permissions` — which permissions each role explicitly carries.

A role name grants **nothing** by itself. All authorization — RLS policies, admin RPCs,
storage policies, and the frontend route guard — flows through `has_permission(required_key)`,
which resolves the signed-in user's effective permissions from `role_permissions`.

The Admin dashboard → **Roles & permissions** tab lets an administrator view/create/edit/delete
roles, grant or revoke permissions per role, add new permissions to the catalog, and assign
roles to employees. Assigning a role updates the user's effective permissions immediately.

The default matrix (seeded) is: Admin has every permission; Manager manages projects, clients,
tasks, files, and submissions but **cannot** delete employees, manage admins/permissions, edit
system settings, or assign permissions to roles; Employee works on assigned projects; Client is
portal-only.

Project/portfolio reads still follow membership: `can_access_project` requires
`has_permission('project.view')` plus either `project.view_all` (Admin/Manager) or a
`project_members` row (Employee).

The `client` account type is denied by default: management helpers only resolve for active Admin/Manager profiles, project membership is restricted to active team members, and profile visibility is staff-or-self. Clients only read their own profile and the intake submissions linked to their CRM record.

Every access helper is status-aware: setting `profiles.status = 'inactive'` immediately revokes all workspace reads and writes, including notifications and previously uploaded files.

Only Admins can call `set_user_role`, `set_user_status`, `set_user_employee_role`, and `set_user_client_link`. Profile owners use `update_own_profile`, which cannot change role, status, or email. The final active Admin cannot demote or deactivate themself. Job roles in `employee_roles` are Admin-managed rows — create them from the Admin dashboard instead of editing code.

## Private file storage

The migration creates a private `project-files` bucket. Objects use this path format:

```text
<project-uuid>/<generated-id>-<safe-file-name>
```

Storage policies validate the project UUID in the first path segment with the same project-access function used by table RLS.

## No seeded records

The schema creates no example users, clients, projects, assignments, tasks, files, or notifications. All records visible in the application are real workspace records.
