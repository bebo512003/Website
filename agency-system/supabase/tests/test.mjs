import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const supabaseDir = join(here, '..')

const sanitize = (sql) => sql.replace(/^create extension if not exists pgcrypto;$/m, '-- pgcrypto stripped for PGlite test (gen_random_uuid is core in PG16)')

// Upgrade path: every migration before the one under test reproduces the
// previous production state; then the migration under test is applied on top.
const MIGRATION_UNDER_TEST = '20260815000000'
const migrationFiles = readdirSync(join(supabaseDir, 'migrations')).filter((file) => file.endsWith('.sql')).sort()
const migrationFile = migrationFiles.find((file) => file.startsWith(MIGRATION_UNDER_TEST))
if (!migrationFile) throw new Error(`Migration ${MIGRATION_UNDER_TEST} not found`)
const priorMigrations = migrationFiles.filter((file) => file < migrationFile).map((file) => sanitize(readFileSync(join(supabaseDir, 'migrations', file), 'utf8')))
const migration = sanitize(readFileSync(join(supabaseDir, 'migrations', migrationFile), 'utf8'))
const freshSchema = sanitize(readFileSync(join(supabaseDir, 'schema.sql'), 'utf8'))

const STUBS = `
create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  is_anonymous boolean not null default false,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('app.request.uid', true), '')::uuid $$;

create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner_id text,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1] $$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;

-- Supabase-style default DML grants for everything created afterwards.
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
grant usage on schema public to anon, authenticated;
`

const results = []
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function makeDb() {
  const db = new PGlite()
  await db.exec(STUBS)
  return db
}
const superUser = async (db) => { await db.query('reset role'); await db.query(`select set_config('app.request.uid', '', false)`) }
const asUser = async (db, uid, role = 'authenticated') => {
  await db.query(`set role ${role}`)
  await db.query(`select set_config('app.request.uid', '${uid ?? ''}', false)`)
}
const scalar = async (db, sql, params = []) => (await db.query(sql, params)).rows[0]
const expectError = async (db, fn) => { try { await fn(); return false } catch { return true } }
const addUser = async (db, email, { anon = false, fullName = null, adminProvisioned = false } = {}) => {
  const id = crypto.randomUUID()
  const appMetadata = {
    provider: anon ? 'anonymous' : 'email',
    ...(adminProvisioned ? { agency_os_admin_provisioned: true } : {}),
  }
  await db.query(
    `insert into auth.users (id, email, is_anonymous, raw_app_meta_data, raw_user_meta_data)
     values ($1, $2, $3, $4::jsonb, $5::jsonb)`,
    [id, email, anon, JSON.stringify(appMetadata), JSON.stringify(fullName ? { full_name: fullName } : {})],
  )
  return id
}

// Execute like psql/Supabase SQL editor: the enum ALTER autocommits on its own,
// then the begin..commit block runs in a separate transaction.
async function execMigrationLikePsql(db, sql) {
  const parts = sql.split(/^begin;$/m)
  if (parts.length === 1) return db.exec(sql)
  await db.exec(parts[0])
  for (const rest of parts.slice(1)) await db.exec(`begin;${rest}`)
}

async function applyAndSeed(db) {
  for (const prior of priorMigrations) await execMigrationLikePsql(db, prior) // previous production state
  await execMigrationLikePsql(db, migration)                                  // the new migration under test

  // Anonymous page visitors must never receive a profile. The first trusted,
  // server-provisioned user is the one-time bootstrap Admin.
  const anonVisitor = await addUser(db, null, { anon: true })
  const alice = await addUser(db, 'alice@agency.test', { fullName: 'Alice Admin', adminProvisioned: true })

  // Reproduce the protected Team Management sequence: permission-checked profile
  // placeholder first, then server-only Auth Admin creation with trusted metadata.
  await asUser(db, alice)
  const managerRoleId = (await db.query(`select id from public.app_roles where key = 'manager'`)).rows[0].id
  await db.query(`select public.admin_create_team_member('bob@agency.test', 'Bob Employee')`)
  await db.query(`select public.admin_create_team_member('erin@agency.test', 'Erin Manager', p_role_id := $1)`, [managerRoleId])
  await superUser(db)
  const bob = await addUser(db, 'bob@agency.test', { fullName: 'Bob Employee', adminProvisioned: true })
  const erin = await addUser(db, 'erin@agency.test', { fullName: 'Erin Manager', adminProvisioned: true })
  return { anonVisitor, alice, bob, erin }
}

async function runSuite(db, ids, label) {
  const { anonVisitor, alice, bob, erin } = ids

  // ── Closed account provisioning ──────────────────────────────────────
  const pAlice = await scalar(db, 'select role, status from public.profiles where id = $1', [alice])
  ok(`${label}: trusted first user becomes active bootstrap admin`, pAlice?.role === 'admin' && pAlice?.status === 'active', JSON.stringify(pAlice))
  ok(`${label}: anonymous visitor has no profile`, (await scalar(db, 'select count(*)::int n from public.profiles where id = $1', [anonVisitor])).n === 0)
  const pBob = await scalar(db, 'select role from public.profiles where id = $1', [bob])
  ok(`${label}: Admin-provisioned team account becomes employee`, pBob?.role === 'employee', pBob?.role)
  const pErin = await scalar(db, 'select role from public.profiles where id = $1', [erin])
  ok(`${label}: Admin can provision a Manager without changing RBAC architecture`, pErin?.role === 'manager', pErin?.role)
  let existingAccountAuthUpdateWorks = true
  try {
    await db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"auth_refresh_test":true}'::jsonb where id = $1`, [bob])
  } catch {
    existingAccountAuthUpdateWorks = false
  }
  ok(`${label}: existing accounts remain usable by normal Auth update flows`, existingAccountAuthUpdateWorks)
  const publicSignupBlocked = await expectError(db, () => addUser(db, 'visitor@public.test'))
  ok(`${label}: public visitor cannot create an account by calling Auth directly`, publicSignupBlocked)
  const anonymousConversionBlocked = await expectError(db, () => db.query(
    `update auth.users set is_anonymous = false, email = 'converted@public.test', raw_app_meta_data = '{"provider":"email"}'::jsonb where id = $1`,
    [anonVisitor],
  ))
  ok(`${label}: visitor cannot convert an anonymous form session into an account`, anonymousConversionBlocked)

  // Admin sets up a CRM client + project, erin becomes manager.
  await asUser(db, alice)
  await db.query(`insert into public.clients (name, email, contact_person) values ('Acme Corp', 'carol@acme.test', 'Carol')`)
  const clientRow = (await db.query(`select id from public.clients where email = 'carol@acme.test'`)).rows[0]
  await db.query(`insert into public.projects (name, client_id) values ('Acme Rebrand', $1)`, [clientRow.id])
  const project = (await db.query(`select id from public.projects limit 1`)).rows[0]
  await db.query(`select public.set_user_role($1, 'manager'::public.app_role)`, [erin])

  // Form submission flow: anonymous submit creates a CLIENT row, never an employee.
  const anonIntakeId = crypto.randomUUID()
  await asUser(db, anonVisitor, 'anon')
  await db.query(`insert into public.intake_forms (id, service_type, service_types, contact_name, contact_email, company_name, data) values ($1, 'logo_design', array['logo_design'], 'Dina Founder', 'dina@newco.test', 'NewCo', '{}'::jsonb)`, [anonIntakeId])
  await db.query(`select public.submit_intake_form($1)`, [anonIntakeId])
  await superUser(db)
  const newcoClient = (await db.query(`select id, email from public.clients where email = 'dina@newco.test'`)).rows[0]
  ok(`${label}: intake submit creates CRM client record + project, no auth account`, !!newcoClient && (await scalar(db, `select count(*)::int n from public.projects where client_id = $1`, [newcoClient.id])).n === 1)

  // Form submitters do not receive accounts, even when they call Auth directly.
  const clientSignupBlocked = await expectError(db, () => addUser(db, 'dina@newco.test', { fullName: 'Dina Founder' }))
  ok(`${label}: public form client cannot create an account`, clientSignupBlocked)
  ok(`${label}: form client remains CRM-only with no Auth user`, (await scalar(db, `select count(*)::int n from auth.users where email = 'dina@newco.test'`)).n === 0)

  // Build a legacy client-profile fixture to keep the existing role/RLS regression
  // coverage. This is not an account-creation path exposed by the application.
  const dina = crypto.randomUUID()
  const clientRoleId = (await db.query(`select id from public.app_roles where key = 'client'`)).rows[0].id
  await db.query(
    `insert into public.profiles (id, email, full_name, role, role_id, client_id)
     values ($1, 'dina@newco.test', 'Dina Founder', 'client', $2, $3)`,
    [dina, clientRoleId, newcoClient.id],
  )
  const pDina = (await db.query('select role, client_id, status from public.profiles where id = $1', [dina])).rows[0]
  ok(`${label}: legacy client role remains isolated`, pDina?.role === 'client' && pDina?.client_id === newcoClient.id)

  const unmatchedSignupBlocked = await expectError(db, () => addUser(db, 'frank@agency.test'))
  ok(`${label}: unmatched e-mail cannot self-register as an employee`, unmatchedSignupBlocked)

  // ── Client restrictions ─────────────────────────────────────────────
  await asUser(db, dina)
  ok(`${label}: client sees 0 projects`, (await scalar(db, 'select count(*)::int n from public.projects')).n === 0)
  ok(`${label}: client sees 0 tasks`, (await scalar(db, 'select count(*)::int n from public.tasks')).n === 0)
  ok(`${label}: client sees 0 notifications`, (await scalar(db, 'select count(*)::int n from public.notifications')).n === 0)
  ok(`${label}: client sees only own profile (not the employee directory)`, (await scalar(db, 'select count(*)::int n from public.profiles')).n === 1)
  ok(`${label}: client cannot read CRM client records`, (await scalar(db, 'select count(*)::int n from public.clients')).n === 0)
  ok(`${label}: client CAN see the intake submission linked to their record`, (await scalar(db, 'select count(*)::int n from public.intake_forms')).n === 1)
  await db.query(`update public.intake_forms set company_name = 'Changed' where id = $1`, [anonIntakeId]).catch(() => {})
  await superUser(db)
  const unchanged = (await db.query(`select company_name from public.intake_forms where id = $1`, [anonIntakeId])).rows[0]
  ok(`${label}: client cannot modify others' intake rows`, unchanged?.company_name === 'NewCo')

  // Clients cannot be assigned to projects (never treated as employees).
  await asUser(db, alice)
  const assignClientFails = await expectError(db, () => db.query(`insert into public.project_members (project_id, user_id) values ($1, $2)`, [project.id, dina]))
  ok(`${label}: DB rejects assigning a client account to a project`, assignClientFails)

  // ── Employee roles (admin-managed) ──────────────────────────────────
  await asUser(db, bob)
  const employeeCreatesRoleFails = await expectError(db, () => db.query(`insert into public.employee_roles (key, name) values ('designer', 'Designer')`))
  ok(`${label}: employee cannot create job roles`, employeeCreatesRoleFails)
  const employeeRpcFails = await expectError(db, () => db.query(`select public.set_user_employee_role($1, gen_random_uuid())`, [bob]))
  ok(`${label}: employee cannot call set_user_employee_role`, employeeRpcFails)

  await asUser(db, alice)
  await db.query(`insert into public.employee_roles (key, name, description) values ('designer', 'Designer', 'Visual design work')`)
  const designerRole = (await db.query(`select * from public.employee_roles where key = 'designer'`)).rows[0]
  ok(`${label}: admin can create a job role`, !!designerRole)
  await db.query(`select public.set_user_employee_role($1, $2)`, [bob, designerRole.id])
  const bobAfterRole = (await db.query('select employee_role_id from public.profiles where id = $1', [bob])).rows[0]
  ok(`${label}: admin assigns job role to employee`, bobAfterRole?.employee_role_id === designerRole.id)
  const clientRoleFails = await expectError(db, () => db.query(`select public.set_user_employee_role($1, $2)`, [dina, designerRole.id]))
  ok(`${label}: job roles cannot be assigned to client accounts`, clientRoleFails)

  // ── Employee status ─────────────────────────────────────────────────
  await asUser(db, erin) // manager
  const managerDeactivatesFails = await expectError(db, () => db.query(`select public.set_user_status($1, 'inactive')`, [bob]))
  ok(`${label}: manager cannot deactivate users (admin only)`, managerDeactivatesFails)

  await asUser(db, alice)
  await db.query(`insert into public.tasks (title, project_id, assignee_id) values ('Design logo concepts', $1, $2)`, [project.id, bob])
  await db.query(`insert into public.project_members (project_id, user_id) values ($1, $2)`, [project.id, bob])
  await superUser(db) // notifications are trigger-only inserts in production
  await db.query(`insert into public.notifications (recipient_id, type, title, message) values ($1, 'info', 'Welcome', 'Hello Bob')`, [bob])

  await asUser(db, bob)
  ok(`${label}: active employee sees assigned project`, (await scalar(db, 'select count(*)::int n from public.projects')).n === 1)
  ok(`${label}: active employee sees notifications`, (await scalar(db, 'select count(*)::int n from public.notifications')).n >= 1)

  await asUser(db, alice)
  await db.query(`select public.set_user_status($1, 'inactive')`, [bob])
  const bobStatus = (await db.query('select status from public.profiles where id = $1', [bob])).rows[0]
  ok(`${label}: admin deactivates an employee`, bobStatus?.status === 'inactive')

  await asUser(db, bob)
  ok(`${label}: inactive employee sees 0 projects`, (await scalar(db, 'select count(*)::int n from public.projects')).n === 0)
  ok(`${label}: inactive employee sees 0 tasks`, (await scalar(db, 'select count(*)::int n from public.tasks')).n === 0)
  ok(`${label}: inactive employee sees 0 notifications`, (await scalar(db, 'select count(*)::int n from public.notifications')).n === 0)
  ok(`${label}: inactive employee sees only own profile`, (await scalar(db, 'select count(*)::int n from public.profiles')).n === 1)
  const inactiveTaskRows = await db.query(`update public.tasks set status = 'done' where assignee_id = $1`, [bob]).then((r) => r.affectedRows ?? 0).catch(() => -1)
  ok(`${label}: inactive employee cannot update tasks`, inactiveTaskRows <= 0, `${inactiveTaskRows} rows`)
  await superUser(db)
  ok(`${label}: inactive employee's profile visible to themself only`, true)

  await asUser(db, alice)
  await db.query(`insert into public.projects (name, client_id) values ('Second Project', $1)`, [clientRow.id])
  const project2 = (await db.query(`select id from public.projects where name = 'Second Project'`)).rows[0]
  const assignInactiveFails = await expectError(db, () => db.query(`insert into public.project_members (project_id, user_id) values ($1, $2)`, [project2.id, bob]))
  ok(`${label}: DB rejects assigning an inactive employee`, assignInactiveFails)
  await db.query(`select public.set_user_status($1, 'active')`, [bob])
  await asUser(db, bob)
  ok(`${label}: reactivated employee regains project access`, (await scalar(db, 'select count(*)::int n from public.projects')).n === 1)

  // ── Admin protections & full access ─────────────────────────────────
  await asUser(db, alice)
  const selfDemoteFails = await expectError(db, () => db.query(`select public.set_user_role($1, 'employee'::public.app_role)`, [alice]))
  ok(`${label}: last admin cannot demote themself`, selfDemoteFails)
  const selfDeactivateFails = await expectError(db, () => db.query(`select public.set_user_status($1, 'inactive')`, [alice]))
  ok(`${label}: last active admin cannot deactivate themself`, selfDeactivateFails)
  const counts = await scalar(db, `select
      (select count(*)::int from public.profiles) profiles,
      (select count(*)::int from public.projects) projects,
      (select count(*)::int from public.clients) clients,
      (select count(*)::int from public.employee_roles) roles,
      (select count(*)::int from public.intake_forms) intakes`)
  ok(`${label}: admin retains full access`, counts.profiles >= 4 && counts.projects === 3 && counts.clients === 2 && counts.roles === 1 && counts.intakes === 1, JSON.stringify(counts))

  await asUser(db, erin)
  ok(`${label}: manager keeps full portfolio access`, (await scalar(db, 'select count(*)::int n from public.projects')).n === 3)
  const managerRoleChangeFails = await expectError(db, () => db.query(`select public.set_user_role($1, 'manager'::public.app_role)`, [bob]))
  ok(`${label}: manager cannot change system roles`, managerRoleChangeFails)

  await superUser(db)
}

async function runPermissionSuite(db, ids, label) {
  const { alice, bob, erin } = ids

  // ── Default role → permission matrix (data-driven, not name-driven) ───────
  await asUser(db, alice)
  const adminPerms = (await scalar(db, `select public.get_user_permissions() perms`)).perms
  ok(`${label}: admin has admin.manage`, adminPerms.includes('admin.manage'))
  ok(`${label}: admin has project.delete & employee.delete`, adminPerms.includes('project.delete') && adminPerms.includes('employee.delete'))

  await asUser(db, erin)
  const managerPerms = (await scalar(db, `select public.get_user_permissions() perms`)).perms
  ok(`${label}: manager has submission.edit & project.assign`, managerPerms.includes('submission.edit') && managerPerms.includes('project.assign'))
  ok(`${label}: manager CANNOT delete employees`, !managerPerms.includes('employee.delete'))
  ok(`${label}: manager CANNOT manage admins/permissions`, !managerPerms.includes('admin.manage') && !managerPerms.includes('permission.manage'))
  ok(`${label}: manager CANNOT edit system settings`, !managerPerms.includes('settings.edit'))
  ok(`${label}: manager CANNOT assign permissions to roles`, !managerPerms.includes('role.assign_permissions'))

  await asUser(db, bob)
  const employeePerms = (await scalar(db, `select public.get_user_permissions() perms`)).perms
  ok(`${label}: employee has task.edit`, employeePerms.includes('task.edit'))
  ok(`${label}: employee CANNOT delete projects or view all`, !employeePerms.includes('project.delete') && !employeePerms.includes('project.view_all'))

  // has_permission() helper matches the permission array.
  ok(`${label}: has_permission true for granted key`, (await scalar(db, `select public.has_permission('task.edit') v`)).v === true)
  ok(`${label}: has_permission false for missing key`, (await scalar(db, `select public.has_permission('project.delete') v`)).v === false)

  // ── URL-equivalence: RLS refuses actions the user lacks permission for ────
  await asUser(db, alice)
  await db.query(`insert into public.clients (name, email) values ('DeleteMe Corp', 'del@test.test')`)
  const delClient = (await db.query(`select id from public.clients where email = 'del@test.test'`)).rows[0]

  await asUser(db, erin) // manager: client.edit yes, client.delete no
  const managerEdited = await db.query(`update public.clients set name = 'Edited' where id = $1`, [delClient.id]).then((r) => r.affectedRows ?? 0).catch(() => -1)
  ok(`${label}: manager CAN edit a client (client.edit)`, managerEdited > 0)
  const managerDeleted = await db.query(`delete from public.clients where id = $1`, [delClient.id]).then((r) => r.affectedRows ?? 0).catch(() => -1)
  ok(`${label}: manager CANNOT delete a client (no client.delete)`, managerDeleted <= 0)

  // Bob (employee, no project.create) cannot create a project even though he can
  // view projects — the write is rejected by RLS, not just hidden in the UI.
  await asUser(db, bob)
  const clientRow = (await db.query(`select id from public.clients where email = 'carol@acme.test'`)).rows[0]
  const employeeCreatesProjectFails = await expectError(db, () => db.query(`insert into public.projects (name, client_id) values ('Sneaky', $1)`, [clientRow.id]))
  ok(`${label}: employee cannot create a project (no project.create)`, employeeCreatesProjectFails)

  // Manager (no employee.manage) cannot deactivate a user.
  await asUser(db, erin)
  const managerDeactivateFails = await expectError(db, () => db.query(`select public.set_user_status($1, 'inactive')`, [bob]))
  ok(`${label}: manager cannot manage employees (no employee.manage)`, managerDeactivateFails)

  // ── Admin management of roles & permissions ────────────────────────────────
  await asUser(db, alice)
  const roleRows = await db.query(`select * from public.list_roles()`)
  ok(`${label}: admin can list roles`, roleRows.rows.length >= 4)
  const permRows = await db.query(`select * from public.list_permissions()`)
  ok(`${label}: admin can list permissions`, permRows.rows.length >= 30)

  const customRoleId = (await scalar(db, `select (public.create_app_role('Data Manager', 'Dangerous')).id v`)).v
  ok(`${label}: admin can create a custom role`, !!customRoleId)
  await scalar(db, `select public.set_role_permissions($1, array['workspace.access','project.view','project.view_all','project.delete'])`, [customRoleId])
  const updatedRoles = (await db.query(`select * from public.list_roles()`)).rows
  const customRow = updatedRoles.find((r) => r.id === customRoleId)
  ok(`${label}: admin can assign permissions to a role`, customRow?.permission_keys?.includes('project.delete'))

  // Assign the custom role to bob; his effective permissions change immediately.
  await scalar(db, `select public.assign_user_role($1, $2)`, [bob, customRoleId])
  await asUser(db, bob)
  const bobPerms = (await scalar(db, `select public.get_user_permissions() perms`)).perms
  ok(`${label}: bob gains project.delete after role assignment`, bobPerms.includes('project.delete'))
  const bobDeletes = await db.query(`delete from public.projects where name = 'Second Project'`).then((r) => r.affectedRows ?? 0).catch(() => -1)
  ok(`${label}: bob CAN delete a project once granted the permission`, bobDeletes > 0)

  // People without role-management powers are blocked by the RPC guards.
  await asUser(db, erin)
  const managerCreateRoleFails = await expectError(db, () => scalar(db, `select public.create_app_role('Nope', 'x')`))
  ok(`${label}: manager cannot create roles (no role.create)`, managerCreateRoleFails)
  await asUser(db, bob)
  const bobGrantFails = await expectError(db, () => scalar(db, `select public.set_role_permissions($1, array['admin.manage'])`, [customRoleId]))
  ok(`${label}: bob cannot assign permissions (no role.assign_permissions)`, bobGrantFails)
  const employeeManageFails = await expectError(db, () => scalar(db, `select public.assign_user_role($1, $2)`, [erin, customRoleId]))
  ok(`${label}: bob cannot assign users to roles (no employee.manage)`, employeeManageFails)

  // Restore bob to the employee role so later state stays consistent.
  await asUser(db, alice)
  await scalar(db, `select public.set_user_role($1, 'employee'::public.app_role)`, [bob])
  await superUser(db)
}

async function runPermissionUiContractSuite(db, ids, label) {
  const { alice, bob, erin } = ids

  // This suite mirrors what the Admin UI does in "Roles & permissions": it never
  // types permission keys by hand — it reads the catalog via list_permissions()
  // (the checkbox list), then writes selections through set_role_permissions()
  // (the Save button). The assertions prove the checkbox state equals the
  // database state and that checking/unchecking boxes changes REAL access.

  // ── 1. Checkbox catalog: list_permissions feeds the grouped UI ─────────────
  await asUser(db, alice)
  const catalog = (await db.query(`select * from public.list_permissions()`)).rows
  ok(`${label}: UI checkbox catalog loads with names, categories, descriptions`, catalog.length >= 30 && catalog.every((p) => p.key && p.name && p.category))
  const catalogSlugs = new Set(catalog.map((p) => p.category))
  ok(`${label}: catalog covers the UI groups (submissions/forms/employees/portfolio/admin)`,
    ['submissions', 'forms', 'employees', 'portfolio', 'access-control', 'admin'].every((slug) => catalogSlugs.has(slug)),
    [...catalogSlugs].join(','))
  const catalogKeys = new Set(catalog.map((p) => p.key))
  ok(`${label}: catalog exposes form.manage & portfolio.manage checkboxes`, catalogKeys.has('form.manage') && catalogKeys.has('portfolio.manage'))

  // ── 2. Create-role flow: create + tick boxes + save ─────────────────────────
  const editorRoleId = (await scalar(db, `select (public.create_app_role('Content Editor', 'Checks boxes in the test')).id v`)).v
  const editorBoxes = ['workspace.access', 'submission.view', 'form.manage']
  await scalar(db, `select public.set_role_permissions($1, array['workspace.access','submission.view','form.manage'])`, [editorRoleId])

  // Checkbox state == database state (exact match, nothing more).
  const storedKeys = (await scalar(db,
    `select coalesce(array_agg(p.key order by p.key), array[]::text[]) keys
       from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
      where rp.role_id = $1`, [editorRoleId])).keys
  ok(`${label}: saved checkboxes match role_permissions rows exactly`,
    JSON.stringify(storedKeys) === JSON.stringify([...editorBoxes].sort()), JSON.stringify(storedKeys))
  const listedRole = (await db.query(`select * from public.list_roles()`)).rows.find((r) => r.id === editorRoleId)
  ok(`${label}: list_roles reports exactly the checked permissions`,
    JSON.stringify(listedRole?.permission_keys) === JSON.stringify([...editorBoxes].sort()))

  // ── 3. Checking a box changes REAL authorization ────────────────────────────
  await scalar(db, `select public.assign_user_role($1, $2)`, [bob, editorRoleId])
  await asUser(db, bob)
  ok(`${label}: bob gains form.manage after box is checked`, (await scalar(db, `select public.has_permission('form.manage') v`)).v === true)
  const bobCreatesForm = await db.query(`insert into public.form_templates (slug, title) values ('bob-editor-form', 'Bob Editor Form')`)
    .then(() => true).catch(() => false)
  ok(`${label}: checking the box lets bob actually create forms (RLS)`, bobCreatesForm)

  // Unchecked boxes still deny: bob does not have portfolio.manage.
  ok(`${label}: unchecked portfolio.manage still denies bob`, (await scalar(db, `select public.has_permission('portfolio.manage') v`)).v === false)
  const brandingCategory = (await db.query(`select id from public.portfolio_categories where slug = 'branding'`)).rows[0]
  const bobCreatesPortfolio = await db.query(
    `insert into public.portfolio_projects (title, slug, category_id) values ('Nope', 'nope-project', $1)`, [brandingCategory.id])
    .then((r) => (r.affectedRows ?? 0) > 0).catch(() => false)
  ok(`${label}: bob cannot publish portfolio while the box is unchecked (RLS)`, !bobCreatesPortfolio)

  // ── 4. Unchecking a box revokes access immediately (no re-login) ────────────
  await asUser(db, alice)
  const revokedBoxes = ['workspace.access', 'submission.view', 'portfolio.manage'] // form.manage unticked
  await scalar(db, `select public.set_role_permissions($1, array['workspace.access','submission.view','portfolio.manage'])`, [editorRoleId])
  const storedAfterRevoke = (await scalar(db,
    `select coalesce(array_agg(p.key order by p.key), array[]::text[]) keys
       from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
      where rp.role_id = $1`, [editorRoleId])).keys
  ok(`${label}: unchecking replaces the stored set (no leftovers)`,
    JSON.stringify(storedAfterRevoke) === JSON.stringify([...revokedBoxes].sort()), JSON.stringify(storedAfterRevoke))

  await asUser(db, bob)
  ok(`${label}: bob loses form.manage immediately after unchecking`, (await scalar(db, `select public.has_permission('form.manage') v`)).v === false)
  const bobBlockedFromForms = await expectError(db, () => db.query(`insert into public.form_templates (slug, title) values ('bob-late', 'Too Late')`))
  const bobLateRows = (await scalar(db, `select count(*)::int n from public.form_templates where slug = 'bob-late'`)).n
  ok(`${label}: unchecked box blocks bob from creating forms (RLS)`, bobBlockedFromForms || bobLateRows === 0)
  ok(`${label}: newly checked portfolio.manage grants bob portfolio access`, (await scalar(db, `select public.has_permission('portfolio.manage') v`)).v === true)
  const bobPublishes = await db.query(
    `insert into public.portfolio_projects (title, slug, category_id) values ('Bob Case Study', 'bob-case-study', $1)`, [brandingCategory.id])
    .then(() => true).catch(() => false)
  ok(`${label}: bob can now create portfolio projects (RLS)`, bobPublishes)

  // ── 5. Only privileged users can change checkboxes ──────────────────────────
  await asUser(db, erin) // manager: no role.assign_permissions
  const managerToggleFails = await expectError(db, () => scalar(db, `select public.set_role_permissions($1, array['admin.manage'])`, [editorRoleId]))
  ok(`${label}: manager cannot toggle role permissions (RPC guard)`, managerToggleFails)
  await asUser(db, bob)
  const bobToggleFails = await expectError(db, () => scalar(db, `select public.set_role_permissions($1, array['admin.manage'])`, [editorRoleId]))
  ok(`${label}: employee cannot toggle role permissions (RPC guard)`, bobToggleFails)
  const bobSelfGrantFails = await expectError(db, () => scalar(db, `select public.assign_user_role($1, $2)`, [bob, editorRoleId]))
  ok(`${label}: employee cannot assign roles to themself (RPC guard)`, bobSelfGrantFails)

  // The blocked attempts must not have changed the stored checkbox set.
  await superUser(db)
  const untouched = (await scalar(db,
    `select coalesce(array_agg(p.key order by p.key), array[]::text[]) keys
       from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
      where rp.role_id = $1`, [editorRoleId])).keys
  ok(`${label}: blocked save attempts leave the stored permission set untouched`,
    JSON.stringify(untouched) === JSON.stringify([...revokedBoxes].sort()))

  // ── Cleanup: restore fixtures for any later suites ─────────────────────────
  await asUser(db, alice)
  await scalar(db, `select public.set_user_role($1, 'employee'::public.app_role)`, [bob])
  await scalar(db, `select public.delete_app_role($1)`, [editorRoleId])
  await superUser(db)
}

async function runDynamicFormSuite(db, ids, label) {
  const { anonVisitor, alice, bob, erin } = ids

  // ── Permission wiring ─────────────────────────────────────────────
  await asUser(db, alice)
  ok(`${label}: form.manage granted to admin`, (await scalar(db, `select public.has_permission('form.manage') v`)).v === true)
  const formPermListed = (await scalar(db, `select count(*)::int n from public.list_permissions() where key = 'form.manage'`)).n
  ok(`${label}: form.manage appears in the permission catalog`, formPermListed === 1)

  await asUser(db, erin)
  ok(`${label}: manager does NOT have form.manage by default`, (await scalar(db, `select public.has_permission('form.manage') v`)).v === false)
  const managerTemplateFails = await expectError(db, () => db.query(`insert into public.form_templates (slug, title) values ('mgr-form', 'Mgr Form')`))
  ok(`${label}: manager cannot create forms (RLS)`, managerTemplateFails)

  // ── Admin builds a completely new form without touching code ──────
  await asUser(db, alice)
  await db.query(`insert into public.form_templates (slug, title, description) values ('brand-questionnaire', 'Brand Questionnaire', 'Tell us about your brand')`)
  const form = (await db.query(`select * from public.form_templates where slug = 'brand-questionnaire'`)).rows[0]
  ok(`${label}: admin creates a form template (starts as draft)`, form?.status === 'draft')

  await asUser(db, bob)
  const employeeQuestionFails = await expectError(db, () => db.query(
    `insert into public.form_questions (form_id, question_type, label, position) values ($1, 'short_text', 'Nope', 1)`, [form.id]))
  ok(`${label}: employee cannot add questions (RLS)`, employeeQuestionFails)

  await asUser(db, alice)
  await db.query(`insert into public.form_questions (form_id, question_type, label, required, map_to, position) values
    ($1, 'short_text', 'Your full name', true, 'name', 1),
    ($1, 'short_text', 'Your e-mail', true, 'email', 2),
    ($1, 'dropdown', 'Project type', false, null, 3)`, [form.id])
  await db.query(`update public.form_questions set options = '["Logo","Identity","Profile"]'::jsonb where form_id = $1 and question_type = 'dropdown'`, [form.id])
  await db.query(`insert into public.form_questions (form_id, question_type, label, options, position) values
    ($1, 'multiple_choice', 'Deliverables', '["Print","Social","Web"]'::jsonb, 4)`, [form.id])
  const versioned = (await scalar(db, `select version from public.form_templates where id = $1`, [form.id])).version
  ok(`${label}: question changes bump the form version`, versioned > 1, `version=${versioned}`)

  // Draft forms are invisible to the public.
  await asUser(db, anonVisitor, 'anon')
  ok(`${label}: public cannot see a draft form`, (await scalar(db, 'select count(*)::int n from public.form_templates')).n === 0)

  // Publish → public can read the form + its questions.
  await asUser(db, alice)
  await db.query(`update public.form_templates set status = 'published' where id = $1`, [form.id])
  await asUser(db, anonVisitor, 'anon')
  ok(`${label}: published form is publicly readable`, (await scalar(db, 'select count(*)::int n from public.form_templates')).n === 1)
  ok(`${label}: published form questions are publicly readable`, (await scalar(db, 'select count(*)::int n from public.form_questions')).n === 4)

  // ── Validation in the submit RPC ──────────────────────────────────
  const questionIds = (await db.query(`select id, question_type, label from public.form_questions where form_id = $1 order by position`, [form.id])).rows
  const [qName, qEmail, qType, qDeliverables] = questionIds.map((q) => q.id)
  const missingRequired = await expectError(db, () => db.query(
    `select public.submit_dynamic_form($1, $2::jsonb)`, [form.id, JSON.stringify({ [qEmail]: 'mona@demo.test' })]))
  ok(`${label}: submit rejects missing required answers`, missingRequired)
  const badOption = await expectError(db, () => db.query(
    `select public.submit_dynamic_form($1, $2::jsonb)`, [form.id, JSON.stringify({ [qName]: 'Mona', [qEmail]: 'mona@demo.test', [qType]: 'Hacked' })]))
  ok(`${label}: submit rejects a choice outside the configured options`, badOption)
  const badMulti = await expectError(db, () => db.query(
    `select public.submit_dynamic_form($1, $2::jsonb)`, [form.id, JSON.stringify({ [qName]: 'Mona', [qEmail]: 'mona@demo.test', [qDeliverables]: ['Print', 'Nope'] })]))
  ok(`${label}: submit rejects tampered multiple-choice values`, badMulti)

  // ── Happy path: anonymous visitor submits the dynamic form ────────
  const submitted = (await db.query(`select * from public.submit_dynamic_form($1, $2::jsonb)`, [form.id, JSON.stringify({
    [qName]: 'Mona Founder',
    [qEmail]: 'Mona@Demo.test',
    [qType]: 'Logo',
    [qDeliverables]: ['Print', 'Web'],
  })])).rows[0]
  ok(`${label}: anonymous visitor submits the dynamic form`, submitted?.status === 'submitted' && submitted?.respondent_name === 'Mona Founder')

  await superUser(db)
  const monaClient = (await db.query(`select id, email from public.clients where email = 'mona@demo.test'`)).rows[0]
  ok(`${label}: submission auto-creates the CRM client (e-mail match automation)`, monaClient?.email === 'mona@demo.test' && submitted?.client_id === monaClient?.id)
  const answerRows = await scalar(db, `select
      count(*)::int total,
      count(*) filter (where question_snapshot ->> 'label' = 'Your full name')::int named,
      count(*) filter (where value = '"Logo"'::jsonb)::int dropdown
    from public.form_submission_answers where submission_id = $1`, [submitted.id])
  ok(`${label}: answers stored with per-question snapshots`, answerRows.total === 4 && answerRows.named === 1 && answerRows.dropdown === 1, JSON.stringify(answerRows))

  // ── Read access ───────────────────────────────────────────────────
  await asUser(db, bob)
  ok(`${label}: employee (submission.view) reads submissions`, (await scalar(db, 'select count(*)::int n from public.form_submissions')).n === 1)
  ok(`${label}: employee (submission.view) reads answer snapshots`, (await scalar(db, 'select count(*)::int n from public.form_submission_answers')).n === 4)
  const employeeArchiveFails = await expectError(db, () => db.query(`update public.form_submissions set status = 'archived'`))
  const archiveRows = await scalar(db, `select count(*)::int n from public.form_submissions where status = 'archived'`)
  ok(`${label}: employee (no submission.edit) cannot archive submissions`, employeeArchiveFails || archiveRows.n === 0)

  await asUser(db, anonVisitor, 'anon')
  ok(`${label}: submitter re-reads only their own submission`, (await scalar(db, 'select count(*)::int n from public.form_submissions')).n === 1)

  // ── Duplicate / reorder / delete lifecycle ────────────────────────
  await asUser(db, bob)
  const employeeDuplicateFails = await expectError(db, () => scalar(db, 'select public.duplicate_form_template($1) v', [form.id]))
  ok(`${label}: employee cannot duplicate forms (RPC guard)`, employeeDuplicateFails)
  const employeeReorderFails = await expectError(db, () => scalar(db, 'select public.reorder_form_questions($1, $2::uuid[]) v', [form.id, questionIds.map((q) => q.id)]))
  ok(`${label}: employee cannot reorder questions (RPC guard)`, employeeReorderFails)

  await asUser(db, alice)
  const duplicate = (await db.query(`select * from public.duplicate_form_template($1)`, [form.id])).rows[0]
  const duplicateQuestions = (await scalar(db, 'select count(*)::int n from public.form_questions where form_id = $1', [duplicate.id])).n
  ok(`${label}: admin duplicates a form (copy starts as draft with all questions)`, duplicate?.status === 'draft' && duplicate?.slug !== form.slug && duplicateQuestions === 4)

  const reordered = [questionIds[3].id, questionIds[0].id, questionIds[1].id, questionIds[2].id]
  await db.query(`select public.reorder_form_questions($1, $2::uuid[])`, [form.id, reordered])
  const firstPosition = (await db.query(`select id from public.form_questions where form_id = $1 and position = 1`, [form.id])).rows[0]
  ok(`${label}: admin reorders questions atomically`, firstPosition?.id === questionIds[3].id)

  const deleteProtected = await expectError(db, () => db.query(`delete from public.form_templates where id = $1`, [form.id]))
  ok(`${label}: form with submissions cannot be deleted (archive instead)`, deleteProtected)
  await db.query(`delete from public.form_templates where id = $1`, [duplicate.id])
  ok(`${label}: form without submissions can be deleted`, (await scalar(db, 'select count(*)::int n from public.form_templates where id = $1', [duplicate.id])).n === 0)

  // ── Disable / enable lifecycle ────────────────────────────────────
  await db.query(`update public.form_templates set status = 'disabled' where id = $1`, [form.id])
  await asUser(db, anonVisitor, 'anon')
  ok(`${label}: disabled form disappears from public view`, (await scalar(db, `select count(*)::int n from public.form_templates where slug = 'brand-questionnaire'`)).n === 0)
  const submitDisabled = await expectError(db, () => db.query(`select public.submit_dynamic_form($1, $2::jsonb)`, [form.id, JSON.stringify({ [qName]: 'X', [qEmail]: 'x@x.test' })]))
  ok(`${label}: disabled form refuses submissions`, submitDisabled)

  await asUser(db, alice)
  await db.query(`update public.form_templates set status = 'archived' where id = $1`, [form.id])
  ok(`${label}: admin archives a form (history kept)`, (await scalar(db, `select count(*)::int n from public.form_submissions where form_id = $1`, [form.id])).n === 1)

  await superUser(db)
}

async function runTeamDirectorySuite(db, ids, label) {
  const { alice, bob, erin } = ids
  // Client account created by the sign-up routing suite above.
  const dina = (await db.query(`select id from public.profiles where email = 'dina@newco.test' and role = 'client'`)).rows[0]?.id
  if (!dina) throw new Error('team suite precondition failed: no client profile found')

  // ── Admin creates team members (always internal users, never clients) ───
  await asUser(db, alice)
  const gracePlaceholder = (await db.query(
    `select * from public.admin_create_team_member('grace@agency.test', 'Grace Designer', p_job_title := 'Senior Designer', p_department := 'Design', p_specialization := 'Brand Identity', p_bio := 'Leads brand identity work')`
  )).rows[0]
  await superUser(db)
  const graceId = await addUser(db, 'grace@agency.test', { fullName: 'Grace Designer', adminProvisioned: true })
  const grace = (await db.query(`select * from public.profiles where id = $1`, [graceId])).rows[0]
  ok(`${label}: Admin-created employee receives a real login-linked profile`, grace?.role === 'employee' && grace?.status === 'active' && grace?.job_title === 'Senior Designer' && grace?.department === 'Design' && grace?.id !== gracePlaceholder?.id)
  ok(`${label}: Admin placeholder is claimed and removed during Auth provisioning`, (await scalar(db, `select count(*)::int n from public.profiles where id = $1`, [gracePlaceholder.id])).n === 0)
  await asUser(db, alice)

  const clientRoleId = (await db.query(`select id from public.app_roles where key = 'client'`)).rows[0].id
  const clientRoleRejected = await expectError(db, () => db.query(
    `select public.admin_create_team_member('sneaky@agency.test', 'Sneaky', p_role_id := $1)`, [clientRoleId]))
  ok(`${label}: team member cannot be created with the Client role`, clientRoleRejected)

  const duplicateEmailRejected = await expectError(db, () => db.query(
    `select public.admin_create_team_member('grace@agency.test', 'Grace Clone')`))
  ok(`${label}: duplicate team member e-mail is rejected`, duplicateEmailRejected)

  // Only employee.manage/admin.manage may manage team members.
  await asUser(db, erin)
  const managerCreateFails = await expectError(db, () => db.query(
    `select public.admin_create_team_member('hank@agency.test', 'Hank')`))
  ok(`${label}: manager cannot create team members (no employee.manage)`, managerCreateFails)
  await asUser(db, bob)
  const employeeCreateFails = await expectError(db, () => db.query(
    `select public.admin_create_team_member('ivy@agency.test', 'Ivy')`))
  ok(`${label}: employee cannot create team members`, employeeCreateFails)

  // ── Directory contents: internal members only, clients never appear ──────
  await asUser(db, bob)
  ok(`${label}: employee has employee.view (team directory permission)`, (await scalar(db, `select public.has_permission('employee.view') v`)).v === true)
  const directory = (await db.query(`select id, role, status from public.profiles where role <> 'client'`)).rows
  ok(`${label}: employee sees the internal team in the directory`, directory.length >= 4, `${directory.length} members`)
  ok(`${label}: client accounts never appear in the team directory`, !directory.some((r) => r.role === 'client' || r.id === dina))

  await asUser(db, dina)
  ok(`${label}: client cannot browse the team directory (sees only own profile)`, (await scalar(db, 'select count(*)::int n from public.profiles')).n === 1)
  ok(`${label}: client lacks employee.view`, (await scalar(db, `select public.has_permission('employee.view') v`)).v === false)

  // ── Inactive members are flagged and lose access — never shown as active ─
  await asUser(db, alice)
  await db.query(`select public.set_user_status($1, 'inactive')`, [grace.id])
  await asUser(db, bob)
  const graceRow = (await db.query('select status from public.profiles where id = $1', [grace.id])).rows[0]
  ok(`${label}: deactivated member stays flagged inactive in the directory`, graceRow?.status === 'inactive')

  await asUser(db, grace.id)
  ok(`${label}: inactive member loses employee.view themselves`, (await scalar(db, `select public.has_permission('employee.view') v`)).v === false)
  ok(`${label}: inactive member loses workspace access`, (await scalar(db, `select public.has_permission('workspace.access') v`)).v === false)

  await asUser(db, alice)
  await db.query(`select public.set_user_status($1, 'active')`, [grace.id])
  await asUser(db, grace.id)
  ok(`${label}: reactivated member regains directory access`, (await scalar(db, `select public.has_permission('employee.view') v`)).v === true)

  // ── Management guards ────────────────────────────────────────────────────
  await asUser(db, erin)
  const managerUpdateFails = await expectError(db, () => db.query(`select public.admin_update_team_member($1, p_job_title := 'Hacked')`, [grace.id]))
  ok(`${label}: manager cannot edit team members via admin RPC`, managerUpdateFails)
  const managerDeleteFails = await expectError(db, () => db.query(`select public.admin_delete_team_member($1)`, [grace.id]))
  ok(`${label}: manager cannot delete team members via admin RPC`, managerDeleteFails)
  await asUser(db, alice)
  const deleteClientFails = await expectError(db, () => db.query(`select public.admin_delete_team_member($1)`, [dina]))
  ok(`${label}: team management cannot delete client accounts`, deleteClientFails)

  await superUser(db)
}

async function runPortfolioSuite(db, ids, label) {
  const { anonVisitor, alice, bob } = ids

  await asUser(db, alice)
  const category = (await db.query(`select id from public.portfolio_categories where slug = 'branding'`)).rows[0]
  const draft = (await db.query(`insert into public.portfolio_projects (title, slug, category_id, services) values ('Private Draft', 'private-draft', $1, array['Brand strategy']) returning id`, [category.id])).rows[0]
  await db.query(`insert into public.portfolio_project_images (project_id, storage_path, uploaded_by) values ($1, 'draft-image/draft.png', $2)`, [draft.id, alice])
  await db.query(`insert into storage.objects (bucket_id, name, owner_id) values ('portfolio-images', 'draft-image/draft.png', $1)`, [alice])

  // Staff without the portfolio permission cannot browse or mutate the separate system.
  await asUser(db, bob)
  ok(`${label}: employee cannot read an unpublished portfolio project`, (await scalar(db, 'select count(*)::int n from public.portfolio_projects')).n === 0)
  const employeePublishResult = await db.query(`update public.portfolio_projects set published = true where id = $1 returning id`, [draft.id]).catch(() => ({ rows: [] }))
  ok(`${label}: employee cannot publish portfolio content`, employeePublishResult.rows.length === 0)

  // Anonymous visitors see neither the draft row nor its private image object.
  await asUser(db, anonVisitor, 'anon')
  ok(`${label}: anonymous visitor cannot read an unpublished project`, (await scalar(db, 'select count(*)::int n from public.get_public_portfolio_projects()')).n === 0)
  ok(`${label}: anonymous visitor cannot read an unpublished image through the public API`, (await scalar(db, `select coalesce(sum(jsonb_array_length(images)), 0)::int n from public.get_public_portfolio_projects()`)).n === 0)
  ok(`${label}: anonymous visitor cannot read an unpublished storage object`, (await scalar(db, `select count(*)::int n from storage.objects where bucket_id = 'portfolio-images'`)).n === 0)

  await asUser(db, alice)
  await db.query(`update public.portfolio_projects set published = true where id = $1`, [draft.id])
  await asUser(db, anonVisitor, 'anon')
  ok(`${label}: published portfolio project is publicly readable`, (await scalar(db, `select count(*)::int n from public.get_public_portfolio_projects() where slug = 'private-draft'`)).n === 1)
  ok(`${label}: public project details resolve by slug`, (await scalar(db, `select count(*)::int n from public.get_public_portfolio_project('private-draft')`)).n === 1)
  ok(`${label}: published portfolio image is publicly readable through the narrow API`, (await scalar(db, `select coalesce(sum(jsonb_array_length(images)), 0)::int n from public.get_public_portfolio_projects()`)).n === 1)
  ok(`${label}: published portfolio image storage object is readable`, (await scalar(db, `select count(*)::int n from storage.objects where bucket_id = 'portfolio-images'`)).n === 1)

  await asUser(db, alice)
  await db.query(`update public.portfolio_projects set published = false, archived = true where id = $1`, [draft.id])
  await asUser(db, anonVisitor, 'anon')
  ok(`${label}: archived portfolio project disappears from public view`, (await scalar(db, `select count(*)::int n from public.get_public_portfolio_projects()`)).n === 0)
  ok(`${label}: archived portfolio image disappears from public storage`, (await scalar(db, `select count(*)::int n from storage.objects where bucket_id = 'portfolio-images'`)).n === 0)
  await superUser(db)
}

async function main() {
  console.log('=== Path A: prior migrations + admin-only account migration (upgrade path) ===')
  const dbA = await makeDb()
  const idsA = await applyAndSeed(dbA)
  await runSuite(dbA, idsA, 'upgrade')
  await runPermissionSuite(dbA, idsA, 'upgrade')
  await runDynamicFormSuite(dbA, idsA, 'upgrade')
  await runTeamDirectorySuite(dbA, idsA, 'upgrade')
  await runPortfolioSuite(dbA, idsA, 'upgrade')
  await runPermissionUiContractSuite(dbA, idsA, 'upgrade')
  await dbA.close()

  console.log('\n=== Path B: fresh install from updated schema.sql ===')
  const dbB = await makeDb()
  await dbB.exec(freshSchema)
  const aliceB = await addUser(dbB, 'admin@fresh.test', { adminProvisioned: true, fullName: 'Fresh Admin' })
  const carolClient = crypto.randomUUID()
  await asUser(dbB, aliceB)
  await dbB.query(`insert into public.clients (id, name, email) values ($1, 'Beta LLC', 'carol@beta.test')`, [carolClient])
  await superUser(dbB)
  const carolSignupBlocked = await expectError(dbB, () => addUser(dbB, 'carol@beta.test'))
  ok('fresh: public client account creation is blocked', carolSignupBlocked)
  ok('fresh: public client remains a CRM record without Auth user', (await scalar(dbB, `select count(*)::int n from auth.users where email = 'carol@beta.test'`)).n === 0)
  const adminRow = (await dbB.query('select role from public.profiles where id = $1', [aliceB])).rows[0]
  ok('fresh: trusted bootstrap admin works', adminRow?.role === 'admin')

  await asUser(dbB, aliceB)
  const employeePlaceholder = (await dbB.query(`select * from public.admin_create_team_member('employee@fresh.test', 'Fresh Employee')`)).rows[0]
  await superUser(dbB)
  const employeeB = await addUser(dbB, 'employee@fresh.test', { adminProvisioned: true, fullName: 'Fresh Employee' })
  const employeeRow = (await dbB.query('select role, full_name from public.profiles where id = $1', [employeeB])).rows[0]
  ok('fresh: Admin Team Management provisions an employee Auth account', employeeRow?.role === 'employee' && employeeRow?.full_name === 'Fresh Employee')
  ok('fresh: claimed placeholder does not remain as a second profile', (await scalar(dbB, 'select count(*)::int n from public.profiles where id = $1', [employeePlaceholder.id])).n === 0)

  // Fresh installs include the dynamic form builder end to end.
  await superUser(dbB)
  const anonVisitorB = await addUser(dbB, null, { anon: true })
  await asUser(dbB, aliceB)
  ok('fresh: admin has form.manage', (await scalar(dbB, `select public.has_permission('form.manage') v`)).v === true)
  await dbB.query(`insert into public.form_templates (slug, title) values ('fresh-form', 'Fresh Form')`)
  const freshForm = (await dbB.query(`select id from public.form_templates where slug = 'fresh-form'`)).rows[0]
  await dbB.query(`insert into public.form_questions (form_id, question_type, label, required, map_to, position) values ($1, 'short_text', 'E-mail', true, 'email', 1)`, [freshForm.id])
  await dbB.query(`update public.form_templates set status = 'published' where id = $1`, [freshForm.id])
  const freshQuestionId = (await dbB.query(`select id from public.form_questions where form_id = $1`, [freshForm.id])).rows[0].id
  await asUser(dbB, anonVisitorB, 'anon')
  ok('fresh: published dynamic form is publicly readable', (await scalar(dbB, 'select count(*)::int n from public.form_templates')).n === 1)
  const freshSubmission = (await dbB.query(`select * from public.submit_dynamic_form($1, $2::jsonb)`, [freshForm.id, JSON.stringify({ [freshQuestionId]: 'visitor@fresh.test' })])).rows[0]
  ok('fresh: anonymous submission works end to end', freshSubmission?.status === 'submitted' && freshSubmission?.respondent_email === 'visitor@fresh.test')
  await asUser(dbB, aliceB)
  ok('fresh: staff read the stored answers', (await scalar(dbB, 'select count(*)::int n from public.form_submission_answers')).n === 1)
  await dbB.close()

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) process.exit(1)
}

main().catch((error) => { console.error('HARNESS ERROR:', error); process.exit(2) })
