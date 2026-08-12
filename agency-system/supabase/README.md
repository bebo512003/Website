# Supabase setup

## 1. Create and configure a project

Create a Supabase project, then copy `.env.local.example` to `.env.local` and add the project URL and public anonymous key. Do not use the `service_role` key in browser environment variables.

## 2. Authoritative schema and migration order

`supabase/migrations/*.sql`, sorted by the 14-digit filename prefix, is the **only
authoritative database source**. Historical migration files are not edited after they have
been deployed; corrections are added as a later migration.

`supabase/schema.sql` is a generated, complete-chain snapshot for a fresh project. Do not
edit it directly:

```bash
npm run db:schema:generate  # rebuild after adding a migration
npm run db:schema:check     # fail if the snapshot has drifted
```

Use the setup path appropriate to the database:

- **Fresh Supabase project:** paste `supabase/schema.sql` into the SQL Editor and run it.
- **Existing project:** apply every unapplied file from `supabase/migrations/` in filename
  order, preferably through the Supabase CLI migration workflow. Do not run the full fresh
  snapshot over an already migrated production project.

The ordered history upgrades early Agency OS databases, replaces permissive development
policies, converts legacy role values, and backfills profiles for real Auth users. Major
milestones include the user/employee architecture (`20260809000000`), granular RBAC
(`20260810000000`), dynamic forms (`20260811000000`), Team Management
(`20260813000000`), portfolio (`20260814000000`), closed account provisioning
(`20260815000000`), enhanced profiles (`20260816000000`), notifications
(`20260817000000`), and the schema/profile/auth consistency fixes (`20260818000000`).

The final consistency migration installs the enhanced-profile RPC used by the application,
secures the password-change flag, makes temporary-password enforcement effective for newly
provisioned team accounts, prevents profile e-mail drift from Auth, keeps Auth/profile
deletion atomic, repairs attribution foreign keys, fills missing FK indexes, and aligns the
affected RLS policies with explicit permissions.

## 3. Authentication settings

In **Authentication → URL Configuration**:

- Set the Site URL to the deployed `NEXT_PUBLIC_SITE_URL`.
- Add local and deployment callback URLs that end in `/auth`.
- Choose whether email confirmation is required.

Public sign-up must remain disabled. Apply `20260815000000_admin_only_account_creation.sql`, then turn **Authentication → Providers → Email → Allow new users to sign up** OFF. Keep Anonymous Sign-ins enabled for public forms. The database guard also rejects direct sign-up requests and anonymous-to-permanent conversion if the dashboard setting is accidentally enabled.

Existing installations keep their current Admin. For a fresh empty database, use `npm run bootstrap:admin` once with the documented bootstrap environment variables. Afterwards, every internal Auth user is created by an authenticated Admin from **Administration → Team Management**. Newly provisioned team accounts are marked `must_change_password = true` until the owner replaces the temporary password; deleting a team member removes both the profile and matching Auth user transactionally. The protected Team Management create/e-mail-update route requires `SUPABASE_SERVICE_ROLE_KEY`; keep that key server-only and never expose it through a `NEXT_PUBLIC_*` variable.

## Security model

RLS is enabled for every application table:

- identity/access: `profiles`, `employee_roles`, `app_roles`, `permissions`, `role_permissions`
- operations: `clients`, `projects`, `project_members`, `tasks`, `files`, `interactions`, `comments`, `notifications`
- archived legacy intake (read-only): `intake_forms`, `intake_projects`, `intake_attachments`
- dynamic forms: `form_templates`, `form_questions`, `form_submissions`, `form_submission_answers`, `form_submission_attachments`
- public portfolio: `portfolio_categories`, `portfolio_projects`, `portfolio_project_images`

Storage object policies separately protect `project-files`, `form-files`,
`portfolio-images`, and `avatars`. The retired `intake-files` bucket remains only
so leftover historical objects can still be read or deleted by authorized staff.

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
system settings, or assign permissions to roles; Employee works on assigned projects and does
**not** receive `submission.view` or `client.view` unless those boxes are checked; Client is
portal-only. Custom roles start empty.

Management UIs are gated by their own capability (`form.manage`, `portfolio.manage`,
`employee.manage`, `role.view`, …). They are **not** locked behind `admin.manage`, so granting
a checkbox is enough to open the matching area.

Project/portfolio reads still follow membership: `can_access_project` requires
`has_permission('project.view')` plus either `project.view_all` (Admin/Manager) or a
`project_members` row (Employee).

The `client` account type is denied by default: management helpers only resolve for active authorized profiles, project membership is restricted to active team members, and directory visibility requires `employee.view` (owners can always read their own profile). Clients only read their own profile and the Dynamic Form submissions linked to their CRM record.

Every access helper is status-aware: setting `profiles.status = 'inactive'` immediately revokes all workspace reads and writes, including notifications and previously uploaded files.

Only users with `employee.manage` can call `set_user_role`, `set_user_status`, `set_user_employee_role`, and `set_user_client_link` (the default matrix grants it only to Admin). Profile owners use `update_own_profile` or `update_own_enhanced_profile`; neither can change role, status, or email. The final active Admin cannot demote or deactivate themself. Job roles in `employee_roles` are Admin-managed rows — create them from the Admin dashboard instead of editing code.

## Private file storage

The migration creates a private `project-files` bucket. Objects use this path format:

```text
<project-uuid>/<generated-id>-<safe-file-name>
```

Storage policies validate the project UUID in the first path segment with the same project-access function used by table RLS.

## Seeded configuration only

The schema seeds required system configuration (default roles, permissions, role grants, and portfolio categories). It creates no example users, clients, projects, assignments, tasks, files, submissions, or notifications. All business records visible in the application are real workspace records.
