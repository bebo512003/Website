# Database regression tests

Self-contained security test for the user & employee architecture, powered by
[PGlite](https://pglite.dev) (real PostgreSQL running in WASM). No Supabase project or
credentials are required.

```bash
cd supabase/tests
npm install
npm test
```

What it does:

1. Stubs the Supabase-only pieces (`auth.users`, `auth.uid()`, `storage.*`) and the
   `anon` / `authenticated` roles, with the same default grants Supabase applies.
2. **Upgrade path** — applies every migration before the user-architecture migration
   (reproducing a pre-change production database), applies the new migration exactly
   like Supabase would (the enum `ALTER TYPE` autocommits outside the transaction),
   then runs the assertion suite.
3. **Fresh-install path** — applies the full `supabase/schema.sql` and re-checks the
   core guarantees.

Covered guarantees (125 checks):

- First real account becomes bootstrap Admin; anonymous visitors never get profiles.
- A form submitter who signs up with the same e-mail becomes a **client** linked to
  their CRM record — never an employee. Unmatched staff sign-ups still become employees.
- Clients: no projects/tasks/notifications, staff-directory hidden, cannot modify other
  submissions, cannot be assigned to projects (blocked at the database, not only the UI),
  see only their own linked submissions.
- Employee job roles: only Admins create them; Admins assign them; they cannot be set
  on client accounts.
- Employee status: deactivating removes project/task/notification/profile-list access
  immediately (RLS), blocks new assignments, and blocks task writes; reactivation
  restores access. Only Admins change status.
- Admin protections: the last Admin cannot demote or deactivate themself; Managers keep
  portfolio access but cannot change system roles or statuses.
- Public portfolio: employees cannot read or publish drafts; anonymous visitors receive
  only the narrow public RPC output for published projects; published image storage is
  available through signed URLs and archived images disappear immediately.

**Role & permission system** (migration `20260810000000_role_permission_system.sql`):

- Roles and permissions are separate metadata-driven tables; a role grants nothing by
  name. Every check goes through `has_permission(key)` in RLS and in the admin RPCs.
- The default matrix is asserted: Admin has everything; Manager has `submission.edit` /
  `project.assign` but **cannot** delete employees, manage admins/permissions, edit
  system settings, or assign permissions to roles; Employee has `task.edit` but not
  `project.delete` / `project.view_all`.
- **URL-navigation equivalence** — the database layer proves that a user who lacks a
  permission is blocked even when they try the action directly (the equivalent of typing
  a URL): Manager can edit a client but cannot delete it; an Employee cannot create a
  project; a Manager cannot deactivate a user.
- Admin management: create a custom role, assign permissions to it, assign the role to
  an employee, and watch the employee's effective permissions change immediately
  (including gaining the ability to delete a project).
- Guard rails: users without `role.create` / `role.assign_permissions` / `employee.manage`
  are rejected by the RPCs.

Every check runs under `SET ROLE authenticated` / `SET ROLE anon` with a simulated JWT
uid, so RLS is genuinely enforced by PostgreSQL.
