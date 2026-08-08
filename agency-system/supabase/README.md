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
- `clients`
- `projects`
- `project_members`
- `tasks`
- `files`
- `interactions`
- `comments`
- `notifications`

Admins and Managers can access the full project portfolio. Employees can read a project only when `(project_id, auth.uid())` exists in `project_members`. Related client, task, file, interaction, and comment policies reuse this access check.

Only Admins can call `set_user_role`. Profile owners use `update_own_profile`, which cannot change role or email. The final Admin cannot demote themself.

## Private file storage

The migration creates a private `project-files` bucket. Objects use this path format:

```text
<project-uuid>/<generated-id>-<safe-file-name>
```

Storage policies validate the project UUID in the first path segment with the same project-access function used by table RLS.

## No seeded records

The schema creates no example users, clients, projects, assignments, tasks, files, or notifications. All records visible in the application are real workspace records.
