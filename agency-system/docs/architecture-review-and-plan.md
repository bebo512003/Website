# Architecture review & evolution plan

Prepared 2026-08-09. Analysis only — no behavior changes.

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

## 1. Current architecture

**Stack:** Next.js 16 (App Router, all pages are client components), React 19, TypeScript,
Tailwind 4, Supabase (Auth + Postgres + Storage) via the browser-only `@supabase/supabase-js`
client. There is no server-side Supabase usage and no `service_role` key anywhere.

**Layers:**

- `lib/supabase/client.ts` — singleton browser client from `NEXT_PUBLIC_` env vars.
- `lib/supabase/types.ts` — hand-written `Database` types (mirrors SQL schema).
- `lib/supabase/auth.ts` — sign-up/sign-in/anonymous/reset/profile helpers.
- `lib/supabase/database.ts` — one async function per table operation, all wrapped in
  `Result<{ data, error }>`. This is the single data-access layer; extend it, don't bypass it.
- `contexts/auth-context.tsx` — session + `profile` (from `public.profiles`), exposes
  `isAdmin` / `isManager` / `isAnonymous` booleans.
- `components/layout/app-shell.tsx` — route gate: everything except `/auth` and `/intake`
  requires a signed-in, non-anonymous user; otherwise redirect to `/auth`.
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

Staff users are created **only** by email/password sign-up at `/auth`: `handle_new_user`
inserts a `profiles` row — the first real account in an empty workspace becomes `admin`
(advisory-lock protected), every later one becomes `employee`.

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
- `/auth` has a gate: "team member" (sign-in form) vs "new client" (→ `/intake` anonymous
  flow). Anonymous sessions are blocked from the workspace by `AppShell`.

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

1. Do clients get **login accounts/portal**, or stay CRM records only? (Plan supports both;
   Phase C is skippable without breaking the rest.)
2. Employee roles: labels only, or full granular permission matrix from day one?
3. Migrate historical `intake_forms` into the new tables, or leave them read-only/legacy?
4. Should submitted forms be strictly frozen, or do we need post-submit amendments with audit?
5. Employee onboarding stays open sign-up, or moves to admin invites (affects bootstrap login)?
