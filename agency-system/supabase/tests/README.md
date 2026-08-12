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
2. **Upgrade path** — applies every migration before the latest migration, applies the
   latest migration exactly like Supabase would, then runs the assertion suite. The latest
   file is detected automatically so a new migration cannot silently escape testing.
3. **Fresh-install path** — applies the generated full-chain `supabase/schema.sql` and
   re-checks the core guarantees. The root `npm test` first verifies that this snapshot is
   byte-for-byte current with the ordered migration history.

Covered guarantees:

- The first trusted server-provisioned account becomes bootstrap Admin; anonymous visitors never get profiles.
- Public Auth sign-up and anonymous-to-permanent conversion are rejected by the database.
- A form submitter remains a CRM client without an Auth account and can still submit anonymously.
- Admin Team Management placeholders are claimed by trusted Auth Admin provisioning, producing a real employee login-linked profile with all enhanced-profile columns and temporary-password enforcement.
- **Account lifecycle hardening** (`20260819000000_account_lifecycle_hardening.sql`):
  profile e-mails are unique (case-insensitive, backstopped by a partial unique
  index); provisioning rejects e-mails already taken by another profile, by a
  client record, or by an orphaned `auth.users` row; a deleted member's e-mail
  can be provisioned again; project assignments made against a placeholder
  survive the claim around the unique index.
- **Temporary-password gate**: while `must_change_password` is pending the
  account reports NO effective permissions and RLS hides all workspace data
  (proven with real assigned projects/tasks); the first-login change
  (`mark_password_changed`, owner-only) restores access immediately. Inactive
  accounts likewise report an empty permission set and lose `workspace.access`.
- The enhanced profile RPC is owner-only; password flags cannot be cleared for another user; team deletion removes the Profile and Auth user atomically while nullable attribution foreign keys preserve business rows.
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
  are rejected by the RPCs; `workspace.access` alone does not expose the team or RBAC catalogs.
- Form submission attachments and `form-files` storage objects follow `submission.view` / `submission.edit`. The legacy `/intake` RPC and write policies are retired.
- **Checkbox UI contract** — the exact sequence the "Roles & permissions" admin UI
  performs, logged in as different roles:
  - `list_permissions()` (the checkbox catalog) returns every group the UI renders.
  - Saving a checked set writes exactly those rows to `role_permissions` — checkbox
    state equals database state, nothing more, nothing left over on re-save.
  - Checking a box changes REAL access (the employee can suddenly create forms /
    portfolio projects through RLS); unchecking revokes it immediately without
    re-login; unchecked boxes keep denying the action at the database.
  - A custom role with `form.manage` but not `admin.manage` can create/update forms
    and call form RPCs (the old “admin route required” inconsistency is gone).
  - Manager/Employee attempts to toggle checkboxes are rejected by the RPC guards and
    leave the stored permission set untouched.

**Project delivery & closure** (migration `20260831000000_project_delivery_closure.sql`):

- Ready for delivery and Delivered require at least one final delivery file on an
  internal package. Working files that are not attached do not count.
- Complete is rejected until the package is delivered and the internal
  client-approval placeholder is recorded. The database, not the UI, enforces this.
- Revision requested returns the project to In review and opens a new package version.
- Archive is allowed only after Completed or Cancelled; archived projects cannot
  change status until they are unarchived.
- Clients cannot read delivery packages or record the internal approval placeholder.
  Future client-facing approval must not reuse these tables.

Every check runs under `SET ROLE authenticated` / `SET ROLE anon` with a simulated JWT
uid, so RLS is genuinely enforced by PostgreSQL.
