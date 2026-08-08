# Agency OS

Agency OS is an English-language operations workspace for creative agencies. It is built with Next.js 16, React 19, TypeScript, Tailwind CSS, and Supabase.

The application contains no seeded users or placeholder business records. All dashboard metrics, clients, projects, assignments, tasks, files, and notifications come from the authenticated Supabase project.

## Features

- Supabase email/password authentication, sign-up, sign-out, and password reset
- Admin, Manager, and Employee roles
- Database-enforced Row Level Security (RLS)
- Employee access limited to explicitly assigned projects
- Admin controls for user roles, projects, and employee assignments
- Project and client create, read, update, and delete workflows
- Project task workflow and progress updates
- Private file upload and download through Supabase Storage
- Assignment and project update notifications
- Reports calculated from authorized live records
- Dark/light themes and a responsive desktop/mobile shell

## Role model

| Role | Access |
| --- | --- |
| Admin | Manages users, roles, project assignments, clients, projects, tasks, and files. |
| Manager | Manages clients, projects, tasks, and files. Cannot change account roles. |
| Employee | Sees only assigned projects and related clients, tasks, and files. Can work with tasks and files in those projects. |

The first real account created in an empty workspace becomes the bootstrap Admin. Every later sign-up receives the Employee role until an Admin changes it. The database prevents removal of the final Admin.

## Local setup

```bash
npm ci
cp .env.local.example .env.local
```

Fill in the public values from **Supabase Dashboard → Project Settings → API**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Apply `supabase/schema.sql` in the Supabase SQL Editor. The same SQL is available as a timestamped file under `supabase/migrations/` for CLI-based workflows.

Then start the application:

```bash
npm run dev
```

## Validation

```bash
npm run build
npm run lint
```

## Security notes

- Never expose a Supabase `service_role` key to this application.
- Authorization is enforced in PostgreSQL policies, not only in UI checks.
- The `profiles.role` column cannot be updated directly by browser clients. Role changes go through an Admin-only database function.
- The `project-files` bucket is private. Object policies derive project access from the first folder in each storage path.
- For a closed workspace, disable public sign-ups in Supabase after creating the initial Admin and invite users through your preferred onboarding process.
