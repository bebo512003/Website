# Supabase setup

## 1. Create and configure a project

Create a Supabase project, then copy `.env.local.example` to `.env.local` and add the project URL and public anonymous key. Do not use the `service_role` key in browser environment variables.

## 2. Apply the schema

Use either approach:

- Paste `supabase/schema.sql` into the Supabase SQL Editor and run it once.
- Use the Supabase CLI to apply `supabase/migrations/20260808000000_secure_roles_and_projects.sql`.

The schema is safe for an existing early Agency OS database: it replaces permissive development policies, converts legacy role values, backfills profiles for real Auth users, and promotes the oldest real account only when no Admin exists.

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
- `clients`
- `projects`
- `project_members`
- `tasks`
- `files`
- `interactions`
- `comments`
- `notifications`

Admins and Managers can access the full project portfolio. Employees can read a project only when `(project_id, auth.uid())` exists in `project_members`. Related client, task, file, interaction, and comment policies reuse this access check.

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
