# Agency OS

Agency OS is an English-language operations workspace for creative agencies. It is built with Next.js 16, React 19, TypeScript, Tailwind CSS, and Supabase.

The application contains no seeded users or placeholder business records. All dashboard metrics, clients, projects, assignments, tasks, files, and notifications come from the authenticated Supabase project.

## Features

- Supabase email/password authentication, sign-up, sign-out, and password reset
- Admin, Manager, Employee, and Client account types
- Admin-managed employee job roles (Designer, Translator, Copywriter, Developer, …) with no hardcoding
- Employee active/inactive status — inactive accounts immediately lose all workspace access
- Database-enforced Row Level Security (RLS)
- Employee access limited to explicitly assigned projects
- Clients are never employees: form submitters who sign in get a client account with portal access only
- Admin controls for user roles, job roles, statuses, projects, and employee assignments
- **Dynamic form builder**: admins create, publish, duplicate, reorder, disable, archive, and delete forms and their questions entirely from the website — respondents answer them at public `/f/<slug>` links
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
| Client | Form submitters who later create a login with the same e-mail. Clients land on the client portal, never see the staff dashboard, never appear in employee lists, and have no staff permissions. |

The first real account created in an empty workspace becomes the bootstrap Admin. Later sign-ups become Employees — **unless** their e-mail matches a client record created by a form submission, in which case they automatically become a Client linked to that record. The database prevents removal or deactivation of the final active Admin. Inactive accounts are blocked by RLS throughout the database and by the application shell.

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

## Dynamic forms (no-code form builder)

Form templates, questions, options, and order live in the database; the frontend renders
whatever the admin configures — nothing is hardcoded per form.

1. Sign in as an Admin, open **Administration → Forms**, and click **New form**.
2. In the builder, add questions (short/long text, single & multiple choice, Yes/No,
   dropdown, number, date, file upload, rating), set required/placeholder/help text,
   reorder with the arrows, and edit answer options.
3. Click **Enable form** to publish. Share the public link `/f/<slug>` — respondents do
   not need an account (Supabase **Anonymous sign-ins** must be enabled, same as `/intake`,
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
npm run build
npm run lint
```

## Public Intake Forms

The `/intake` page lets new clients submit service requests without creating an account. It uses **Supabase Anonymous Sign-in**. To enable this feature:

1. Go to **Supabase Dashboard → Authentication → Providers**
2. Scroll to **Anonymous** and toggle **Enable Anonymous Sign-ins** to ON

Without this toggle, anonymous authentication will fail and the intake form will not load for unauthenticated visitors.

## Security notes

- Never expose a Supabase `service_role` key to this application.
- Authorization is enforced in PostgreSQL policies, not only in UI checks.
- The `profiles.role` column cannot be updated directly by browser clients. Role changes go through an Admin-only database function.
- The `project-files` bucket is private. Object policies derive project access from the first folder in each storage path.
- For a closed workspace, disable public sign-ups in Supabase after creating the initial Admin and invite users through your preferred onboarding process.
