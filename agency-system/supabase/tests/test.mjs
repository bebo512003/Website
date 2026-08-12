import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const supabaseDir = join(here, '..')

const sanitize = (sql) => sql.replace(/^create extension if not exists pgcrypto;$/m, '-- pgcrypto stripped for PGlite test (gen_random_uuid is core in PG16)')

// Upgrade path: every migration before the latest reproduces the previous
// production state; then the latest migration is applied on top. Keeping this
// automatic prevents a newly added migration from silently escaping the suite.
const migrationFiles = readdirSync(join(supabaseDir, 'migrations')).filter((file) => file.endsWith('.sql')).sort()
const migrationFile = migrationFiles.at(-1)
if (!migrationFile) throw new Error('No migrations found')
const priorMigrations = migrationFiles.slice(0, -1).map((file) => sanitize(readFileSync(join(supabaseDir, 'migrations', file), 'utf8')))
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
-- GoTrue enforces one account per e-mail; mirror that invariant in the stub.
create unique index auth_users_email_unique on auth.users (lower(email)) where email is not null;
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
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(STUBS)
  await db.exec('create extension if not exists pgcrypto;')
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
  const pBob = await scalar(db, 'select role, must_change_password from public.profiles where id = $1', [bob])
  ok(`${label}: Admin-provisioned team account becomes employee`, pBob?.role === 'employee', pBob?.role)
  ok(`${label}: Admin-provisioned account must replace its temporary password`, pBob?.must_change_password === true)
  const pErin = await scalar(db, 'select role, must_change_password from public.profiles where id = $1', [erin])
  ok(`${label}: Admin can provision a Manager without changing RBAC architecture`, pErin?.role === 'manager', pErin?.role)
  ok(`${label}: bootstrap Admin is not incorrectly forced through the team-account password flow`, pAlice?.role === 'admin' && (await scalar(db, 'select must_change_password v from public.profiles where id = $1', [alice])).v === false)

  // The temporary-password state is a real authorization gate, not a UI hint:
  // until the first-login change happens the account exercises no permissions.
  await asUser(db, erin)
  const erinPendingPerms = (await scalar(db, `select public.get_user_permissions() perms`)).perms
  ok(`${label}: provisioned manager exercises no permissions before the first password change`,
    erinPendingPerms.length === 0 && (await scalar(db, `select public.has_permission('project.view_all') v`)).v === false)
  await db.query(`select public.mark_password_changed($1)`, [erin])
  ok(`${label}: first-login password change unlocks the manager's role permissions`,
    (await scalar(db, `select public.has_permission('project.view_all') v`)).v === true)
  await superUser(db)
  let existingAccountAuthUpdateWorks = true
  try {
    await db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"auth_refresh_test":true}'::jsonb where id = $1`, [bob])
  } catch {
    existingAccountAuthUpdateWorks = false
  }
  ok(`${label}: existing accounts remain usable by normal Auth update flows`, existingAccountAuthUpdateWorks)

  // The profile page's enhanced RPC exists, updates only the caller, and cannot
  // be used to clear another account's temporary-password flag.
  await asUser(db, bob)
  const updatedOwnProfile = (await db.query(
    `select * from public.update_own_enhanced_profile(
      $1, 'Bob Profile', '+1 555 0100', '+1 555 0101', 'Profile bio', 'Designer',
      'Branding, UI', 'Five years', 'Project Alpha', 'Certified', 'Remote',
      'https://portfolio.test', 'https://linkedin.test/bob', null, null, null,
      null, 'https://bob.test', '{"github":"https://github.test/bob"}'::jsonb, null
    )`, [bob],
  )).rows[0]
  ok(`${label}: enhanced profile RPC persists the existing profile form fields`,
    updatedOwnProfile?.full_name === 'Bob Profile'
      && updatedOwnProfile?.skills === 'Branding, UI'
      && updatedOwnProfile?.other_social_links?.github === 'https://github.test/bob')
  const updateOtherProfileBlocked = await expectError(db, () => db.query(
    `select * from public.update_own_enhanced_profile(
      $1, 'Hacked', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, '{}'::jsonb, null
    )`, [alice],
  ))
  ok(`${label}: enhanced profile RPC rejects updates to another profile`, updateOtherProfileBlocked)
  const clearOtherPasswordFlagBlocked = await expectError(db, () => db.query(`select public.mark_password_changed($1)`, [erin]))
  ok(`${label}: password flag RPC rejects a caller-supplied different user id`, clearOtherPasswordFlagBlocked)
  ok(`${label}: pending temporary password returns an empty permission set for the employee`,
    (await scalar(db, `select public.get_user_permissions() perms`)).perms.length === 0)
  await db.query(`select public.mark_password_changed($1)`, [bob])
  ok(`${label}: user can clear their own temporary-password flag`, (await scalar(db, 'select must_change_password v from public.profiles where id = $1', [bob])).v === false)
  ok(`${label}: clearing the flag restores the employee's permissions`,
    (await scalar(db, `select public.get_user_permissions() perms`)).perms.length > 0)

  // ── Profile self-service (Session 03) ──────────────────────────────────
  // Every role edits only its own allowed fields; admin-controlled fields
  // (role, email, status, role_id) are protected by the RPC whitelist.
  const bobRoleIdBefore = (await scalar(db, 'select role_id from public.profiles where id = $1', [bob])).role_id

  await asUser(db, bob) // employee
  await db.query(
    `select public.update_own_enhanced_profile(
      $1, 'Bob Self Edited', '+20 100 000 000', '+20 111 111 111', 'Bio edited by Bob',
      'Senior Designer', 'Figma, React', 'Experience A', 'Project A', 'Cert A',
      'Cairo, Egypt', 'https://portfolio.example', 'https://linkedin.example/bob', null,
      null, null, null, null, '{"dribbble":"https://dribbble.example/bob"}'::jsonb,
      'https://cdn.example/bob-avatar.png'
    )`, [bob],
  )
  const bobAfterEdit = await scalar(db,
    `select full_name, phone, whatsapp, bio, job_title, skills, location, linkedin, other_social_links, avatar_url,
            role, status, email, role_id
     from public.profiles where id = $1`, [bob],
  )
  ok(`${label}: employee self-edit persists allowed profile fields`,
    bobAfterEdit.full_name === 'Bob Self Edited'
      && bobAfterEdit.phone === '+20 100 000 000'
      && bobAfterEdit.bio === 'Bio edited by Bob'
      && bobAfterEdit.skills === 'Figma, React'
      && bobAfterEdit.other_social_links?.dribbble === 'https://dribbble.example/bob'
      && bobAfterEdit.avatar_url === 'https://cdn.example/bob-avatar.png')
  ok(`${label}: employee self-edit cannot change role, status, email or role_id`,
    bobAfterEdit.role === 'employee'
      && bobAfterEdit.status === 'active'
      && bobAfterEdit.email === 'bob@agency.test'
      && bobAfterEdit.role_id === bobRoleIdBefore)

  await asUser(db, erin) // manager
  await db.query(
    `select public.update_own_enhanced_profile(
      $1, 'Erin Self Edited', '+971 50 000 0000', null, 'Manager bio', 'Account Director',
      'Strategy, Client Success', null, null, null, 'Dubai, UAE', null,
      'https://linkedin.example/erin', null, 'https://instagram.example/erin', null, null, null,
      '{}'::jsonb, null
    )`, [erin],
  )
  const erinAfterEdit = await scalar(db,
    `select full_name, phone, bio, job_title, skills, linkedin, instagram, role, status, email
     from public.profiles where id = $1`, [erin],
  )
  ok(`${label}: manager self-edit persists allowed profile fields`,
    erinAfterEdit.full_name === 'Erin Self Edited'
      && erinAfterEdit.bio === 'Manager bio'
      && erinAfterEdit.job_title === 'Account Director'
      && erinAfterEdit.linkedin === 'https://linkedin.example/erin')
  ok(`${label}: manager self-edit cannot change role, status or email`,
    erinAfterEdit.role === 'manager' && erinAfterEdit.status === 'active' && erinAfterEdit.email === 'erin@agency.test')

  await asUser(db, alice) // admin
  await db.query(
    `select public.update_own_enhanced_profile(
      $1, 'Alice Admin', null, null, 'Admin bio', null, null, null, null, null,
      'Cairo', null, null, null, null, null, null, 'https://alice.example', '{}'::jsonb, null
    )`, [alice],
  )
  const aliceAfterEdit = await scalar(db,
    `select full_name, bio, location, personal_website, role, status, email
     from public.profiles where id = $1`, [alice],
  )
  ok(`${label}: admin self-edit persists allowed profile fields`,
    aliceAfterEdit.full_name === 'Alice Admin'
      && aliceAfterEdit.bio === 'Admin bio'
      && aliceAfterEdit.personal_website === 'https://alice.example')
  ok(`${label}: admin self-edit keeps the admin role active`,
    aliceAfterEdit.role === 'admin' && aliceAfterEdit.status === 'active' && aliceAfterEdit.email === 'alice@agency.test')

  // A password change must never touch profile information — only the flag.
  await asUser(db, bob)
  const profileBeforePasswordChange = await scalar(db, 'select full_name, bio, phone from public.profiles where id = $1', [bob])
  await superUser(db)
  await db.query(`update public.profiles set must_change_password = true where id = $1`, [bob])
  await asUser(db, bob)
  await db.query(`select public.mark_password_changed($1)`, [bob])
  const profileAfterPasswordChange = await scalar(db,
    'select full_name, bio, phone, must_change_password from public.profiles where id = $1', [bob],
  )
  ok(`${label}: password change clears the flag without touching profile fields`,
    profileAfterPasswordChange.must_change_password === false
      && profileAfterPasswordChange.full_name === profileBeforePasswordChange.full_name
      && profileAfterPasswordChange.bio === profileBeforePasswordChange.bio
      && profileAfterPasswordChange.phone === profileBeforePasswordChange.phone)

  // Avatar storage: users may remove avatars inside their own folder even when
  // an Administrator performed the upload (owner_id is the admin, path is the
  // member's id), and must never touch other members' folders.
  await asUser(db, alice)
  await db.query(`insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do update set public = true`)
  await db.query(`insert into storage.objects (bucket_id, name, owner_id) values ('avatars', $1, $2)`, [`${bob}/admin-uploaded.png`, alice])
  await db.query(`insert into storage.objects (bucket_id, name, owner_id) values ('avatars', $1, $2)`, [`${alice}/alice-own.png`, alice])
  await asUser(db, bob)
  const ownFolderAvatarDeleteBlocked = await expectError(db, () => db.query(
    `delete from storage.objects where bucket_id = 'avatars' and name = $1`, [`${bob}/admin-uploaded.png`],
  ))
  ok(`${label}: a member can delete an admin-uploaded avatar from their own folder`, !ownFolderAvatarDeleteBlocked)
  // RLS makes the row invisible: the statement succeeds but affects zero rows.
  const otherFolderAvatarDelete = await db.query(
    `delete from storage.objects where bucket_id = 'avatars' and name = $1`, [`${alice}/alice-own.png`],
  )
  ok(`${label}: a member cannot delete another member's avatar`, (otherFolderAvatarDelete.affectedRows ?? 0) === 0)
  const otherFolderAvatarStillThere = await scalar(db,
    `select count(*)::int n from storage.objects where bucket_id = 'avatars' and name = $1`, [`${alice}/alice-own.png`],
  )
  ok(`${label}: the other member's avatar object is untouched`, otherFolderAvatarStillThere.n === 1)

  await asUser(db, alice)
  const profileOnlyEmailChangeBlocked = await expectError(db, () => db.query(
    `select public.admin_update_team_member($1, p_email := 'drifted@agency.test')`, [bob],
  ))
  ok(`${label}: login profile email cannot drift from Supabase Auth`, profileOnlyEmailChangeBlocked)
  await superUser(db)
  await db.query(`update auth.users set email = 'bob.updated@agency.test' where id = $1`, [bob])
  const synchronizedEmail = await scalar(db,
    `select p.email profile_email, u.email auth_email
     from public.profiles p join auth.users u on u.id = p.id where p.id = $1`, [bob],
  )
  ok(`${label}: trusted Auth email update synchronizes the profile`, synchronizedEmail.profile_email === 'bob.updated@agency.test' && synchronizedEmail.auth_email === 'bob.updated@agency.test')

  const publicSignupBlocked = await expectError(db, () => addUser(db, 'visitor@public.test'))
  ok(`${label}: public visitor cannot create an account by calling Auth directly`, publicSignupBlocked)
  const anonymousConversionBlocked = await expectError(db, () => db.query(
    `update auth.users set is_anonymous = false, email = 'converted@public.test', raw_app_meta_data = '{"provider":"email"}'::jsonb where id = $1`,
    [anonVisitor],
  ))
  ok(`${label}: visitor cannot convert an anonymous form session into an account`, anonymousConversionBlocked)

  await asUser(db, alice)
  await db.query(`select public.admin_create_team_member('remove-me@agency.test', 'Remove Me')`)
  await superUser(db)
  const removableUser = await addUser(db, 'remove-me@agency.test', { fullName: 'Remove Me', adminProvisioned: true })
  await asUser(db, alice)
  await db.query(`select public.admin_delete_team_member($1)`, [removableUser])
  await superUser(db)
  const removedAccount = await scalar(db,
    `select
       (select count(*)::int from public.profiles where id = $1) profile_count,
       (select count(*)::int from auth.users where id = $1) auth_count`,
    [removableUser],
  )
  ok(`${label}: team deletion removes both profile and Auth account atomically`, removedAccount.profile_count === 0 && removedAccount.auth_count === 0)

  // Full lifecycle: a deleted member's e-mail is fully released and can be
  // provisioned again from scratch (no stale profile, placeholder or ban left).
  await asUser(db, alice)
  await db.query(`select public.admin_create_team_member('remove-me@agency.test', 'Remove Me Reborn')`)
  await superUser(db)
  const reborn = await addUser(db, 'remove-me@agency.test', { fullName: 'Remove Me Reborn', adminProvisioned: true })
  const rebornRow = await scalar(db, 'select role, status, must_change_password from public.profiles where id = $1', [reborn])
  ok(`${label}: deleted member e-mail can be provisioned again with a fresh temporary password`,
    rebornRow?.role === 'employee' && rebornRow?.status === 'active' && rebornRow?.must_change_password === true)
  ok(`${label}: re-provisioning leaves exactly one profile for the e-mail`,
    (await scalar(db, `select count(*)::int n from public.profiles where lower(email) = 'remove-me@agency.test'`)).n === 1)

  // Admin sets up a CRM client + project, erin becomes manager.
  await asUser(db, alice)
  await db.query(`insert into public.clients (name, email, contact_person) values ('Acme Corp', 'carol@acme.test', 'Carol')`)
  const clientRow = (await db.query(`select id from public.clients where email = 'carol@acme.test'`)).rows[0]
  await db.query(`insert into public.projects (name, client_id) values ('Acme Rebrand', $1)`, [clientRow.id])
  const project = (await db.query(`select id from public.projects limit 1`)).rows[0]
  await db.query(`select public.set_user_role($1, 'manager'::public.app_role)`, [erin])

  const attributionPlaceholder = (await db.query(
    `select * from public.admin_create_team_member('attribution@agency.test', 'Attribution Owner')`,
  )).rows[0]
  await superUser(db)
  await db.query(`insert into public.employee_roles (key, name, created_by) values ('preserved_role', 'Preserved role', $1)`, [attributionPlaceholder.id])
  await db.query(`insert into public.tasks (title, project_id, created_by) values ('Preserved task', $1, $2)`, [project.id, attributionPlaceholder.id])
  await asUser(db, alice)
  await db.query(`select public.admin_delete_team_member($1)`, [attributionPlaceholder.id])
  await superUser(db)
  const preservedAttribution = await scalar(db,
    `select
       (select count(*)::int from public.tasks where title = 'Preserved task' and created_by is null) task_count,
       (select count(*)::int from public.employee_roles where key = 'preserved_role' and created_by is null) role_count`,
  )
  ok(`${label}: nullable attribution FKs preserve business rows when a profile is removed`, preservedAttribution.task_count === 1 && preservedAttribution.role_count === 1)

  // Placeholder assignments made before the login exists must survive the Auth
  // claim (the claim snapshots them, frees the e-mail, inserts the claimed
  // profile, then restores the assignments around the unique e-mail index).
  await asUser(db, alice)
  const lifecyclePlaceholder = (await db.query(
    `select * from public.admin_create_team_member('lifecycle@agency.test', 'Lifecycle Tester')`)).rows[0]
  await db.query(`insert into public.project_members (project_id, user_id, assigned_by) values ($1, $2, $3)`, [project.id, lifecyclePlaceholder.id, alice])
  await superUser(db)
  const lifecycleUser = await addUser(db, 'lifecycle@agency.test', { fullName: 'Lifecycle Tester', adminProvisioned: true })
  const claimedLifecycle = await scalar(db,
    `select
       (select count(*)::int from public.project_members where user_id = $1) assignments,
       (select count(*)::int from public.profiles where lower(email) = 'lifecycle@agency.test') profiles,
       (select must_change_password from public.profiles where id = $1) flag`,
    [lifecycleUser])
  ok(`${label}: placeholder project assignments survive the Auth claim`,
    claimedLifecycle.assignments === 1 && claimedLifecycle.profiles === 1 && claimedLifecycle.flag === true)

  // Dynamic Form submission: anonymous submit creates a CLIENT row, never an employee.
  await asUser(db, alice)
  await db.query(`insert into public.form_templates (slug, title, status, settings) values ('newco-request', 'New Project Request', 'published', '{"create_project_on_submit":true}'::jsonb)`)
  const newcoForm = (await db.query(`select id from public.form_templates where slug = 'newco-request'`)).rows[0]
  await db.query(`insert into public.form_questions (form_id, question_type, label, required, map_to, position) values
    ($1, 'short_text', 'Full name', true, 'name', 1),
    ($1, 'short_text', 'Email', true, 'email', 2),
    ($1, 'short_text', 'Company', true, 'company', 3),
    ($1, 'file_upload', 'Brief', false, null, 4)`, [newcoForm.id])
  const newcoQuestions = (await db.query(`select id from public.form_questions where form_id = $1 order by position`, [newcoForm.id])).rows
  const [qNewcoName, qNewcoEmail, qNewcoCompany, qNewcoFile] = newcoQuestions.map((row) => row.id)

  await superUser(db)
  const newcoVisitor = await addUser(db, null, { anon: true })
  await asUser(db, newcoVisitor, 'anon')
  const newcoFilePath = `${newcoVisitor}/brief.pdf`
  await db.query(`insert into storage.objects (bucket_id, name, owner_id) values ('form-files', $1, $2)`, [newcoFilePath, newcoVisitor])
  await db.query(`select public.submit_dynamic_form($1, $2::jsonb)`, [newcoForm.id, JSON.stringify({
    [qNewcoName]: 'Dina Founder',
    [qNewcoEmail]: 'dina@newco.test',
    [qNewcoCompany]: 'NewCo',
    [qNewcoFile]: [{ name: 'brief.pdf', size: 1024, mime_type: 'application/pdf', storage_path: newcoFilePath }],
  })])
  await superUser(db)
  const newcoClient = (await db.query(`select id, email from public.clients where email = 'dina@newco.test'`)).rows[0]
  ok(`${label}: dynamic form submit creates CRM client record + project, no auth account`, !!newcoClient && (await scalar(db, `select count(*)::int n from public.projects where client_id = $1`, [newcoClient.id])).n === 1)

  const legacyRpcGone = await expectError(db, () => db.query(`select public.submit_intake_form(gen_random_uuid())`))
  ok(`${label}: legacy submit_intake_form RPC is retired`, legacyRpcGone)
  await asUser(db, anonVisitor, 'anon')
  const legacyInsertBlocked = await expectError(db, () => db.query(`insert into public.intake_forms (service_type, service_types, contact_name, company_name, data) values ('logo_design', array['logo_design'], 'X', 'Y', '{}'::jsonb)`))
  ok(`${label}: legacy intake_forms rejects new writes`, legacyInsertBlocked)
  await superUser(db)

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

  // ── Duplicate e-mail handling ─────────────────────────────────────
  // The provisioning RPC rejects e-mails that are already taken by another
  // profile (team member OR client) and the unique index backstops the rule.
  await asUser(db, alice)
  const duplicateTeamEmailRejected = await expectError(db, () => db.query(
    `select public.admin_create_team_member('bob.updated@agency.test', 'Bob Clone')`))
  ok(`${label}: duplicate team member e-mail is rejected by the provisioning RPC`, duplicateTeamEmailRejected)
  const duplicateClientEmailRejected = await expectError(db, () => db.query(
    `select public.admin_create_team_member('dina@newco.test', 'Dina Clone')`))
  ok(`${label}: e-mail already used by a client profile is rejected`, duplicateClientEmailRejected)
  const directDuplicateInsertRejected = await expectError(db, () => db.query(
    `insert into public.profiles (id, email, full_name, role) values (gen_random_uuid(), 'BOB.UPDATED@agency.test', 'Duplicate Insert', 'employee')`))
  ok(`${label}: unique e-mail index blocks duplicate profiles at the database (case-insensitive)`, directDuplicateInsertRejected)
  ok(`${label}: rejected duplicates leave no extra profile behind`,
    (await scalar(db, `select count(*)::int n from public.profiles where lower(email) = 'bob.updated@agency.test'`)).n === 1)

  // ── Client restrictions ─────────────────────────────────────────────
  await asUser(db, dina)
  ok(`${label}: client sees 0 projects`, (await scalar(db, 'select count(*)::int n from public.projects')).n === 0)
  ok(`${label}: client sees 0 tasks`, (await scalar(db, 'select count(*)::int n from public.tasks')).n === 0)
  ok(`${label}: client sees 0 notifications`, (await scalar(db, 'select count(*)::int n from public.notifications')).n === 0)
  ok(`${label}: client sees only own profile (not the employee directory)`, (await scalar(db, 'select count(*)::int n from public.profiles')).n === 1)
  ok(`${label}: client cannot read CRM client records`, (await scalar(db, 'select count(*)::int n from public.clients')).n === 0)
  ok(`${label}: client CAN see the form submission linked to their record`, (await scalar(db, 'select count(*)::int n from public.form_submissions')).n === 1)
  await db.query(`update public.form_submissions set company_name = 'Changed' where respondent_email = 'dina@newco.test'`).catch(() => {})
  await superUser(db)
  const unchanged = (await db.query(`select company_name from public.form_submissions where respondent_email = 'dina@newco.test'`)).rows[0]
  ok(`${label}: client cannot modify linked form submissions`, unchanged?.company_name === 'NewCo')

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
  ok(`${label}: employee without submission.view cannot read form attachments`, (await scalar(db, 'select count(*)::int n from public.form_submission_attachments')).n === 0)
  ok(`${label}: employee without submission.view cannot read form files`, (await scalar(db, `select count(*)::int n from storage.objects where bucket_id = 'form-files'`)).n === 0)
  await asUser(db, erin)
  ok(`${label}: manager with submission.view reads form attachments`, (await scalar(db, 'select count(*)::int n from public.form_submission_attachments')).n === 1)
  ok(`${label}: manager with submission.view reads form files`, (await scalar(db, `select count(*)::int n from storage.objects where bucket_id = 'form-files'`)).n === 1)
  await asUser(db, bob)

  // Forced password change with REAL data: while the temporary password is
  // still pending, the assigned employee sees nothing and can write nothing —
  // exactly what the AppShell gate enforces in the UI, proven at the DB layer.
  await superUser(db)
  await db.query(`update public.profiles set must_change_password = true where id = $1`, [bob])
  await asUser(db, bob)
  ok(`${label}: pending temporary password blocks access to assigned projects (RLS)`, (await scalar(db, 'select count(*)::int n from public.projects')).n === 0)
  const pendingTaskRows = await db.query(`update public.tasks set status = 'done' where assignee_id = $1`, [bob]).then((r) => r.affectedRows ?? 0).catch(() => -1)
  ok(`${label}: pending temporary password blocks task writes`, pendingTaskRows === 0, `${pendingTaskRows} rows`)
  ok(`${label}: pending temporary password still allows reading the own profile`, (await scalar(db, 'select count(*)::int n from public.profiles')).n === 1)
  await db.query(`select public.mark_password_changed($1)`, [bob])
  ok(`${label}: replacing the temporary password restores the assigned workspace`, (await scalar(db, 'select count(*)::int n from public.projects')).n === 1)

  await asUser(db, alice)
  await db.query(`select public.set_user_status($1, 'inactive')`, [bob])
  const bobStatus = (await db.query('select status from public.profiles where id = $1', [bob])).rows[0]
  ok(`${label}: admin deactivates an employee`, bobStatus?.status === 'inactive')

  await asUser(db, bob)
  ok(`${label}: inactive employee has no workspace permission`, (await scalar(db, `select public.has_permission('workspace.access') v`)).v === false)
  ok(`${label}: inactive employee has an empty effective permission set`, (await scalar(db, `select public.get_user_permissions() perms`)).perms.length === 0)
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
      (select count(*)::int from public.form_submissions) submissions`)
  ok(`${label}: admin retains full access`, counts.profiles >= 4 && counts.projects === 3 && counts.clients === 2 && counts.roles >= 2 && counts.submissions === 1, JSON.stringify(counts))

  await asUser(db, erin)
  ok(`${label}: manager keeps full portfolio access`, (await scalar(db, 'select count(*)::int n from public.projects')).n === 3)
  const managerRoleChangeFails = await expectError(db, () => db.query(`select public.set_user_role($1, 'manager'::public.app_role)`, [bob]))
  ok(`${label}: manager cannot change system roles`, managerRoleChangeFails)

  // Archive the fixture form so later suites that count published templates stay isolated.
  await asUser(db, alice)
  await db.query(`update public.form_templates set status = 'archived' where slug = 'newco-request'`)

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
  ok(`${label}: employee does NOT receive submission.view by default`, !employeePerms.includes('submission.view'))
  ok(`${label}: employee does NOT receive client.view by default`, !employeePerms.includes('client.view'))
  ok(`${label}: employee cannot read CRM client records unless granted`, (await scalar(db, 'select count(*)::int n from public.clients')).n === 0)

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
  await asUser(db, alice)
  const acmeClient = (await db.query(`select id from public.clients where email = 'carol@acme.test'`)).rows[0]
  await asUser(db, bob)
  const employeeCreatesProjectFails = await expectError(db, () => db.query(`insert into public.projects (name, client_id) values ('Sneaky', $1)`, [acmeClient.id]))
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
  ok(`${label}: workspace.access alone does not expose the employee directory`, (await scalar(db, `select count(*)::int n from public.profiles`)).n === 1)
  ok(`${label}: RBAC catalog tables require their explicit view permissions`,
    (await scalar(db, `select count(*)::int n from public.permissions`)).n === 0
      && (await scalar(db, `select count(*)::int n from public.app_roles`)).n === 0
      && (await scalar(db, `select count(*)::int n from public.role_permissions`)).n === 0)
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
  ok(`${label}: catalog exposes form.manage, form.view & portfolio.manage checkboxes`, catalogKeys.has('form.manage') && catalogKeys.has('form.view') && catalogKeys.has('portfolio.manage'))

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
  ok(`${label}: employee without submission.view cannot read submissions`, (await scalar(db, 'select count(*)::int n from public.form_submissions')).n === 0)
  ok(`${label}: employee without submission.view cannot read answer snapshots`, (await scalar(db, 'select count(*)::int n from public.form_submission_answers')).n === 0)
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

  // Grace replaces her temporary password on first login (simulated), which is
  // what unlocks her workspace access in the real flow.
  await asUser(db, grace.id)
  await db.query(`select public.mark_password_changed($1)`, [grace.id])
  ok(`${label}: first-login password change unlocks the provisioned member`, (await scalar(db, `select public.has_permission('workspace.access') v`)).v === true)
  await asUser(db, alice)

  // An e-mail that already exists in Supabase Auth must be rejected even when
  // its profile row is gone (e.g. removed by manual data surgery). Removing
  // Grace's profile temporarily reproduces that state; it is restored below.
  await superUser(db)
  await db.query(`delete from public.profiles where id = $1`, [grace.id])
  await asUser(db, alice)
  const authOnlyDuplicateRejected = await expectError(db, () => db.query(
    `select public.admin_create_team_member('grace@agency.test', 'Grace Clone')`))
  ok(`${label}: e-mail already present in Auth is rejected even without a matching profile`, authOnlyDuplicateRejected)
  await superUser(db)
  const graceRoleId = (await db.query(`select id from public.app_roles where key = 'employee'`)).rows[0].id
  await db.query(
    `insert into public.profiles (id, email, full_name, role, role_id, status, must_change_password, job_title, department, specialization, bio)
     values ($1, 'grace@agency.test', 'Grace Designer', 'employee', $2, 'active', false, 'Senior Designer', 'Design', 'Brand Identity', 'Leads brand identity work')`,
    [grace.id, graceRoleId],
  )
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

async function runCapabilityEnforcementSuite(db, ids, label) {
  const { alice, bob, erin } = ids

  // Direct operations — not UI clicks. A custom role with form.manage must be
  // able to manage forms even though it lacks admin.manage (the old route bug).
  await asUser(db, alice)
  const formEditorId = (await scalar(db, `select (public.create_app_role('Form Editor', 'No admin.manage')).id v`)).v
  await scalar(db, `select public.set_role_permissions($1, array['workspace.access','form.manage','form.view'])`, [formEditorId])
  await scalar(db, `select public.assign_user_role($1, $2)`, [bob, formEditorId])

  await asUser(db, bob)
  ok(`${label}: custom form editor has form.manage without admin.manage`,
    (await scalar(db, `select public.has_permission('form.manage') v`)).v === true
      && (await scalar(db, `select public.has_permission('admin.manage') v`)).v === false)
  ok(`${label}: has_any_permission treats form.manage as enough for the forms area`,
    (await scalar(db, `select public.has_any_permission(array['form.manage','form.view','admin.manage']) v`)).v === true)
  ok(`${label}: has_any_permission rejects the admin-only hub when none of the keys match`,
    (await scalar(db, `select public.has_any_permission(array['admin.manage']) v`)).v === false)
  const bobCreatesForm = await db.query(`insert into public.form_templates (slug, title) values ('editor-owned', 'Editor Owned')`)
    .then(() => true).catch(() => false)
  ok(`${label}: form.manage can create a form without admin.manage (RLS)`, bobCreatesForm)
  const bobEditsForm = await db.query(`update public.form_templates set description = 'edited' where slug = 'editor-owned'`)
    .then((r) => (r.affectedRows ?? 0) > 0).catch(() => false)
  ok(`${label}: form.manage can update a form without admin.manage (RLS)`, bobEditsForm)
  const bobDuplicates = await expectError(db, () => scalar(db, `select public.duplicate_form_template((select id from public.form_templates where slug = 'editor-owned'))`))
  ok(`${label}: form.manage can call form RPCs without admin.manage`, !bobDuplicates)

  ok(`${label}: form editor still cannot read client records`, (await scalar(db, 'select count(*)::int n from public.clients')).n === 0)
  ok(`${label}: form editor still cannot read submissions`, (await scalar(db, 'select count(*)::int n from public.form_submissions')).n === 0)
  const bobDeactivateFails = await expectError(db, () => db.query(`select public.set_user_status($1, 'inactive')`, [erin]))
  ok(`${label}: form editor cannot deactivate users (no employee.manage)`, bobDeactivateFails)

  await asUser(db, alice)
  await scalar(db, `select public.set_user_role($1, 'employee'::public.app_role)`, [bob])
  await scalar(db, `select public.delete_app_role($1)`, [formEditorId])

  await asUser(db, bob)
  ok(`${label}: default employee still cannot read clients after the custom role is removed`, (await scalar(db, 'select count(*)::int n from public.clients')).n === 0)
  ok(`${label}: default employee still cannot read submissions after the custom role is removed`, (await scalar(db, 'select count(*)::int n from public.form_submissions')).n === 0)

  await asUser(db, alice)
  await db.query(`select public.set_user_status($1, 'inactive')`, [bob])
  await asUser(db, bob)
  ok(`${label}: inactive employee loses every permission including leftover grants`,
    (await scalar(db, `select public.get_user_permissions() perms`)).perms.length === 0
      && (await scalar(db, `select public.has_any_permission(array['workspace.access','form.manage']) v`)).v === false)
  await asUser(db, alice)
  await db.query(`select public.set_user_status($1, 'active')`, [bob])
  await superUser(db)
}

async function runNotificationSuite(db, ids, label) {
  const { anonVisitor, alice, bob, erin } = ids

  // 1. Dynamic Form Submission -> Admin receives notification
  await asUser(db, alice)
  const templateId = (await db.query(`insert into public.form_templates (slug, title, status) values ('branding-request', 'Branding & Visual Identity', 'published') returning id`)).rows[0].id
  const qName = (await db.query(`insert into public.form_questions (form_id, question_type, label, required, map_to, position) values ($1, 'short_text', 'Full Name', true, 'name', 1) returning id`, [templateId])).rows[0].id
  const qEmail = (await db.query(`insert into public.form_questions (form_id, question_type, label, required, map_to, position) values ($1, 'short_text', 'Email', true, 'email', 2) returning id`, [templateId])).rows[0].id

  // Clear alice's notifications first to test fresh
  await superUser(db)
  await db.query(`delete from public.notifications where recipient_id = $1`, [alice])

  // Anonymous visitor submits the dynamic form
  await asUser(db, anonVisitor, 'anon')
  const answers = { [qName]: 'Mona Founder', [qEmail]: 'mona@branding.test' }
  const submission = (await db.query(`select * from public.submit_dynamic_form($1, $2::jsonb)`, [templateId, JSON.stringify(answers)])).rows[0]

  // Alice (Admin) checks her notifications
  await asUser(db, alice)
  const adminNotifs = (await db.query(`select * from public.notifications where recipient_id = $1 order by created_at desc`, [alice])).rows
  ok(`${label}: admin receives notification on dynamic form submission`, adminNotifs.length > 0)
  const formNotif = adminNotifs.find((n) => n.submission_id === submission.id || n.type === 'form_submission')
  ok(`${label}: form submission notification contains title & form name`, formNotif?.title?.includes('Branding & Visual Identity') && formNotif?.message?.includes('Mona Founder'))
  ok(`${label}: form submission notification contains action_url`, formNotif?.action_url?.includes(`/admin/forms/${templateId}`))
  ok(`${label}: form submission notification contains metadata`, formNotif?.metadata?.client_name === 'Mona Founder' && formNotif?.metadata?.submission_id === submission.id)

  // Bob (Employee) must NOT receive admin form submission notifications
  await asUser(db, bob)
  const bobNotifsBefore = (await db.query(`select * from public.notifications where recipient_id = $1 and type = 'form_submission'`, [bob])).rows
  ok(`${label}: employee does NOT receive admin form submission notifications`, bobNotifsBefore.length === 0)

  // 2. Project Assignment -> Employee receives notification
  await asUser(db, alice)
  const newProjId = (await db.query(`insert into public.projects (name, client_id, status) select 'Mobile App Redesign', id, 'active' from public.clients limit 1 returning id`)).rows[0].id
  await db.query(`insert into public.project_members (project_id, user_id, assigned_by) values ($1, $2, $3)`, [newProjId, bob, alice])

  await asUser(db, bob)
  const bobProjectNotif = (await db.query(`select * from public.notifications where recipient_id = $1 and project_id = $2 and type = 'assignment'`, [bob, newProjId])).rows[0]
  ok(`${label}: employee receives notification on project assignment`, !!bobProjectNotif)
  ok(`${label}: project notification contains project name & assigner`, bobProjectNotif?.message?.includes('Mobile App Redesign') && bobProjectNotif?.message?.includes('Alice Admin'))
  ok(`${label}: project notification links to project`, bobProjectNotif?.action_url === `/projects/${newProjId}`)

  // 3. Task Assignment -> Employee receives notification
  await asUser(db, alice)
  const taskId = (await db.query(`insert into public.tasks (title, project_id, assignee_id, due_date, priority) values ('Create wireframes', $1, $2, '2026-09-01', 'high') returning id`, [newProjId, bob])).rows[0].id

  await asUser(db, bob)
  const bobTaskNotif = (await db.query(`select * from public.notifications where recipient_id = $1 and task_id = $2`, [bob, taskId])).rows[0]
  ok(`${label}: employee receives notification on task assignment`, !!bobTaskNotif)
  ok(`${label}: task notification contains task title, project & due date`, bobTaskNotif?.title?.includes('Create wireframes') && bobTaskNotif?.message?.includes('2026-09-01'))
  ok(`${label}: task notification links to project/task`, bobTaskNotif?.action_url?.includes(`/projects/${newProjId}`))

  // 4. Mark as read / persistence across queries
  ok(`${label}: notification starts unread (read_at is null)`, bobTaskNotif?.read_at === null)
  await db.query(`update public.notifications set read_at = now() where id = $1`, [bobTaskNotif.id])
  const updatedNotif = (await db.query(`select * from public.notifications where id = $1`, [bobTaskNotif.id])).rows[0]
  ok(`${label}: notification can be marked as read`, updatedNotif?.read_at !== null)

  // 5. Notification Security: Bob cannot see or mutate Alice's notifications
  const bobSeesAliceNotifs = (await db.query(`select * from public.notifications where recipient_id = $1`, [alice])).rows
  ok(`${label}: employee cannot see admin notifications (RLS)`, bobSeesAliceNotifs.length === 0)
  const bobUpdatesAlice = await db.query(`update public.notifications set read_at = now() where recipient_id = $1`, [alice]).then((r) => r.affectedRows ?? 0).catch(() => -1)
  ok(`${label}: employee cannot update admin notifications (RLS)`, bobUpdatesAlice <= 0)
  const bobDeletesAlice = await db.query(`delete from public.notifications where recipient_id = $1`, [alice]).then((r) => r.affectedRows ?? 0).catch(() => -1)
  ok(`${label}: employee cannot delete admin notifications (RLS)`, bobDeletesAlice <= 0)

  await superUser(db)
}

async function runStorageSecuritySuite(db, ids, label) {
  const { anonVisitor, alice, bob, carol } = ids

  // 1. Storage bucket configuration & visibility invariants
  const avatarBucket = (await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'`)).rows[0]
  ok(`${label}: avatars bucket is public with 5 MB limit`, avatarBucket?.public === true && Number(avatarBucket?.file_size_limit) === 5242880)

  const portfolioBucket = (await db.query(`select public, file_size_limit from storage.buckets where id = 'portfolio-images'`)).rows[0]
  ok(`${label}: portfolio-images bucket is private with 10 MB limit`, portfolioBucket?.public === false && Number(portfolioBucket?.file_size_limit) === 10485760)

  const projectBucket = (await db.query(`select public, file_size_limit from storage.buckets where id = 'project-files'`)).rows[0]
  ok(`${label}: project-files bucket is private with 50 MB limit`, projectBucket?.public === false && Number(projectBucket?.file_size_limit) === 52428800)

  const formFilesBucket = (await db.query(`select public, file_size_limit from storage.buckets where id = 'form-files'`)).rows[0]
  ok(`${label}: form-files bucket is private with 20 MB limit`, formFilesBucket?.public === false && Number(formFilesBucket?.file_size_limit) === 20971520)

  // 2. Project files storage isolation
  await asUser(db, alice)
  const projRes = await db.query(`insert into public.projects (name, client_id, status) select 'Storage Secured Project', id, 'active' from public.clients limit 1 returning id`)
  const storageProjId = projRes.rows[0].id
  await db.query(`insert into public.project_members (project_id, user_id) values ($1, $2)`, [storageProjId, bob])

  // Alice uploads a file to project-files
  const storageFilePath = `${storageProjId}/specs.pdf`
  await db.query(`insert into storage.objects (bucket_id, name, owner_id) values ('project-files', $1, $2)`, [storageFilePath, alice])
  await db.query(`insert into public.files (name, type, size, storage_path, project_id, uploaded_by) values ('specs.pdf', 'pdf', 1024, $1, $2, $3)`, [storageFilePath, storageProjId, alice])

  // Bob (assigned, has file.view) can see the storage object
  await asUser(db, bob)
  const bobSeesProjFile = (await db.query(`select count(*)::int n from storage.objects where bucket_id = 'project-files' and name = $1`, [storageFilePath])).rows[0]?.n
  ok(`${label}: assigned employee with file.view can read project storage object`, bobSeesProjFile === 1)

  // Carol (client / not assigned) cannot see the storage object
  await asUser(db, carol, 'authenticated')
  const carolSeesProjFile = (await db.query(`select count(*)::int n from storage.objects where bucket_id = 'project-files' and name = $1`, [storageFilePath])).rows[0]?.n
  ok(`${label}: unassigned client cannot read project storage object`, carolSeesProjFile === 0)

  // 3. Dynamic Form attachment validation and backend security
  await asUser(db, alice)
  const uploadFormId = (await db.query(`insert into public.form_templates (slug, title, status) values ('upload-test-form', 'Upload Test Form', 'published') returning id`)).rows[0].id
  const qAttach = (await db.query(`insert into public.form_questions (form_id, question_type, label, required, position) values ($1, 'file_upload', 'Project Documents', false, 1) returning id`, [uploadFormId])).rows[0].id
  const qRespondentEmail = (await db.query(`insert into public.form_questions (form_id, question_type, label, required, map_to, position) values ($1, 'short_text', 'Email Address', true, 'email', 2) returning id`, [uploadFormId])).rows[0].id

  // Anonymous visitor uploads safe file into form-files under their folder
  await asUser(db, anonVisitor, 'anon')
  const safeFormFilePath = `${anonVisitor}/brief.pdf`
  await db.query(`insert into storage.objects (bucket_id, name, owner_id) values ('form-files', $1, $2)`, [safeFormFilePath, anonVisitor])

  // Submit dynamic form with safe attachment
  const validAnswers = {
    [qRespondentEmail]: 'uploader@secure.test',
    [qAttach]: [{ name: 'brief.pdf', size: 2048, mime_type: 'application/pdf', storage_path: safeFormFilePath }],
  }
  const submitResult = (await db.query(`select * from public.submit_dynamic_form($1, $2::jsonb)`, [uploadFormId, JSON.stringify(validAnswers)])).rows[0]
  ok(`${label}: valid file attachment is accepted and saved in form submission`, !!submitResult?.id)

  const savedAttach = (await db.query(`select * from public.form_submission_attachments where submission_id = $1`, [submitResult.id])).rows[0]
  ok(`${label}: attachment metadata is recorded in form_submission_attachments`, savedAttach?.storage_path === safeFormFilePath && savedAttach?.name === 'brief.pdf')

  // Submit dynamic form with dangerous .exe extension -> backend exception
  const dangerousAnswers = {
    [qRespondentEmail]: 'malicious@secure.test',
    [qAttach]: [{ name: 'payload.exe', size: 1024, mime_type: 'application/x-msdownload', storage_path: `${anonVisitor}/payload.exe` }],
  }
  const dangerousUploadFails = await expectError(db, () => db.query(`select * from public.submit_dynamic_form($1, $2::jsonb)`, [uploadFormId, JSON.stringify(dangerousAnswers)]))
  ok(`${label}: submit_dynamic_form rejects dangerous executable file attachment (.exe)`, dangerousUploadFails)

  // Submit dynamic form with oversized file (> 20 MB) -> backend exception
  const oversizedAnswers = {
    [qRespondentEmail]: 'oversized@secure.test',
    [qAttach]: [{ name: 'massive.zip', size: 25000000, mime_type: 'application/zip', storage_path: `${anonVisitor}/massive.zip` }],
  }
  const oversizedUploadFails = await expectError(db, () => db.query(`select * from public.submit_dynamic_form($1, $2::jsonb)`, [uploadFormId, JSON.stringify(oversizedAnswers)]))
  ok(`${label}: submit_dynamic_form rejects file attachment exceeding 20 MB size limit`, oversizedUploadFails)

  // 4. Form files storage read isolation: staff without submission.view cannot read others' uploads
  await asUser(db, bob)
  const bobSeesFormFiles = (await db.query(`select count(*)::int n from storage.objects where bucket_id = 'form-files'`)).rows[0]?.n
  ok(`${label}: employee without submission.view cannot read form-files storage objects`, bobSeesFormFiles === 0)

  await asUser(db, alice)
  const aliceSeesFormFiles = (await db.query(`select count(*)::int n from storage.objects where bucket_id = 'form-files'`)).rows[0]?.n
  ok(`${label}: manager with submission.view can read form-files storage objects`, aliceSeesFormFiles > 0)

  // 5. Storage audit & orphan summary RPC
  const auditSummary = (await scalar(db, `select public.get_storage_audit_summary() summary`)).summary
  ok(`${label}: get_storage_audit_summary returns accurate metrics`,
    typeof auditSummary === 'object' &&
    Number(auditSummary?.project_files_count) >= 1 &&
    Number(auditSummary?.form_attachments_count) >= 1 &&
    typeof auditSummary?.storage_objects_total === 'number')

  await superUser(db)
}

async function main() {
  console.log(`=== Path A: ordered migrations ending with ${migrationFile} (upgrade path) ===`)
  const dbA = await makeDb()
  const idsA = await applyAndSeed(dbA)
  await runSuite(dbA, idsA, 'upgrade')
  await runPermissionSuite(dbA, idsA, 'upgrade')
  await runDynamicFormSuite(dbA, idsA, 'upgrade')
  await runTeamDirectorySuite(dbA, idsA, 'upgrade')
  await runPortfolioSuite(dbA, idsA, 'upgrade')
  await runPermissionUiContractSuite(dbA, idsA, 'upgrade')
  await runCapabilityEnforcementSuite(dbA, idsA, 'upgrade')
  await runNotificationSuite(dbA, idsA, 'upgrade')
  await runStorageSecuritySuite(dbA, idsA, 'upgrade')
  await dbA.close()

  console.log('\n=== Path B: fresh install from updated schema.sql ===')
  const dbB = await makeDb()
  // Execute the generated full-chain snapshot with transaction boundaries in the
  // same way as psql/Supabase SQL Editor (required after ALTER TYPE ... ADD VALUE).
  await execMigrationLikePsql(dbB, freshSchema)
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
  const employeeRow = (await dbB.query('select role, full_name, must_change_password, other_social_links from public.profiles where id = $1', [employeeB])).rows[0]
  ok('fresh: Admin Team Management provisions an employee Auth account', employeeRow?.role === 'employee' && employeeRow?.full_name === 'Fresh Employee')
  ok('fresh: enhanced profile columns and temporary-password state are installed', employeeRow?.must_change_password === true && employeeRow?.other_social_links && typeof employeeRow.other_social_links === 'object')
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
  const freshAdminNotifs = (await dbB.query(`select * from public.notifications where recipient_id = $1`, [aliceB])).rows
  ok('fresh: admin receives notification on submission', freshAdminNotifs.length >= 1 && freshAdminNotifs[0].type === 'form_submission')
  await dbB.close()

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) process.exit(1)
}

main().catch((error) => { console.error('HARNESS ERROR:', error); process.exit(2) })
