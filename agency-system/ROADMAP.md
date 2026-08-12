# Agency OS roadmap

## Completed foundation

- English-only product interface
- Supabase email/password authentication and password recovery
- Admin, Manager, Employee, and Client role architecture with public account creation disabled
- Admin-managed employee job roles and active/inactive statuses enforced by RLS
- Employee project assignment boundaries enforced with RLS
- Admin user-role, job-role, status, and project-assignment controls
- Live clients, projects, tasks, files, reports, and notifications
- Private project file storage
- Responsive navigation and explicit empty/loading/error states
- Dynamic admin-managed form builder (templates, questions, options, publish/archive, public /f/<slug> rendering, per-question answer snapshots, public submissions with client automation)
- Team Management (Admin-created Auth accounts with initial credentials, dynamic roles, extended profiles, job/department/specialization fields, and avatar storage)
- Team Directory (permission-guarded /team page with member cards, full member profiles, search + role/department/status filters; clients excluded, inactive members hidden from regular staff)
- Self-service profile editing (per-user /profile: personal & professional fields, social links, avatar upload/replace/remove, independent password changes, owner-only RPC with admin-protected role/status fields, full validation and inline loading/success/error states)
- Roles & permissions enforcement (checkbox-driven capabilities actually open their management areas; employees cannot read submissions or client records unless granted; inactive users lose every permission)
- Storage & file upload security (centralized bucket rules, strict MIME and extension whitelists, pre-upload UX validation, backend attachment verification, executable blocking, folder isolation, signed URLs, and orphaned object management)
- Legacy `/intake` system retired: Request a New Project goes only through Dynamic Forms (`/forms` → `/f/<slug>`); intake RPC, write policies, and notification trigger removed; historical tables kept read-only
- Admin Submission Inbox (`/submissions`): full operational inbox with search, status/form filters, sorting, complete answer+file review using the stored question snapshots, a status workflow (New/Reviewing/Need Information/Qualified/Rejected/Approved/Converted/Archived), and reviewer/owner assignment
- Submission Review Workflow (Session 10): full qualification and review system with internal review notes (`form_submission_notes`), audit events & timeline history (`form_submission_events`), authorized reviewer validation, reviewer notifications, qualification status progression, and strict RLS protecting internal notes and audit events from unauthorized staff and clients
- Project Ownership, Status & Lifecycle (Session 12): explicit project Owner + Manager (always kept as project members by a database trigger, so ownership is visible and grants access), priority, deadline, team assignments, and a health indicator (`on-track` / `at-risk` / `off-track` / `blocked`). Projects follow a database-enforced lifecycle — Draft → Planned → Active → Waiting for Client → In Review → Ready for Delivery → Delivered → Completed, plus On Hold and Cancelled — with a valid-transition state machine, a visual lifecycle tracker, one-click status moves, and team management on the project detail page
- Employee My Work & Task Management (Session 13): a personal `/my-work` workspace (Open / Due today / Upcoming / Overdue / High-priority summary cards as one-click filters, tasks grouped by project with progress, inline status moves, completed archive, notification deep links via `/my-work?task=<id>`); a shared task detail dialog covering assignment, status, priority, due date, description, project, and an append-only activity feed with permission-checked work notes; and database-enforced assignment rules — assignees must be active project members (or hold `project.view_all`), assigning other people requires `task.assign`, non-members can never receive tasks, and removing a project member releases their open tasks while completed work keeps attribution
- Project Activity & Audit Timeline (Session 14): a unified, append-only history shown on the project detail page that merges project-level events (`project_activity` — creation, submission conversion, owner/manager, status, deadline, team membership, file upload/delete) with task-level events (`task_activity`). Every entry shows who acted, what changed, and when, grouped by day. Audit/system events are written only by SECURITY DEFINER triggers (unforgeable, no insert/update/delete policies) and are kept strictly separate from client-facing comments, which live in the `comments` table.
- Project Delivery & Closure (Session 15): the operational end of the lifecycle — Active → In Review → Ready for Delivery → Delivered → Completed → Archive. Staff attach **final delivery files** to an internal versioned package (`project_deliveries` / `project_delivery_files`, separate from working files), mark the delivery, record **revision required**, and record an **internal client-approval placeholder**. Completed is rejected by the database unless a final file exists, the package is delivered, and that internal approval is recorded. Archive is a flag (not a status) allowed only after Completed or Cancelled. Delivery tables are staff-only; future client-facing approval must live in a separate table and must not write here.
- Public Submission Confirmation & Tracking (Session 16): after submitting a form on `/f/[slug]`, clients receive a professional confirmation view with a unique request reference number (`REQ-YYMM-XXXXXX`), form/service name, submission timestamp, a 3-step 'What happens next' roadmap, expected response time (1–2 business days), and agency contact details. A secure, read-only tracking mechanism (`/track?ref=...` and `/track/[reference]`) allows clients to track real-time progress through a 4-stage pipeline (Received → In Review → Qualified/Approved → In Production) without creating an account. The tracking view exposes only minimal, sanitized submission metadata via a hardened `get_public_submission_tracking` RPC, strictly hiding internal review notes, reviewer assignments, and audit events.
- Client Portal (Session 17): an invitation-only, authenticated area for the Client role at `/portal`. Admins invite a client from the client detail page (**Portal access**), provisioning a CRM-linked login with a one-time temporary password (forced to change on first login, same as staff). The invited client gets a dashboard of their own projects (live lifecycle stage + progress) and service requests, plus a sanitized project detail page at `/portal/projects/<id>`. All portal reads go through SECURITY DEFINER RPCs (`get_client_portal_projects`, `get_client_portal_project`, `get_client_portal_client`) scoped to the caller's own CRM record; clients never read the raw `projects`/`clients` tables and never see internal notes, employee tasks, staff permissions, internal activity, private files, or other clients/projects. Public form submitters have no portal access until explicitly invited, and suspended client accounts lose access immediately.
- Deadline & Escalation Automation (Session 20): a server-side job (`run_deadline_reminders`, invoked by `GET /api/cron/reminders` on a daily schedule) sends in-app reminders for tasks due soon / today / overdue and projects whose deadline is approaching or already past. Assignees get the task reminders; overdue tasks escalate to the project manager and owner. Inactive and pending-password accounts are skipped. Each delivery is recorded in `reminder_events` and deduped so the same state never notifies twice.
- Client Feedback, Shared Files & Approval (Session 18): the portal now shows only **selected** files (`client_shared_files` plus delivered package files), a **client-visible** conversation (`client_messages`, never mixed with internal `comments`), and real **approve / request revision** actions (`client_approvals`). Client feedback notifies the project owner (and manager). Approval stamps the delivery `approved_by_client` and satisfies completion blockers. A client revision request is a first-class operational event (`client_revision_requested`) that returns the project to In review and opens a new preparing package. Isolation is enforced in PostgreSQL: clients cannot read internal comments, raw files, delivery tables, or another client's data; storage signed URLs work only for allow-listed objects.

## Next priorities

### Collaboration

- Realtime refresh subscriptions for project tasks and comments
- Mentions and notification preferences
- Audit history for role and assignment changes

### Operations

- Pagination and indexed full-text search for large workspaces
- Project milestones and time tracking
- Bulk assignment tools
- CSV import and export

### Integrations

- Optional AI provider integration with stored conversation consent
- Slack and Microsoft Teams notifications
- Google Workspace and Microsoft 365 file integrations

### Quality

- Unit tests for data adapters
- RLS integration tests against a temporary Supabase project
- Browser tests for authentication, administration, and employee isolation
- Accessibility audit against WCAG 2.2 AA
