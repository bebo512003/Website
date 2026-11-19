# Beshoy Ashraf website and workspace

The public site hosts Beshoy Ashraf’s portfolio and project request forms. Agency OS is the accompanying operations workspace. It is built with Next.js 16, React 19, TypeScript, Tailwind CSS, and Supabase.

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
- **Submission Review Workflow & Inbox** at `/submissions`: the operational review workflow for every public form response with stage pipeline metrics, search, status & reviewer filters, sorting, complete answer & file review, internal review notes feed, reviewer notifications, and tamper-evident audit history tracking who performed each action with timestamps
- **Controlled Submission → Project Conversion**: Admins deliberately convert only Qualified/Approved submissions through client selection/creation, project configuration, owner/manager/team assignment, and a final confirmation; the database keeps immutable submission provenance and rejects duplicate/concurrent conversions
- **Project ownership, status & lifecycle** (Session 12): every project carries an Owner, Manager, priority, deadline, health (`On track` / `At risk` / `Off track` / `Blocked`), and an assigned team. Projects move through a database-enforced lifecycle — Draft → Planned → Active → Waiting for Client → In Review → Ready for Delivery → Delivered → Completed, plus On Hold and Cancelled — where only valid transitions are accepted, the owner and manager are always project members, and ownership is shown across the project list, project detail, dashboard, and reports
- **Project delivery & closure** (Session 15): after Active / In Review, staff assemble a **final delivery package**, mark it Ready / Delivered, record **revision required**, record an **internal client-approval placeholder**, then Complete and Archive. The database rejects Complete unless those delivery conditions are met. Delivery data is internal and kept separate from any future client-facing approval UI
- **Selected work** at `/#work`: four projects from Beshoy Ashraf’s Behance. Admin-managed public detail links still use RLS; unpublished workspace projects stay private.
- **Public performance & SEO** (Session 27): landing, project desk, and portfolio detail pages fetch published data on the server (session-less anon client + 120s cache), emit Open Graph / Twitter metadata, a sitemap, and robots rules, and serve portfolio images through a published-only proxy with responsive `next/image` sizes and alt text.
- **Client Portal** (Session 17–18) at `/portal`: an invitation-only, authenticated area for the Client role. Admins invite a client from the client detail page (creating a linked login with a temporary password); the invited client sees a dashboard with their own projects, live lifecycle status and progress, **selected/shared files**, **deliverables**, a **client-visible conversation**, and **approve / request revision** actions. All portal reads and writes go through SECURITY DEFINER RPCs scoped to the client's own CRM record — internal notes, employee tasks, staff permissions, internal activity, private working files, and other clients/projects are never exposed. Client feedback notifies the project owner; approval updates the delivery state; a revision request is a first-class operational event
- Project and client create, read, update, and delete workflows
- **Employee My Work workspace** (Session 13) at `/my-work`: every task assigned to the signed-in user across authorized projects, with live Open / Due today / Upcoming (7 days) / Overdue / High-priority summaries that act as one-click filters, a per-project grouping with completion progress, an inline status control, and a completed-work archive; task-assignment notifications deep-link straight into it
- **Task management with accountability**: a shared task detail dialog (status, priority, assignee, due date, description, project) plus an append-only per-task activity feed — automatic change history (created, status, priority, assignee, due date, title, description, project moves) with actor attribution, and permission-checked work notes
- **Database-enforced task assignment**: tasks can only be assigned to active team accounts that belong to the project, or to staff the permission model explicitly grants project-wide access (`project.view_all`); assigning to other people requires `task.assign`, and removing a project member releases their open tasks back to unassigned while completed work keeps its attribution
- Private file upload and download through Supabase Storage
- Assignment and project update notifications
- **Deadline & escalation reminders** (Session 20): a daily server job (not the browser) notifies assignees of tasks due soon / today / overdue, escalates overdue tasks to the project manager and owner, and reminds owner/manager when a project deadline is approaching or overdue. Deliveries are recorded in `reminder_events` and never duplicated.
- **Transactional email notifications** (Session 21): server-side transactional email through Resend for the high-value events only. Client emails: submission received (with reference + tracking link), portal invitation (no credentials in email), delivery ready, and revision/approval confirmations. Internal emails: new submission (to staff with `submission.view`), important assignments (task / project owner-manager / team member), and important project updates (client feedback, approval, revision requests → owner + manager). Events are enqueued into a server-only `email_outbox` (dedupe-unique), flushed by a cron-protected server job, and delivery status is tracked via signed Resend webhooks into `email_delivery_events`. Every other in-app notification remains inbox-only for now.
- **Search, filtering & pagination in the database** (Session 23): every large collection — submissions inbox, clients, projects, tasks board, team (admin table + public directory), forms, portfolio, and notifications — is now filtered, sorted, and paged server-side; the browser receives only one page of rows plus the exact total. Shared pieces: debounced search inputs, a reusable pager, and parameterized Supabase queries (ilike/eq/in/order/range + exact counts). The submission inbox additionally uses two SECURITY INVOKER functions — `get_submission_inbox_page` (search across respondent fields, form title, and reviewer name; status/reviewer/form filters; newest/oldest/workflow-priority sorts; one round trip returns the page + total) and `get_submission_pipeline_counts` (summary cards aggregated in Postgres) — so RLS still governs every row read. The tasks board pages per column with "show more"; project/clients/forms/portfolio/notifications/team get explicit page controls; summary counts (pipeline stages, project status cards, notification tabs) are computed with database head queries instead of shipping whole collections to the browser.
- **Operational analytics** (Session 24) at `/reports`: one permission-checked database aggregate turns real workflow history into management reporting — submission volume and source, submission-to-project conversion, median first staff response, active projects and lifecycle mix, overdue/unassigned work, team workload, and first-delivery timeliness/revisions. Select 7/30/90-day or 12-month windows; submissions and deliveries follow the selected period while project/task/workload cards remain a live snapshot. Project data follows the caller's project access and submission data additionally requires `submission.view`. The report deliberately contains no budget, revenue, invoice, profit, rate, client-value, or other financial metrics.
- Dark/light themes and a responsive desktop/mobile shell

## Role model

| Account type | Access |
| --- | --- |
| Admin | Manages users, system roles, job roles, statuses, project assignments, clients, projects, tasks, and files. |
| Manager | Manages clients, projects, tasks, and files. Cannot change account roles. |
| Employee | Sees only assigned projects and related clients, tasks, and files. Can work with tasks and files in those projects. Carries an admin-assigned job role (Designer, Translator, …) and an Active/Inactive status. |
| Client | Invitation-only portal role. Sees their own projects, selected/shared files, deliverables, and client-visible messages; can leave feedback, approve a delivery, or request a revision. Never sees internal comments, staff tasks, or other clients. Public form submitters do not receive this role until an Admin invites them. |

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
CRON_SECRET=generate-a-long-random-string
RESEND_API_KEY=                    # transactional email (Session 21)
RESEND_WEBHOOK_SECRET=             # delivery-status webhooks (optional)
EMAIL_FROM_ADDRESS=                # verified sender, e.g. notifications@yourdomain.com
```

Deadline reminders run on the server. After deploy, set `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` in the host environment. Vercel Cron hits `GET /api/cron/reminders` every day at 07:00 UTC and sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set. Apply `supabase/migrations/20260905000000_deadline_escalation_reminders.sql` (or regenerate `schema.sql`) first. You can also trigger the same route from any external scheduler.

## Site identity and contact

The [Beshoy Ashraf design system](https://claude.ai/artifact/UB4ChUdzeDQPf2yfWshXMY#components) is implemented in `app/globals.css` and `components/public/brand.tsx`. Geist, Geist Mono and Alexandria are self-hosted. The public site and client portal use the carbon palette; the staff workspace retains a private light appearance preference.

Update public contact details in `lib/contact.ts`. The footer, submission receipt, tracking view, and client-facing emails use those values. The WhatsApp link is derived from the same international number as the call link. These are site-owner details, not customer or staff account data.

The public Supabase tracking RPC mirrors the contact details for direct API consumers. Existing databases must apply `supabase/migrations/20261118000000_public_tracking_contact.sql`. If the details change again, add a follow-up migration and regenerate the schema snapshot rather than rewriting migration history.

## Transactional email (Session 21)

Email goes through **Resend**, triggered by a server-side queue — the browser never
touches provider credentials.

| Event | Template | Recipients | When |
| --- | --- | --- | --- |
| Submission received | `submission-received` | The submitter (respondent email) | Every public form submission (includes the reference number + public tracking link) |
| Client invitation | `client-invitation` | The invited portal client | Admin provisions a portal account (never contains the password) |
| Delivery ready | `delivery-ready` | Client portal accounts | A delivery package is marked delivered |
| Revision / approval update | `revision-approval-update` | The acting client | The client approves or requests a revision (confirmation receipt) |
| New submission | `new-submission` | Staff with `submission.view` | Every public form submission (no respondent email/phone in the mail) |
| Important assignment | `task-assigned` / `project-assigned` | Task assignee · new owner/manager · new team member | Task assignment, ownership changes, team member added |
| Important project update | `project-update` | Project owner + manager | Client feedback, approval, or revision request |

How it works:

1. Database triggers (plus the admin provisioning route for invitations) enqueue rows
   into `email_outbox`. A unique `(template_key, dedupe_key)` index makes duplicate
   delivery structurally impossible.
2. `GET /api/cron/emails` (Vercel Cron, once daily at 07:10 UTC, protected by
   `Authorization: Bearer $CRON_SECRET`) claims a batch with an optimistic status
   guard, renders the branded template, and sends via the Resend API. Transient
   failures back off exponentially (up to 6 attempts); stale rows expire after 72h.
   The form-submit and client-invitation server routes also flush immediately as a
   best effort. The daily reminders job flushes the same queue so Hobby-plan
   deployments still deliver mail the same day.
3. `POST /api/email/resend-webhook` verifies the Svix-style signature with
   `RESEND_WEBHOOK_SECRET` and records `sent`/`delivered`/`bounced`/`complained`
   events in `email_delivery_events`, updating the matching outbox row by
   `provider_message_id`.

Setup:

1. Apply `supabase/migrations/20260906000000_transactional_email.sql` (or regenerate
   `schema.sql`).
2. Create an API key at **resend.com → API Keys** and set `RESEND_API_KEY` in the
   host environment. Until a sending domain is verified, Resend only delivers to
   your own account email from `onboarding@resend.dev`.
3. Verify your domain (Resend → Domains) and set
   `EMAIL_FROM_ADDRESS=notifications@yourdomain.com` (and optionally
   `EMAIL_FROM_NAME` / `EMAIL_BRAND_NAME`, which default to Beshoy Ashraf).
   Client notifications use the public contact address as `Reply-To`; keep a
   Resend-verified address as `From`.
4. Create a webhook at **resend.com → Webhooks** pointing at
   `https://<your-deploy>/api/email/resend-webhook` for `sent`, `delivered`,
   `bounced`, and `complained` events, copy its signing secret into
   `RESEND_WEBHOOK_SECRET`.
5. Confirm Vercel Cron runs `/api/cron/emails` (`vercel.json` ships a 5-minute
   schedule; adjust for your plan — the Hobby plan only runs daily). Any external
   scheduler that sends the cron secret works too.

Until `RESEND_API_KEY` is set the queue simply accumulates and the cron route
returns 503; nothing is ever sent from the client.

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

Public form submissions may match/create CRM client records, but projects are **not** created
by default. Normally an Admin qualifies/approves the submission and deliberately converts it
from `/submissions`. Submit-time project automation is an exceptional Admin-only form setting
that requires an explicit warning confirmation. Public submitters never create Auth users.
Password reset remains available from `/auth` for existing accounts.

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

## Controlled submission-to-project conversion

The normal lifecycle is **Submission → Qualified / Approved → Convert to Project →
Select/Create Client → Configure Project → Assign Owner/Manager → Assign Team → Confirm →
Create Project**.

1. Sign in as an Admin and open `/submissions`.
2. Review the frozen answers/files and mark the response **Qualified** or **Approved**.
3. Click **Convert to Project**.
4. Select the linked/existing CRM client or create a new one; set project name, type,
   priority, initial status/phase, start date/deadline, optional budget, owner, manager,
   and initial team.
5. Review the final confirmation and click **Confirm & Create Project**.

Conversion is an atomic, Admin-only database RPC. It locks the submission, rejects a
second or concurrent conversion, creates/selects the client, creates the project and team
assignments, marks the submission Converted, and writes an audit event in one transaction.
`projects.source_submission_id` is immutable, while answers and attachments stay on the
original submission and remain reachable from the project detail page.

Public submissions do not create projects by default. An Admin can opt a specific form into
legacy submit-time automation from **Administration → Forms → Form details**, but enabling
it shows a warning and records which Admin configured it. Non-Admins cannot enable that
setting. Keep it disabled for the controlled workflow above.

Apply `supabase/migrations/20260827000000_controlled_submission_project_conversion.sql`
(or the regenerated `supabase/schema.sql` on a fresh database) before using this UI.

## Project delivery & closure

The project detail page has a **Delivery & closure** panel. This is a staff workflow:

1. Attach at least one **final delivery file** (upload a new file or pick an existing project file). Working files in `/files` do not count until they are added to the package.
2. Mark the package **Ready**, then **Delivered** (or use the status buttons — the database requires the file).
3. If the client wants changes, **Request revision**. The current package is marked revision-requested and a new preparing package is opened; the project returns to In review.
4. Record the **internal client-approval placeholder** (how the client approved — call, email, meeting). This is a staff note, not a client portal action.
5. **Complete project**. The database rejects this if any checklist item is missing.
6. **Archive** after Completed or Cancelled. Archived projects leave the default list and cannot change status until restored.

Client accounts cannot read or write delivery packages directly. Real client approval lives in `client_approvals` (Session 18) and is applied to the package by a SECURITY DEFINER RPC as `approved_by_client`. The internal placeholder remains as a fallback for off-portal sign-off.

Apply `supabase/migrations/20260831000000_project_delivery_closure.sql` and `supabase/migrations/20260903000000_client_feedback_shared_files.sql` (or the regenerated `supabase/schema.sql`) before using this UI.

## Public page design

The landing page and customer-facing routes share `PublicPage` and the components in `components/public/public-page-sections.tsx`: site navigation, footer, intro, section headings, and form/help layout. Use the existing color and type tokens in `app/globals.css`. The project desk, request form, and receipt share `RequestSteps` in both languages. Authenticated portal pages reuse the same headings and tokens with their own account navigation.

## Public company portfolio

The public portfolio is deliberately separate from the internal employee workspace:

- Open **Administration → Portfolio** (`/admin/portfolio`) with the **Manage portfolio** permission. Create or edit a project, add a title and card subtitle, upload images, pick a cover, and publish when ready.
- **Selected work** (`/#work`) shows only published, non-archived projects with **Show in Selected work** enabled. Use the **On homepage** filter and the arrows to reorder them. Adding a new project appends it to the collection. Turning off the selection hides its card but keeps its published detail link; unpublishing or archiving hides both.
- The projects stay in a compact, horizontally scrollable row if there are more cards than fit. Images are shown at their original proportions without cropping; the frame may have space around an image. Project details and uploaded galleries also show the whole image.
- `/portfolio` redirects to `/#work`. `/portfolio/<slug>` is the public detail route; previous `/portfolio/selected/<slug>` links redirect there. The homepage, details, and sitemap read current published data on each visit.
- The one-time migration `20261118000100_managed_selected_work.sql` moves the four existing Tahatan Holding, MERAAK, 3 Girls Fruit, and InventionsX cards into the same editor, with their original order and Behance art and links. A project with the same slug or Behance gallery ID is not overwritten or re-published. This is not an ongoing sync: any edit, unpublish or deletion from the editor is respected; there is no hardcoded fallback.
- The original Behance images are already public and loaded directly from their CDN. For uploaded images, the `portfolio-images` bucket stays private. The public site uses `/api/public/portfolio-image/<path>` instead of embedding signed URLs, rechecking that the project is published and not archived on every request. No `portfolio.manage` or storage policy changes are required.

**Deployment:** Apply all pending migrations (or the complete `supabase/schema.sql` for a new database) before deploying this code. In particular, the homepage needs the managed Selected work migration to populate the collection and add the new read API. The old portfolio RPCs continue to work.

Recommended smoke test:

1. Sign in with **Manage portfolio** and open **Administration → Portfolio**. Confirm the four original cards can be edited.
2. Create a draft, add images, choose a cover and verify its title is not on `/#work`. Then select **Show in Selected work** and **Publish project**.
3. Open `/#work` in an incognito window. The card should show the full cover and open a public detail page without login. Verify a mobile viewport and the previous `/portfolio/selected/<slug>` link.
4. Reorder or edit a selected project and refresh to see the update. Turn off its selection, then unpublish it; confirm the first action hides only the card, while the second also removes the detail page and blocks requests for uploaded images.

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
| `/forms` | Project desk: start a new brief from the published forms or track an existing request by reference/token. |
| `/f/<slug>` | Renders and submits a published form without sign-up or client credentials. |
| `/#work` | Published projects marked **Show in Selected work**. The old `/portfolio` listing redirects here. |
| `/portfolio/selected/<slug>` | Redirects legacy selected-project links to `/portfolio/<slug>`. |
| `/portfolio/<slug>` | Shows an admin-managed project only while it remains published and non-archived. |
| `/auth` | Login/reset for existing team accounts only; there is no public sign-up. |
| `/portal` | Authenticated Client Portal dashboard (invitation-only; clients are routed here after login). |
| `/portal/projects/<id>` | A client's own project status detail — sanitized, never internal staff data. |

**Request a New Project** opens `/forms`. The receipt and portal link to `/forms?ref=<reference>#track`, with `/api/forms/track` using the existing read-only tracking RPC. Legacy `/track?ref=…`, `/track?token=…`, `/track?key=…` and `/track/<reference>` links (including older emails) redirect to the same desk and retain the lookup key. Old `/intake` bookmarks redirect to `/forms`.

Public submissions use **Supabase Anonymous Sign-in** behind the scenes. The visitor never registers, chooses a password, receives a client account, or enters a portal. The short-lived anonymous identity lets the database rate-limit submissions, attribute the response, and authorize private file uploads.

Before production launch:

1. Go to **Supabase Dashboard → Authentication → Providers**.
2. Keep **Email → Allow new users to sign up** OFF.
3. Turn **Anonymous → Enable Anonymous Sign-ins** ON. This is required for public form submission and file uploads; without it the form displays a configuration warning instead of asking the client to log in.
4. Apply every migration in `supabase/migrations/` (or `supabase/schema.sql` for a fresh project).
5. Set the deployment values from `.env.local.example`, especially the Supabase URL/anon key and the real `NEXT_PUBLIC_SITE_URL`.
6. Publish at least one form in **Administration → Forms** and manage the homepage projects in **Administration → Portfolio**.
7. Smoke-test `/#work`, `/forms`, a published `/f/<slug>` and an existing `/track/<reference>` link in an incognito window. The published forms catalog can take up to two minutes to refresh; portfolio changes are visible on the next visit.

## Client portal

The authenticated portal is the destination for the **Client** role only. It is deliberately invitation-only: submitting a public form never creates a login, and a client can only reach `/portal` after an Administrator invites them.

1. In **Clients → a client record → Portal access**, an Admin clicks **Invite to portal** and enters the client's name and login e-mail.
2. The server provisions a client profile linked to that CRM record, creates the Auth login, and returns a one-time temporary password for the Admin to share securely.
3. The client signs in at `/auth` and replaces the temporary password (the same forced-password gate staff accounts use).
4. The client lands on `/portal`: a dashboard of their own projects (live lifecycle stage + progress) and their service requests, plus a per-project detail page at `/portal/projects/<id>`.
5. On that detail page the client can download **only selected files**, receive **deliverables**, leave **feedback**, **approve** a delivery, or **request a revision**. Feedback notifies the project owner. Approval stamps the package `approved_by_client`. A revision request records `client_revision_requested` and returns the project to In review with a new preparing package.

Every portal read (`get_client_portal_projects`, `get_client_portal_project`, `get_client_portal_client`, `get_client_portal_collaboration`) is a SECURITY DEFINER function that resolves the caller's linked CRM record and returns only that client's projects, and only client-appropriate fields. Clients never see internal notes (`comments`), employee tasks, staff permissions, internal activity, private working files, or other clients/projects — and they never read the raw `projects`/`clients`/`files`/`project_deliveries` tables (RLS still returns nothing to them). Storage signed URLs work only for allow-listed objects. Suspended (inactive) client accounts lose portal access immediately; revoking access removes both the profile and the Auth login.

Apply `supabase/migrations/20260902000000_client_portal.sql` and `supabase/migrations/20260903000000_client_feedback_shared_files.sql` (or the regenerated `supabase/schema.sql`) before using the portal.

## Security notes

- Never expose the Supabase `service_role` key to browser code or a `NEXT_PUBLIC_*` variable. It is used only by the protected server Route Handler after JWT and `admin.manage` verification.
- Public account creation is rejected by an `auth.users` trigger, not only hidden in the UI. Keep Supabase's Email provider sign-up toggle OFF as an additional Auth-layer control.
- Authorization is enforced in PostgreSQL policies, triggers, and permission-checked RPCs, not only in UI checks.
- The `profiles.role` column cannot be updated directly by browser clients. Role changes go through an Admin-only database function.
- The `project-files` bucket is private. Object policies derive project access from the first folder in each storage path.
- Internal users must be provisioned through Admin Team Management. Do not create employee accounts through public Auth endpoints.
