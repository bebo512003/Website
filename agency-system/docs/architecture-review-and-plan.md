# Architecture review & evolution plan

Prepared 2026-08-09. Historical review; later migrations override parts of this plan.

> **2026-08-12 — Session 07, legacy intake retired:** Dynamic Forms is the only live
> request path. `/intake` is a permanent redirect to `/forms`. Client helpers for
> `intake_forms` / `submit_intake_form` / `intake-files` are gone. The portal reads
> `form_submissions` linked to the client's CRM record. Migration
> `20260824000000_retire_legacy_intake.sql` drops the write RPC, insert/update
> policies, and `notify_intake_submission` trigger. Historical `intake_*` tables and
> the `intake-files` bucket stay as read-only archives (not dropped — production may
> still hold older rows/files). Remaining Phase E item: optional one-time backfill of
> historical `intake_forms.data` into `form_submission_answers` if those rows need to
> appear in the Submissions inbox.
>
> **2026-08-12 — Session 04, permission enforcement done:** management areas
> (`/admin/forms`, `/admin/portfolio`, `/admin/roles`, `/admin/team`, `/submissions`)
> are gated by their own capability keys. `admin.manage` is no longer required to
> open a page whose checkbox was granted. Default Employee no longer includes
> `submission.view` or `client.view`. Inactive users and pending temporary
> passwords still report an empty permission set.
>
> **2026-08-12 — Session 02, employee account lifecycle done:** migration
> `20260819000000_account_lifecycle_hardening.sql` + Team Management UI/API complete the
> internal provisioning loop end to end: Admin → Add Team Member → role + profile info →
> server creates the Auth account → **server-generated temporary password** (crypto-random,
> never typed by the admin, never persisted, shown once in a one-time credentials modal with
> copy/reveal controls) → employee first login → **forced password change that genuinely
> blocks the workspace** (full-screen AppShell gate *and* `has_permission()` /
> `get_user_permissions()` return nothing while `must_change_password` is pending, so RLS,
> RPCs and the provisioning Route Handler all agree) → normal access. Deactivation now also
> syncs a GoTrue sign-in ban through the protected Route Handler (deactivated members cannot
> log in at all; reactivation lifts it), and deletion already removes profile + Auth account
> atomically. Duplicate e-mails are rejected by the provisioning RPC (profiles AND
> `auth.users`), backstopped by a case-insensitive partial unique index; failed creations
> clean up their placeholder, and the placeholder-claim flow was re-ordered
> (snapshot assignments → free the e-mail → insert claimed profile → restore assignments)
> to coexist with the unique index. Password changes everywhere now verify the current
> password first; the e-mail reset flow clears the temporary-password flag. Regression suite
> grew from 183 to 202 checks covering the full lifecycle (gate before change, unlock after
> change, duplicate handling, delete → re-provision, assignment survival across the claim).

> **2026-08-09 — authentication decision completed:** migration
> `20260815000000_admin_only_account_creation.sql` removes public permanent-account
> creation. Public forms continue through anonymous Auth and create CRM client records only.
> Internal users are provisioned by an Admin through Team Management using a protected
> server Route Handler; an `auth.users` trigger rejects direct sign-up and anonymous-account
> conversion. The legacy client role remains intact for existing accounts.

> **2026-08-09 — implementation status:** Phase B (roles & permissions → admin-managed
> `employee_roles`) and the client separation parts of Phase C are **done** via migration
> `20260809000000_user_employee_architecture.sql` (`'client'` account type, email claim into
> `profiles.client_id`, `profiles.status` enforced across RLS, `/portal` landing for clients,
> RLS regression harness in `supabase/tests/`). Decisions taken: clients are separate accounts
> routed by e-mail match; job-role labels ship without a granular permission matrix yet; legacy
> intakes stay in place. The migration also fixed a latent production bug: `created_by`
> foreign keys on `intake_forms`/`intake_attachments`/`clients`/`projects` referenced
> `profiles`, which rejected every **anonymous** intake draft/submission (they now reference
> `auth.users`). Remaining: dynamic forms (Phase D) and migration/cleanup (Phase E).

> **2026-08-09 — granular RBAC done:** migration
> `20260810000000_role_permission_system.sql` replaces hard-coded role-name checks with a
> metadata-driven permission model. Roles and permissions are separate tables
> (`app_roles`, `permissions`, `role_permissions`); permissions are **never implied by a
> role name**. All authorization (RLS policies, admin RPCs, storage policies, route access)
> flows through `has_permission(key)`. The Admin dashboard gained a **Roles & permissions**
> tab to create/edit/delete roles, grant/revoke permissions per role, add new permissions
> to the catalog, and assign roles to employees. A client-side route guard blocks direct
> URL navigation without the required permission, backed by the same checks in RLS. The
> PGlite regression suite (now 64 checks) proves a user cannot perform an action they lack
> permission for at the database layer. The old `isAdmin`/`isManager` booleans are now
> permission-derived. Remaining: Phase D dynamic forms and Phase E cleanup.

> **2026-08-09 — Phase D dynamic forms done:** migration
> `20260811000000_dynamic_form_builder.sql` adds `form_templates` + `form_questions`
> (10 question types, options/placeholder/help text/required/order, extensible via a
> registry), `form_submissions` + `form_submission_answers` with **per-question
> snapshots** (edits never rewrite history), `form_submission_attachments` + private
> `form-files` bucket with staff-readable policies, three RPCs (`submit_dynamic_form`
> — server-side validation, client match/create, optional project creation;
> `duplicate_form_template`; `reorder_form_questions`), a `form.manage` permission, and
> delete/archive lifecycle guards. Frontend: **Administration → Forms** inventory,
> `/admin/forms/[id]` builder (details, questions CRUD + reorder + options, preview,
> responses inbox), public renderer `/f/[slug]`, and `/forms` is now the staff hub for
> the dynamic catalog. Legacy hardcoded `/intake` stays functional; its data remains
> readable. Regression suite extended to 97 checks covering the whole lifecycle (build →
> publish → public submit → duplicate/reorder/disable/archive/delete).
> Remaining: Phase E (legacy backfill/cleanup; multi-language labels per question).

## 1. Current architecture

**Stack:** Next.js 16 (App Router, all pages are client components), React 19, TypeScript,
Tailwind 4 and Supabase (Auth + Postgres + Storage). Normal data access uses the browser
client. Admin account provisioning additionally uses one server-only Route Handler and a
`SUPABASE_SERVICE_ROLE_KEY` that is never exposed to browser code.

**Layers (updated Session 28):**

- `lib/supabase/client.ts` — singleton browser client from `NEXT_PUBLIC_` env vars.
- `lib/supabase/database.types.ts` — **generated** `Database` contract (see
  `scripts/generate-types.mjs`; `npm run db:types:generate`). Built from the real
  migrations on an in-memory PGlite instance; `npm run db:types:check` is a CI drift gate.
- `lib/supabase/types/` — app-level domain types (view models, literal unions) on top of
  the generated contract; `index.ts` barrel keeps the historical import path.
- `lib/db/` — domain-based repositories, one module per domain (access, analytics,
  clients, files, forms, notifications, portfolio, portal, profile, projects, tasks,
  team) plus `shared.ts` (Result/PageQuery/executePage) and a barrel at `@/lib/db`.
  This is the data-access layer; extend it, don't bypass it.
- `lib/supabase/auth.ts` — sign-in/anonymous/reset/profile helpers (no public sign-up helper).
- `app/api/admin/team-members/route.ts` — Admin-only server provisioning of Auth users.
- `contexts/auth-context.tsx` — session + `profile` (from `public.profiles`), exposes
  `isAdmin` / `isManager` / `isAnonymous` booleans.
- `components/layout/app-shell.tsx` — route gate: everything except `/auth` and the
  public pages requires a signed-in, non-anonymous user; otherwise redirect to `/auth`.
- Pages under `app/` read their data at mount and rely on RLS for authorization; UI role
  checks (`isManager`, `isAdmin`) only hide/show controls, the DB enforces the rules.

## 2. Tables and relationships

| Table | Purpose | Key relationships |
| --- | --- | --- |
| `profiles` | Staff users 1:1 with `auth.users` (never anonymous users) | `id → auth.users.id` |
| `clients` | CRM client records (companies, not login users) | `created_by → profiles` |
| `projects` | Projects | `client_id → clients (restrict)` |
| `project_members` | Employee ↔ project assignment boundary | `(project_id, user_id)` PK |
| `tasks` | Project tasks | `project_id → projects`, `assignee_id → profiles` |
| `files` | Project file metadata | `project_id`, `client_id`, `uploaded_by` |
| `interactions` | Client contact log | `client_id`, optional `project_id` |
| `comments` | Polymorphic comments | `(entity_type, entity_id)` |
| `notifications` | Private per-user inbox | `recipient_id → profiles` |
| `intake_forms` | Service-request drafts/submissions | `client_id`, `project_id`, `created_by` (may be an **anonymous** auth uid) |
| `intake_projects` | One intake → N projects link | `intake_id`, `project_id` |
| `intake_attachments` | Files uploaded with an intake | `intake_id`, `uploaded_by` |

Storage buckets: `project-files` (private, path `<project-uuid>/<file>`), `intake-files`
(private, path `<user-id>/<intake-id>/<file>`).

## 3. How "users" are created when a form is submitted

Two different creations happen, and neither creates a staff account:

1. **Auth identity.** `/intake` calls `supabase.auth.signInAnonymously()` on load. This creates
   an `auth.users` row with `is_anonymous = true`. The `handle_new_user` trigger explicitly
   **skips anonymous users**, so no `profiles` row exists for them. The draft is owned via
   `intake_forms.created_by = auth.uid()` of that anonymous session.
2. **Business record.** On submit, the `submit_intake_form` security-definer RPC:
   - matches `clients` by `contact_email` (first match), otherwise inserts a new client with
     `type/status = 'potential'` and a "Created automatically from intake #…" note;
   - creates one or more `projects` using hard-coded branching
     (Logo only / VI only / Logo+VI combined / Company Profile always separate);
   - writes `intake_projects` links and marks the intake `submitted`.

Staff users are created **only** by an authorized Admin from Team Management. The server
creates the Auth user with trusted app metadata after the permission-checked profile step;
`handle_new_user` links both records. The public `/auth` page only supports login and password
recovery. A one-time server-side bootstrap creates the first Admin in an empty workspace.

## 4. Roles & authentication flow

- `app_role` enum: `admin`, `manager`, `employee` on `profiles.role`.
- The browser can never update `role` directly (`revoke all`; only `select` granted). Role
  changes go through `set_user_role` (admin only, protects the last admin); profile edits go
  through `update_own_profile` (no role/email fields).
- Helper security-definer functions used by every policy: `current_user_role()`, `is_admin()`,
  `is_manager_or_admin()`, `can_access_project(uuid)`, `can_access_client(uuid)`,
  `can_access_entity(text, uuid)`.
- Employee horizon is defined solely by `project_members` rows (admin assigns in `/admin` →
  Assignments). Managers/Admins see everything (same read access; only admins change roles).
- `/auth` exposes only e-mail, password, Login, and Forgot Password. Public forms remain
  directly accessible without a permanent account. Anonymous sessions are blocked from the
  workspace by `AppShell`.

## 5. Forms & submissions today

Two separate hard-coded UIs feed the same tables:

- `/intake` — public, anonymous, 3-stage multi-service wizard (AR/EN), autosaves drafts every
  800 ms into `intake_forms`, uploads to `intake-files`, submits via RPC.
- `/forms` — authenticated-only, single-service Arabic form, same tables/RPC.

Answer storage: `intake_forms.data` is a flat `jsonb` map of UI field keys → strings. The
question labels, types, options, order, and branching live **only in the page source code**
(the `t(lang)` dictionary and `branchFields`). There is no question snapshot, no versioning,
and after submit nothing freezes the row server-side (RLS still lets the owner update it).

## 6. Existing RLS policies (summary)

- `profiles`: `select` for any authenticated user; no direct insert/update/delete.
- `clients`, `projects`, `tasks`, `files`, `interactions`, `comments`: full CRUD for
  managers/admins; employees get read via `can_access_project/client` and limited writes
  (tasks they own/are assigned, files they uploaded, own comments, own interactions).
- `project_members`: read if you can access the project; insert/delete managers+admins only.
- `notifications`: owner-only select/update(`read_at`)/delete; inserts come from triggers.
- `intake_forms` / `intake_projects` / `intake_attachments`: select+update for
  `created_by = auth.uid()` **or** managers/admins; insert for the owner. Policies apply to
  both `anon` and `authenticated` (this is what makes the public intake work). No delete.
- Storage: `project-files` derives access from the project UUID in the first path segment;
  `intake-files` is **owner-only** — note: staff currently cannot download client-uploaded
  intake attachments through storage even though they can list them.

## 7. Gap analysis — what must change

| Requirement | Today | Needed |
| --- | --- | --- |
| Clients | Passive `clients` rows only; no link to any auth account; no portal | Keep rows; add optional client identity (see step C) |
| Employees | `profiles` + role `employee` + `project_members` — solid, keep | Add admin-managed job roles/permission keys |
| Employee roles | Single flat enum | New `employee_roles`/`permissions` tables + `has_permission()` |
| Permissions | Hard-coded per-role RLS | Metadata-driven keys, reused by RLS helpers |
| Dynamic admin-managed forms | Hard-coded questions in 2 pages; labels only in code | `form_templates` + `form_questions` + renderer + builder |
| Submission Q&A history | Single mutable `data` blob, no labels/version | `form_submissions` + `submission_answers` with per-question snapshot |

## 8. Implementation plan (small, shippable steps)

### Phase A — foundations (no breaking change)

1. **Decisions log** (this doc + team sign-off): client portal yes/no, permission granularity,
   migration of legacy intakes, post-submit freeze policy.
2. **Service catalog table** `services` (key, name AR/EN, active, sort) replacing scattered
   `text[]` checks; keep old columns working during transition.

### Phase B — roles & permissions

3. New tables `employee_roles` (key, label, permission keys jsonb) + nullable
   `profiles.employee_role_id`; admin-only CRUD policies; `set_user_employee_role()` RPC.
4. `has_permission(key)` security-definer helper (admin ⇒ always true; else role/employee-role
   lookup). Existing helpers untouched → zero regression risk.
5. `types.ts` + `database.ts` additions; Admin page tab "Employee roles".

### Phase C — clients

6. Add `'client'` to `app_role` (additive; existing policies deny it by default), plus
   `client_users (client_id, user_id)` link table with RLS.
7. `claim_client_account()` RPC: on first real sign-up matching `clients.email`, link and set
   role `client` (replacing the employee default) — no service key needed.
8. Client-scoped policies: a client reads own client row, own submissions, and (read-only)
   projects linked to their `client_id`.

### Phase D — dynamic forms & submissions

9. New tables: `form_templates` (slug, title/description jsonb AR/EN, service_keys, status
   draft/published/archived, version, project_defaults jsonb), `form_questions` (template_id,
   key, type, label jsonb, options jsonb, required, sort_order, section, visible_if jsonb).
10. `form_submissions` (template_id + template_version, contact columns as today, status,
    client_id, project_id, created_by, submitted_at, meta jsonb) and `submission_answers`
    (submission_id, question_id, **question_snapshot jsonb** — full copy of label/type/options/
    order/version at save time — value jsonb). Freeze-on-submit enforced in RLS (draft owner
    editable; submitted read-only).
11. `submission_attachments` + storage policy fix so managers/admins (not only the uploader)
    can read intake/submission files.
12. Generic `submit_form_submission(uuid)` RPC: validate required questions, client match/
    create (same logic as today), create project(s) from `project_defaults` mapping (reuse the
    current Logo/VI/Profile branching as the default mapping), notify managers/admins.
13. Front-end: dynamic renderer component (reuse the existing `/intake` stage UI) that fetches
    the published template + questions; autosave per-answer rows; keep AR/EN from jsonb.
14. Replace `/intake` and fold `/forms` into the dynamic page (keep routes; archived legacy
    data remains readable).
15. Admin "Forms" section: template list/editor (add/reorder/require questions, options,
    publish/archive), submissions inbox with full Q&A snapshot view, link/assign actions.
16. Employee dashboard: "My assigned submissions" view tied to project assignment.

### Phase E — migration & cleanup

17. One-time backfill: legacy `intake_forms.data` → `submission_answers` with question
    snapshots reconstructed from the current dictionaries; flag legacy rows `archived`.
18. Update `types.ts`, README/`supabase/README.md`, ROADMAP; RLS smoke-test checklist
    (anon submit, employee isolation, client read scope, admin management).

## 9. Open decisions to confirm

1. **Resolved:** public clients stay CRM records only and submit forms without accounts. Existing legacy client-role accounts remain supported.
2. Employee roles: labels only, or full granular permission matrix from day one?
3. **Resolved (Session 07):** historical `intake_forms` stay as read-only archives. The live write path is removed. Optional later backfill into `form_submissions` if old rows must appear in the inbox.
4. Should submitted forms be strictly frozen, or do we need post-submit amendments with audit?
5. **Resolved:** no open sign-up; Admin Team Management provisions all internal accounts after one-time bootstrap.
