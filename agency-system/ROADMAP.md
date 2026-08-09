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
