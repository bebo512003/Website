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
