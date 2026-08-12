# Agency OS

Agency OS is an English-language operations workspace for creative agencies. It is built with Next.js 16, React 19, TypeScript, Tailwind CSS, and Supabase.

The application contains no seeded users or placeholder business records. All dashboard metrics, clients, projects, assignments, tasks, files, and notifications come from the authenticated Supabase project.

## Features

- Closed Supabase email/password authentication: login, sign-out, and password reset (no public sign-up)
- Admin, Manager, Employee, and Client account types
- Admin-managed employee job roles (Designer, Translator, Copywriter, Developer, …) with no hardcoding
- Employee active/inactive status — inactive accounts immediately lose all workspace access
- Database-enforced Row Level Security (RLS)
- Employee access limited to explicitly assigned projects
- Public form submitters remain CRM clients and never need or receive login accounts
- Admin-only creation of employee, manager, and additional Admin login accounts from Team Management
- Admin controls for user roles, job roles, statuses, projects, and employee assignments
- **Dynamic form builder**: admins create, publish, duplicate, reorder, disable, archive, and delete forms and their questions entirely from the website — respondents answer them at public `/f/<slug>` links
- **Admin Submission Inbox** at `/submissions`: the operational inbox for every public form response with search, status/form filters, sorting, full answer & file review, a status workflow, and reviewer/owner assignment
- **Public company portfolio** at `/portfolio`, backed by a separate RLS-protected portfolio schema with admin-managed projects, categories, images, ordering, featured flags, and publishing
- Project and client create, read, update, and delete workflows
- Project task workflow and progress updates
- Private file upload and download through Supabase Storage
- Assignment and project update notifications
- Reports calculated from authorized live records
- Dark/light themes and a responsive desktop/mobile shell

## Role model

| Account type | Access |
| --- | --- |
| Admin | Manages users, system roles, job roles, statuses, project assignments, clients, projects, tasks, and files. |
| Manager | Manages clients, projects, tasks, and files. Cannot change account roles. |
| Employee | Sees only assigned projects and related clients, tasks, and files. Can work with tasks and files in those projects. Carries an admin-assigned job role (Designer, Translator, …) and an Active/Inactive status. |
| Client | Reserved portal role for existing/legacy client accounts. Public form submitters do not need accounts and are stored as CRM clients only. Client roles never appear in employee lists and have no staff permissions. |

Public account creation is disabled. After the one-time bootstrap Admin, every Employee, Manager, custom internal role, or additional Admin account is created from **Administration → Team Management**. The Admin selects the existing metadata-driven role and sets an initial password, then gives those credentials to the team member. Database Auth triggers reject direct sign-up requests and anonymous-account conversion, while the server provisioning route independently verifies the caller's `admin.manage` permission. The database still prevents removal or deactivation of the final active Admin. Inactive accounts remain blocked by RLS throughout the database and by the application shell.

## Local setup

```bash
npm ci
cp .env.local.example .env.local
```

Fill in the public values from **Supabase Dashboard → Project Settings → API**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key # server only; never NEXT_PUBLIC
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

For a new Supabase project, apply the generated `supabase/schema.sql` snapshot in the SQL Editor. For an existing project, apply every unapplied file in `supabase/migrations/` in filename order (or use the Supabase CLI migration workflow). The ordered migration directory is authoritative; `schema.sql` is generated from it and can be verified with `npm run db:schema:check`.

Then start the application:

```bash
npm run dev
```

## Closed account provisioning

1. Apply `supabase/schema.sql` on a new database. On an existing database, apply all
   unapplied migrations in filename order, including
   `20260818000000_database_foundation_consistency.sql`.
2. In **Supabase Dashboard → Authentication → Providers → Email**, turn **Allow new users
   to sign up** OFF. The database trigger also rejects public sign-up if this dashboard
   setting is accidentally re-enabled.
3. Keep **Anonymous Sign-ins** ON so public `/forms` and `/f/<slug>` submissions continue
   to work without an account.
4. Add `SUPABASE_SERVICE_ROLE_KEY` only to the server/deployment environment. Never prefix
   it with `NEXT_PUBLIC`.
5. Existing installations keep their current Admin. On a brand-new empty installation,
   set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, and optionally
   `BOOTSTRAP_ADMIN_NAME` in `.env.local`, run `npm run bootstrap:admin` once, then remove
   those three bootstrap values.
6. Login as Admin and use **Administration → Team Management → Create Team Account** for
   every employee, manager, custom internal role, or additional Admin. Give the generated
   e-mail/initial-password credentials to that person securely.

Public form submissions create CRM client records and projects as configured; they do not
create Auth users. Password reset remains available from `/auth` for existing accounts.

## Dynamic forms (no-code form builder)

Form templates, questions, options, and order live in the database; the frontend renders
whatever the admin configures — nothing is hardcoded per form.

1. Sign in as an Admin, open **Administration → Forms**, and click **New form**.
2. In the builder, add questions (short/long text, single & multiple choice, Yes/No,
   dropdown, number, date, file upload, rating), set required/placeholder/help text,
   reorder with the arrows, and edit answer options.
3. Click **Enable form** to publish. Share the public link `/f/<slug>` — respondents do
   not need an account (Supabase **Anonymous sign-ins** must be enabled
   for file uploads and submission ownership).
4. **Responses** arrive in the builder's *Responses* tab with a frozen per-question
   snapshot. If a question is mapped to a contact field (name/e-mail/phone/company), the
   submission automatically matches or creates the CRM client record, and optionally opens
   a project.
5. Duplicate, disable/enable, archive (keeps history), or delete (only when a form has no
   responses) from **Administration → Forms** or the builder header.

Managing forms requires the `form.manage` permission (granted to Admin by default;
grantable to any role from *Roles & permissions*). To add a new question type later:
allow it in the `form_questions.question_type` CHECK + the `submit_dynamic_form`
validation, register it in `lib/forms/question-types.ts`, and add a render branch in
`components/forms/dynamic-form-renderer.tsx`.

## Admin Submission Inbox

`/submissions` (linked in the sidebar as **Submissions**) is the operational inbox for
every public form response. It is permission-guarded by `submission.view`; reading a
submission never rebuilds or mutates the stored data — each answer is rendered from the
frozen per-question snapshot captured at submit time.

- **List** every submission with its form name, client information, submission date,
  current status, and reviewer/owner.
- **Search** across respondent name/e-mail/phone, company, and form title.
- **Filter** by workflow status and by form, and **sort** by newest / oldest / status.
- **Open** any submission to see every answer next to its original question, plus any
  submitted files (downloaded through temporary signed links from the private
  `form-files` bucket).
- **Workflow statuses** — New, Reviewing, Need Information, Qualified, Rejected,
  Approved, Converted, Archived. New submissions start at **New**; changing status
  requires `submission.edit` (via the `update_form_submission_status` RPC, which
  validates the allowed set server-side).
- **Reviewer/owner** — assign or clear the internal team member responsible, requiring
  `submission.assign` (via the `assign_form_submission_reviewer` RPC).

The workflow lives in migration `20260825000000_admin_submission_inbox.sql`, which also
widens the `form_submissions.status` CHECK constraint and migrates any legacy
`submitted` rows to `new`. The underlying submission storage (answers, question
snapshots, attachments) is unchanged. Permissions: `submission.view` (read),
`submission.edit` (status), `submission.assign` (ownership) — all granted to Admin and
Manager by default.

## Public company portfolio

The public portfolio is deliberately separate from the internal employee workspace:

- Public visitors open `/portfolio` or `/portfolio/<project-slug>` without signing in.
- Admins open **Administration → Portfolio Management** to create and edit portfolio projects, manage categories, upload images, choose a cover image, reorder projects, feature projects, and publish/unpublish them.
- A project is visible publicly only when `published = true` and `archived = false`. Drafts, unpublished projects, archived projects, and their images remain private through PostgreSQL RLS and the private `portfolio-images` Storage bucket.
- The migration `supabase/migrations/20260814000000_public_portfolio.sql` creates the portfolio tables, default categories, the `portfolio.manage` permission, RLS policies, and storage policies. Apply all migrations (or the complete `supabase/schema.sql`) before using this feature.

Recommended smoke test:

1. Sign in as an Admin and open **Administration → Portfolio Management**.
2. Create a project, select images, set the cover image, and click **Publish project**.
3. Open `/portfolio` in a private/incognito window. The published project and its details page should load without login.
4. Turn publishing off or archive the project; refresh the private window and confirm it no longer appears.

## Validation

```bash
npm test                 # schema parity + database/RLS regression suite
npm run build
npm run lint
```

## Public client routes and project requests

The client-facing flow is deliberately separate from the staff workspace:

| Route | Public behavior |
| --- | --- |
| `/` | Landing page with **Request a New Project**, **Portfolio**, and **Login** paths. |
| `/forms` | Lists published Dynamic Forms only. New Admin-published forms appear automatically. |
| `/f/<slug>` | Renders and submits a published form without sign-up or client credentials. |
| `/portfolio` | Lists only published, non-archived portfolio projects. |
| `/portfolio/<slug>` | Shows a public project only while it remains published and non-archived. |
| `/auth` | Login/reset for existing team accounts only; there is no public sign-up. |

**Request a New Project** always opens `/forms`. There is no competing `/intake` wizard; old `/intake` bookmarks permanently redirect forward to `/forms`. No current CTA points to `/intake`.

Public submissions use **Supabase Anonymous Sign-in** behind the scenes. The visitor never registers, chooses a password, receives a client account, or enters a portal. The short-lived anonymous identity lets the database rate-limit submissions, attribute the response, and authorize private file uploads.

Before production launch:

1. Go to **Supabase Dashboard → Authentication → Providers**.
2. Keep **Email → Allow new users to sign up** OFF.
3. Turn **Anonymous → Enable Anonymous Sign-ins** ON. This is required for public form submission and file uploads; without it the form displays a configuration warning instead of asking the client to log in.
4. Apply every migration in `supabase/migrations/` (or `supabase/schema.sql` for a fresh project).
5. Set the deployment values from `.env.local.example`, especially the Supabase URL/anon key and the real `NEXT_PUBLIC_SITE_URL`.
6. Publish at least one form in **Administration → Forms** and, optionally, portfolio projects in **Administration → Portfolio Management**.
7. Smoke-test `/forms`, one `/f/<slug>`, and `/portfolio` in an incognito window.

## Security notes

- Never expose the Supabase `service_role` key to browser code or a `NEXT_PUBLIC_*` variable. It is used only by the protected server Route Handler after JWT and `admin.manage` verification.
- Public account creation is rejected by an `auth.users` trigger, not only hidden in the UI. Keep Supabase's Email provider sign-up toggle OFF as an additional Auth-layer control.
- Authorization is enforced in PostgreSQL policies, triggers, and permission-checked RPCs, not only in UI checks.
- The `profiles.role` column cannot be updated directly by browser clients. Role changes go through an Admin-only database function.
- The `project-files` bucket is private. Object policies derive project access from the first folder in each storage path.
- Internal users must be provisioned through Admin Team Management. Do not create employee accounts through public Auth endpoints.
