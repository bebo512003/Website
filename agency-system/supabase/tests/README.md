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

Covered guarantees (40 checks):

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

Every check runs under `SET ROLE authenticated` / `SET ROLE anon` with a simulated JWT
uid, so RLS is genuinely enforced by PostgreSQL.
