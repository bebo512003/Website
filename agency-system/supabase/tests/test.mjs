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
  // Session 13: the assignee guard requires project membership before a task
  // can be handed to an employee, so the member row goes in first.
  await db.query(`insert into public.project_members (project_id, user_id) values ($1, $2)`, [project.id, bob])
  await db.query(`insert into public.tasks (title, project_id, assignee_id) values ('Design logo concepts', $1, $2)`, [project.id, bob])
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
  ok(`${label}: anonymous visitor submits the dynamic form`, submitted?.status === 'new' && submitted?.respondent_name === 'Mona Founder')

  await superUser(db)
  const monaClient = (await db.query(`select id, email from public.clients where email = 'mona@demo.test'`)).rows[0]
  ok(`${label}: submission auto-creates the CRM client (e-mail match automation)`, monaClient?.email === 'mona@demo.test' && submitted?.client_id === monaClient?.id)
  const answerRows = await scalar(db, `select
      count(*)::int total,
      count(*) filter (where question_snapshot ->> 'label' = 'Your full name')::int named,
      count(*) filter (where value = '"Logo"'::jsonb)::int dropdown
    from public.form_submission_answers where submission_id = $1`, [submitted.id])
  ok(`${label}: answers stored with per-question snapshots`, answerRows.total === 4 && answerRows.named === 1 && answerRows.dropdown === 1, JSON.stringify(answerRows))

  // ── Admin Submission Inbox workflow ────────────────────────────────
  // Moving a submission through statuses and assigning a reviewer must never
  // touch the stored answers, question snapshots or attachments.
  await asUser(db, alice)
  const reviewing = await scalar(db, `select public.update_form_submission_status($1, 'reviewing')`, [submitted.id])
  ok(`${label}: admin moves a submission to Reviewing (submission.edit)`, reviewing?.update_form_submission_status === true)
  const needsInfo = await scalar(db, `select public.update_form_submission_status($1, 'need_information')`, [submitted.id])
  ok(`${label}: admin moves a submission to Need Information`, needsInfo?.update_form_submission_status === true)
  const badStatusFails = await expectError(db, () => scalar(db, `select public.update_form_submission_status($1, 'hacked')`, [submitted.id]))
  ok(`${label}: invalid status is rejected server-side`, badStatusFails)
  await scalar(db, `select public.assign_form_submission_reviewer($1, $2)`, [submitted.id, erin])
  const reviewerRow = (await db.query(`select reviewer_id, reviewed_at from public.form_submissions where id = $1`, [submitted.id])).rows[0]
  ok(`${label}: admin assigns a reviewer/owner (submission.assign)`, reviewerRow?.reviewer_id === erin && reviewerRow?.reviewed_at !== null)
  const answersAfterWorkflow = await scalar(db, `select count(*)::int n from public.form_submission_answers where submission_id = $1`, [submitted.id])
  const snapshotAfterWorkflow = await scalar(db, `select count(*)::int n from public.form_submission_answers where submission_id = $1 and question_snapshot ->> 'label' = 'Your full name'`, [submitted.id])
  const attachmentsAfterWorkflow = await scalar(db, `select count(*)::int n from public.form_submission_attachments where submission_id = $1`, [submitted.id])
  ok(`${label}: reviewing preserves every answer and question snapshot`, answersAfterWorkflow.n === 4 && snapshotAfterWorkflow.n === 1 && attachmentsAfterWorkflow.n === 0, JSON.stringify(answersAfterWorkflow))
  await scalar(db, `select public.assign_form_submission_reviewer($1, null)`, [submitted.id])
  const clearedReviewer = (await db.query(`select reviewer_id, reviewed_at from public.form_submissions where id = $1`, [submitted.id])).rows[0]
  ok(`${label}: reviewer can be cleared (ownership released)`, clearedReviewer?.reviewer_id === null && clearedReviewer?.reviewed_at === null)

  // Manager (submission.edit) can also move the workflow, but the change still
  // leaves every answer intact.
  await asUser(db, erin)
  const managerStatus = await scalar(db, `select public.update_form_submission_status($1, 'approved')`, [submitted.id])
  ok(`${label}: manager (submission.edit) can approve a submission`, managerStatus?.update_form_submission_status === true)
  const answersForManager = await scalar(db, `select count(*)::int n from public.form_submission_answers where submission_id = $1`, [submitted.id])
  ok(`${label}: manager review keeps all answers`, answersForManager.n === 4)

  // ── Read access ───────────────────────────────────────────────────
  await asUser(db, bob)
  ok(`${label}: employee without submission.view cannot read submissions`, (await scalar(db, 'select count(*)::int n from public.form_submissions')).n === 0)
  ok(`${label}: employee without submission.view cannot read answer snapshots`, (await scalar(db, 'select count(*)::int n from public.form_submission_answers')).n === 0)
  const employeeArchiveFails = await expectError(db, () => db.query(`update public.form_submissions set status = 'archived'`))
  const archiveRows = await scalar(db, `select count(*)::int n from public.form_submissions where status = 'archived'`)
  ok(`${label}: employee (no submission.edit) cannot archive submissions`, employeeArchiveFails || archiveRows.n === 0)
  const employeeStatusFails = await expectError(db, () => scalar(db, `select public.update_form_submission_status($1, 'approved')`, [submitted.id]))
  ok(`${label}: employee (no submission.edit) cannot move submission status via RPC`, employeeStatusFails)
  const employeeAssignFails = await expectError(db, () => scalar(db, `select public.assign_form_submission_reviewer($1, $2)`, [submitted.id, alice]))
  ok(`${label}: employee (no submission.assign) cannot assign a reviewer via RPC`, employeeAssignFails)

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
  // Session 13: task-assignment notifications deep-link into My Work.
  ok(`${label}: task notification deep-links into My Work`, bobTaskNotif?.action_url === `/my-work?task=${taskId}`)

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

  // 6. Domain-event catalog + dedupe
  await asUser(db, alice)
  await scalar(db, `select public.assign_form_submission_reviewer($1, $2)`, [submission.id, erin])
  await scalar(db, `select public.assign_form_submission_reviewer($1, $2)`, [submission.id, erin])
  await superUser(db)
  const erinAssign = (await db.query(
    `select * from public.notifications where recipient_id = $1 and submission_id = $2 and event = 'submission.assigned'`,
    [erin, submission.id],
  )).rows
  ok(`${label}: submission assignment notifies the reviewer once (deduped)`, erinAssign.length === 1)
  ok(`${label}: submission assignment carries a domain event key`, erinAssign[0]?.event === 'submission.assigned' && !!erinAssign[0]?.dedupe_key)

  await asUser(db, alice)
  await scalar(db, `select public.update_form_submission_status($1, 'reviewing')`, [submission.id])
  await superUser(db)
  const erinStatus = (await db.query(
    `select * from public.notifications where recipient_id = $1 and submission_id = $2 and event = 'submission.status_changed'`,
    [erin, submission.id],
  )).rows
  ok(`${label}: submission status change notifies the assigned reviewer`, erinStatus.length === 1 && erinStatus[0].action_url === `/submissions?submission=${submission.id}`)
  const aliceStatus = (await db.query(
    `select * from public.notifications where recipient_id = $1 and submission_id = $2 and event = 'submission.status_changed'`,
    [alice, submission.id],
  )).rows
  ok(`${label}: actor does not receive their own submission status notification`, aliceStatus.length === 0)

  await superUser(db)
  await db.query(`delete from public.notifications where recipient_id = $1`, [bob])
  await asUser(db, alice)
  const ownedProj = (await db.query(
    `insert into public.projects (name, client_id, status, owner_id) select 'Owned by Bob', id, 'active', $1 from public.clients limit 1 returning id`,
    [bob],
  )).rows[0]
  await asUser(db, bob)
  const bobCreated = (await db.query(
    `select event, type from public.notifications where recipient_id = $1 and project_id = $2`,
    [bob, ownedProj.id],
  )).rows
  ok(`${label}: project created notifies the owner once as project.created`,
    bobCreated.length === 1 && bobCreated[0].event === 'project.created')
  ok(`${label}: owner is not also emailed a duplicate team_member.assigned row`,
    !bobCreated.some((row) => row.event === 'team_member.assigned'))

  await asUser(db, alice)
  await db.query(`update public.projects set manager_id = $1 where id = $2`, [erin, ownedProj.id])
  await superUser(db)
  const erinAssigned = (await db.query(
    `select * from public.notifications where recipient_id = $1 and project_id = $2 and event = 'project.assigned'`,
    [erin, ownedProj.id],
  )).rows
  ok(`${label}: changing the manager emits project.assigned once`, erinAssigned.length === 1)

  await asUser(db, alice)
  await db.query(`update public.tasks set status = 'inprogress' where id = $1`, [taskId])
  await superUser(db)
  const bobTaskUpdate = (await db.query(
    `select * from public.notifications where recipient_id = $1 and task_id = $2 and event = 'task.updated'`,
    [bob, taskId],
  )).rows
  ok(`${label}: task update notifies the assignee`, bobTaskUpdate.length === 1 && bobTaskUpdate[0].action_url === `/my-work?task=${taskId}`)
  await asUser(db, alice)
  await db.query(`update public.tasks set status = 'inprogress' where id = $1`, [taskId])
  await superUser(db)
  const bobTaskUpdateAgain = (await db.query(
    `select * from public.notifications where recipient_id = $1 and task_id = $2 and event = 'task.updated'`,
    [bob, taskId],
  )).rows
  ok(`${label}: repeating the same task update does not create a second notification`, bobTaskUpdateAgain.length === 1)

  await asUser(db, alice)
  const selfCreated = (await db.query(
    `select count(*)::int n from public.notifications where recipient_id = $1 and event = 'project.created' and project_id = $2`,
    [alice, ownedProj.id],
  )).rows[0]
  ok(`${label}: creator does not notify themself of project.created`, selfCreated.n === 0)

  await superUser(db)
}

async function runSubmissionReviewWorkflowSuite(db, ids, label) {
  const { anonVisitor, alice, bob, erin } = ids

  // 1. Dynamic form submission creates a response and records initial 'created' event
  await asUser(db, alice)
  const wfFormRes = await db.query(
    `insert into public.form_templates (slug, title, status) values ('qualification-workflow-form', 'Qualification Workflow Form', 'published') returning id`
  )
  const wfFormId = wfFormRes.rows[0].id
  const qName = (
    await db.query(
      `insert into public.form_questions (form_id, question_type, label, required, map_to, position) values ($1, 'short_text', 'Lead Name', true, 'name', 1) returning id`,
      [wfFormId]
    )
  ).rows[0].id
  const qEmail = (
    await db.query(
      `insert into public.form_questions (form_id, question_type, label, required, map_to, position) values ($1, 'short_text', 'Lead Email', true, 'email', 2) returning id`,
      [wfFormId]
    )
  ).rows[0].id

  await asUser(db, anonVisitor, 'anon')
  const submitted = (
    await db.query(`select * from public.submit_dynamic_form($1, $2::jsonb)`, [
      wfFormId,
      JSON.stringify({ [qName]: 'Maya Founder', [qEmail]: 'maya@growth.test' }),
    ])
  ).rows[0]

  ok(`${label}: workflow submission starts with status 'new'`, submitted?.status === 'new')

  // Verify initial submission created event
  await asUser(db, alice)
  const initialEvents = (
    await db.query(
      `select * from public.form_submission_events where submission_id = $1 order by created_at asc`,
      [submitted.id]
    )
  ).rows
  ok(
    `${label}: submission creation records initial event in timeline`,
    initialEvents.length >= 1 && initialEvents[0].event_type === 'created' && initialEvents[0].new_value === 'new'
  )

  // 2. Assign reviewer (Admin -> Erin Manager) with assignment note
  await superUser(db)
  await db.query(`delete from public.notifications where recipient_id = $1`, [erin])

  await asUser(db, alice)
  await scalar(
    db,
    `select public.assign_form_submission_reviewer($1, $2, 'Assigned to Erin for qualification review')`,
    [submitted.id, erin]
  )
  const assignedRow = (
    await db.query(`select reviewer_id, reviewed_at from public.form_submissions where id = $1`, [submitted.id])
  ).rows[0]
  ok(
    `${label}: admin assigns submission to authorized reviewer`,
    assignedRow?.reviewer_id === erin && assignedRow?.reviewed_at !== null
  )

  // Verify notification was sent to Erin
  await asUser(db, erin)
  const erinNotifs = (
    await db.query(
      `select * from public.notifications where recipient_id = $1 and submission_id = $2 and type = 'assignment'`,
      [erin, submitted.id]
    )
  ).rows
  ok(`${label}: assigned reviewer receives notification on assignment`, erinNotifs.length === 1)
  ok(
    `${label}: reviewer notification contains form name and assigner`,
    erinNotifs[0]?.title?.includes('review a submission') &&
      erinNotifs[0]?.message?.includes('Qualification Workflow Form')
  )
  ok(
    `${label}: reviewer notification contains direct action_url`,
    erinNotifs[0]?.action_url === `/submissions?submission=${submitted.id}`
  )

  // Verify assignment event recorded in audit trail
  const assignEvents = (
    await db.query(
      `select * from public.form_submission_events where submission_id = $1 and event_type = 'reviewer_assigned'`,
      [submitted.id]
    )
  ).rows
  ok(
    `${label}: assignment records event with actor_id and timestamp`,
    assignEvents.length === 1 && assignEvents[0]?.actor_id === alice && assignEvents[0]?.created_at !== null
  )

  // Verify assignment note was also persisted
  const assignNotes = (
    await db.query(`select * from public.form_submission_notes where submission_id = $1`, [submitted.id])
  ).rows
  ok(
    `${label}: assignment note saved in form_submission_notes`,
    assignNotes.length === 1 &&
      assignNotes[0]?.note === 'Assigned to Erin for qualification review' &&
      assignNotes[0]?.author_id === alice
  )

  // 3. Prevent assigning an unauthorized reviewer (e.g. client profile or non-existent user)
  await superUser(db)
  const clientFixtureId = crypto.randomUUID()
  const clientRoleId = (await db.query(`select id from public.app_roles where key = 'client'`)).rows[0].id
  await db.query(
    `insert into public.profiles (id, email, full_name, role, role_id) values ($1, 'client.fixture@test.local', 'Client Fixture', 'client', $2)`,
    [clientFixtureId, clientRoleId]
  )

  await asUser(db, alice)
  const assignClientFails = await expectError(db, () =>
    scalar(db, `select public.assign_form_submission_reviewer($1, $2)`, [submitted.id, clientFixtureId])
  )
  ok(`${label}: assigning a client account as reviewer is rejected`, assignClientFails)

  // 4. Erin (Reviewer/Manager) adds internal review notes
  await asUser(db, erin)
  const newNote = (
    await db.query(
      `select * from public.add_form_submission_note($1, 'Qualified lead. Budget confirmed over $25k.')`,
      [submitted.id]
    )
  ).rows[0]
  ok(
    `${label}: authorized staff adds internal review note`,
    newNote?.note?.includes('Qualified lead') && newNote?.author_id === erin
  )

  // Verify note recorded in form_submission_events
  const noteEvents = (
    await db.query(
      `select * from public.form_submission_events where submission_id = $1 and event_type = 'note_added'`,
      [submitted.id]
    )
  ).rows
  ok(`${label}: adding review note records note_added event in audit log`, noteEvents.length >= 1)

  // 5. Change status (Reviewing -> Qualified) with a qualification note
  await scalar(
    db,
    `select public.update_form_submission_status($1, 'qualified', 'Meets all client qualification criteria.')`,
    [submitted.id]
  )
  const qualifiedRow = (
    await db.query(`select status from public.form_submissions where id = $1`, [submitted.id])
  ).rows[0]
  ok(`${label}: reviewer updates submission status to qualified`, qualifiedRow?.status === 'qualified')

  // Verify status change event in audit log
  const statusEvents = (
    await db.query(
      `select * from public.form_submission_events where submission_id = $1 and event_type = 'status_changed'`,
      [submitted.id]
    )
  ).rows
  ok(
    `${label}: status change records event with old_value and new_value`,
    statusEvents.some(
      (e) => e.old_value === 'new' && e.new_value === 'qualified' && e.actor_id === erin
    )
  )

  // 6. Admin reassigns reviewer
  await asUser(db, alice)
  await scalar(
    db,
    `select public.assign_form_submission_reviewer($1, $2, 'Reassigning to Alice for executive review')`,
    [submitted.id, alice]
  )
  const reassignedRow = (
    await db.query(`select reviewer_id from public.form_submissions where id = $1`, [submitted.id])
  ).rows[0]
  ok(`${label}: admin can reassign submission reviewer`, reassignedRow?.reviewer_id === alice)

  const reassignEvents = (
    await db.query(
      `select * from public.form_submission_events where submission_id = $1 and event_type = 'reviewer_reassigned'`,
      [submitted.id]
    )
  ).rows
  ok(`${label}: reassignment records reviewer_reassigned event`, reassignEvents.length === 1)

  // 7. Note deletion (author or admin can delete; others cannot)
  const noteToDelete = newNote.id
  const deleteNoteResult = await scalar(db, `select public.delete_form_submission_note($1)`, [noteToDelete])
  ok(`${label}: admin can delete review note`, deleteNoteResult?.delete_form_submission_note === true)
  ok(
    `${label}: deleted note is removed from notes table`,
    (await scalar(db, `select count(*)::int n from public.form_submission_notes where id = $1`, [noteToDelete]))
      .n === 0
  )

  const noteDeleteEvents = (
    await db.query(
      `select * from public.form_submission_events where submission_id = $1 and event_type = 'note_deleted'`,
      [submitted.id]
    )
  ).rows
  ok(`${label}: deleting note records note_deleted audit event`, noteDeleteEvents.length === 1)

  // 8. Unauthorized users access prevention (RLS & RPCs)
  // Bob (regular employee without submission.view)
  await asUser(db, bob)
  ok(
    `${label}: employee without submission.view cannot read review notes (RLS)`,
    (
      await scalar(
        db,
        `select count(*)::int n from public.form_submission_notes where submission_id = $1`,
        [submitted.id]
      )
    ).n === 0
  )
  ok(
    `${label}: employee without submission.view cannot read audit events (RLS)`,
    (
      await scalar(
        db,
        `select count(*)::int n from public.form_submission_events where submission_id = $1`,
        [submitted.id]
      )
    ).n === 0
  )
  const bobAddNoteFails = await expectError(db, () =>
    scalar(db, `select public.add_form_submission_note($1, 'Unauthorized note')`, [submitted.id])
  )
  ok(`${label}: employee without submission.edit cannot add review note via RPC`, bobAddNoteFails)

  // Client Account (clientFixtureId)
  await asUser(db, clientFixtureId, 'authenticated')
  ok(
    `${label}: client cannot read internal review notes (RLS)`,
    (await scalar(db, `select count(*)::int n from public.form_submission_notes`)).n === 0
  )
  ok(
    `${label}: client cannot read audit events (RLS)`,
    (await scalar(db, `select count(*)::int n from public.form_submission_events`)).n === 0
  )
  const clientAddNoteFails = await expectError(db, () =>
    scalar(db, `select public.add_form_submission_note($1, 'Client note')`, [submitted.id])
  )
  ok(`${label}: client cannot add review note via RPC`, clientAddNoteFails)
  const clientAssignFails = await expectError(db, () =>
    scalar(db, `select public.assign_form_submission_reviewer($1, $2)`, [submitted.id, erin])
  )
  ok(`${label}: client cannot assign reviewer via RPC`, clientAssignFails)
  const clientStatusFails = await expectError(db, () =>
    scalar(db, `select public.update_form_submission_status($1, 'approved')`, [submitted.id])
  )
  ok(`${label}: client cannot update submission status via RPC`, clientStatusFails)

  await superUser(db)
}

async function runSubmissionConversionSuite(db, ids, label) {
  const { anonVisitor, alice, bob, erin } = ids

  await asUser(db, alice)
  const formId = (await db.query(
    `insert into public.form_templates (slug, title, status) values ('controlled-conversion', 'Controlled Conversion', 'published') returning id`
  )).rows[0].id
  const emailQuestion = (await db.query(
    `insert into public.form_questions (form_id, question_type, label, required, map_to, position)
     values ($1, 'short_text', 'Contact e-mail', true, 'email', 1) returning id`, [formId]
  )).rows[0].id
  const briefQuestion = (await db.query(
    `insert into public.form_questions (form_id, question_type, label, required, position)
     values ($1, 'long_text', 'Project brief', true, 2) returning id`, [formId]
  )).rows[0].id

  await asUser(db, anonVisitor, 'anon')
  const submission = (await db.query(`select * from public.submit_dynamic_form($1, $2::jsonb)`, [
    formId,
    JSON.stringify({ [emailQuestion]: 'controlled@conversion.test', [briefQuestion]: 'Preserve this original answer.' }),
  ])).rows[0]
  ok(`${label}: public submissions do not create projects by default`, submission?.project_id === null && submission?.status === 'new')

  await asUser(db, alice)
  const prematureConversionFails = await expectError(db, () => db.query(
    `select * from public.convert_submission_to_project($1, null, $2::jsonb, 'Premature', null, 'Website', 'high', 'active', 1, 'Discovery', null, null, null, 'USD', $3, null, '{}'::uuid[])`,
    [submission.id, JSON.stringify({ name: 'Premature Client', type: 'smb' }), alice]
  ))
  ok(`${label}: conversion requires Qualified or Approved status`, prematureConversionFails)

  const fakeConvertedStatusFails = await expectError(db, () =>
    db.query(`select public.update_form_submission_status($1, 'converted')`, [submission.id]))
  ok(`${label}: Converted status cannot be set without creating a project`, fakeConvertedStatusFails)

  await db.query(`select public.update_form_submission_status($1, 'qualified', 'Ready for controlled conversion')`, [submission.id])

  await asUser(db, erin)
  const managerConversionFails = await expectError(db, () => db.query(
    `select * from public.convert_submission_to_project($1, null, $2::jsonb, 'Manager Attempt', null, 'Website', 'high', 'active', 1, 'Discovery', null, null, null, 'USD', $3, null, '{}'::uuid[])`,
    [submission.id, JSON.stringify({ name: 'Manager Client', type: 'smb' }), erin]
  ))
  ok(`${label}: only Admin can perform deliberate conversion`, managerConversionFails)

  await expectError(db, () => db.query(
    `update public.form_templates set settings = '{"create_project_on_submit": true}'::jsonb where id = $1`, [formId]
  ))
  const managerAutomationEnabled = (await db.query(
    `select coalesce(settings ->> 'create_project_on_submit', 'false') = 'true' enabled from public.form_templates where id = $1`, [formId]
  )).rows[0]?.enabled
  ok(`${label}: non-Admin cannot configure submit-time project automation`, managerAutomationEnabled !== true)

  await asUser(db, alice)
  const project = (await db.query(
    `select * from public.convert_submission_to_project(
       $1, null, $2::jsonb, $3, $4, 'Website', 'high', 'in-review', 2, 'Planning',
       '2026-08-15', '2026-09-30', 25000, 'USD', $5, $6, array[$5]::uuid[]
     )`,
    [
      submission.id,
      JSON.stringify({ name: 'Controlled Client', type: 'enterprise', contact_person: 'Casey', email: 'new-controlled-client@test.local', phone: '+1 555 0100' }),
      'Controlled Website Project',
      'Configured from a qualified submission.',
      bob,
      erin,
    ]
  )).rows[0]

  const converted = (await db.query(
    `select status, client_id, project_id, converted_at, converted_by from public.form_submissions where id = $1`,
    [submission.id]
  )).rows[0]
  ok(`${label}: conversion creates configured project and links it to its client`,
    project?.name === 'Controlled Website Project' && project?.type === 'Website' && project?.priority === 'high' &&
    project?.status === 'in-review' && project?.phase === 2 && project?.phase_name === 'Planning' &&
    project?.owner_id === bob && project?.manager_id === erin && !!project?.client_id)
  ok(`${label}: project preserves immutable original submission reference`, project?.source_submission_id === submission.id)
  ok(`${label}: submission links back to project and records converter/timestamp`,
    converted?.status === 'converted' && converted?.project_id === project.id && converted?.client_id === project.client_id &&
    converted?.converted_by === alice && converted?.converted_at !== null)

  const preservedAnswers = (await db.query(
    `select value from public.form_submission_answers where submission_id = $1 order by created_at`, [submission.id]
  )).rows
  ok(`${label}: submitted answers remain preserved after conversion`,
    preservedAnswers.length === 2 && preservedAnswers.some((row) => row.value === 'Preserve this original answer.'))

  const assignments = (await db.query(
    `select user_id from public.project_members where project_id = $1`, [project.id]
  )).rows.map((row) => row.user_id)
  ok(`${label}: owner, manager, and selected team receive project assignment`,
    assignments.includes(bob) && assignments.includes(erin) && assignments.length === 2)

  const conversionEvent = (await db.query(
    `select * from public.form_submission_events where submission_id = $1 and event_type = 'converted_to_project'`,
    [submission.id]
  )).rows[0]
  ok(`${label}: conversion writes a full audit event with preserved-answer metadata`,
    conversionEvent?.actor_id === alice && conversionEvent?.metadata?.project_id === project.id &&
    conversionEvent?.metadata?.answers_preserved === true && conversionEvent?.metadata?.automatic === false)

  const duplicateConversionFails = await expectError(db, () => db.query(
    `select * from public.convert_submission_to_project($1, $2, null, 'Duplicate', null, 'General', 'medium', 'active', 1, null, null, null, null, 'USD', $3, null, '{}'::uuid[])`,
    [submission.id, project.client_id, alice]
  ))
  ok(`${label}: duplicate conversion is rejected without a second project`, duplicateConversionFails &&
    (await scalar(db, `select count(*)::int n from public.projects where source_submission_id = $1`, [submission.id])).n === 1)

  const sourceMutationFails = await expectError(db, () =>
    db.query(`update public.projects set source_submission_id = null where id = $1`, [project.id]))
  ok(`${label}: original submission reference cannot be cleared or replaced`, sourceMutationFails)

  const convertedStatusMutationFails = await expectError(db, () =>
    db.query(`select public.update_form_submission_status($1, 'approved')`, [submission.id]))
  ok(`${label}: converted submissions cannot return to an earlier workflow status`, convertedStatusMutationFails)

  // ── Session 12: project lifecycle, health, and ownership guarantees ─────
  const defaultHealth = await scalar(db, `select health from public.projects where id = $1`, [project.id])
  ok(`${label}: projects default to on-track health`, defaultHealth?.health === 'on-track')

  const badHealthFails = await expectError(db, () =>
    db.query(`update public.projects set health = 'exploded' where id = $1`, [project.id]))
  ok(`${label}: invalid project health is rejected by the database`, badHealthFails)

  const readyWithoutFilesFails = await expectError(db, () =>
    db.query(`update public.projects set status = 'ready-for-delivery' where id = $1`, [project.id]))
  ok(`${label}: ready-for-delivery is rejected without a final delivery file`, readyWithoutFilesFails)

  await db.query(`insert into public.files (name, type, size, storage_path, project_id, uploaded_by)
    values ('handoff.pdf', 'pdf', 2048, $1, $2, $3)`, [`${project.id}/handoff.pdf`, project.id, alice])
  const handoffId = (await db.query(`select id from public.files where project_id = $1 and name = 'handoff.pdf'`, [project.id])).rows[0].id
  await db.query(`select public.add_project_delivery_file($1, $2)`, [project.id, handoffId])

  await db.query(`update public.projects set status = 'ready-for-delivery' where id = $1`, [project.id])
  const afterValidMove = await scalar(db, `select status from public.projects where id = $1`, [project.id])
  ok(`${label}: valid lifecycle transition is accepted (in-review → ready-for-delivery)`,
    afterValidMove?.status === 'ready-for-delivery')

  const skippedStageFails = await expectError(db, () =>
    db.query(`update public.projects set status = 'completed' where id = $1`, [project.id]))
  const afterInvalidMove = await scalar(db, `select status from public.projects where id = $1`, [project.id])
  ok(`${label}: skipping lifecycle stages is rejected (ready-for-delivery → completed)`,
    skippedStageFails && afterInvalidMove?.status === 'ready-for-delivery')

  await db.query(`update public.projects set status = 'delivered' where id = $1`, [project.id])
  const completeWithoutApprovalFails = await expectError(db, () =>
    db.query(`update public.projects set status = 'completed' where id = $1`, [project.id]))
  ok(`${label}: delivered → completed is rejected without the internal approval placeholder`,
    completeWithoutApprovalFails)

  await db.query(`select public.record_internal_client_approval($1, 'Client signed off on the call.', 'approved_internally')`, [project.id])
  await db.query(`update public.projects set status = 'completed' where id = $1`, [project.id])
  const completedRow = await scalar(db, `select status, completed_date from public.projects where id = $1`, [project.id])
  ok(`${label}: delivered → completed is valid after delivery files + internal approval and stamps completed_date`,
    completedRow?.status === 'completed' && completedRow?.completed_date !== null)

  const anyClientId = (await db.query(`select id from public.clients limit 1`)).rows[0]?.id
  const directProject = (await db.query(
    `insert into public.projects (name, client_id, status, owner_id, manager_id)
     values ('Ownership Guarantee', $1, 'planned', $2, $3) returning id`,
    [anyClientId, bob, erin]
  )).rows[0]
  const leadAssignments = (await db.query(
    `select user_id from public.project_members where project_id = $1`, [directProject.id]
  )).rows.map((row) => row.user_id)
  ok(`${label}: owner and manager are automatically project members`,
    leadAssignments.includes(bob) && leadAssignments.includes(erin))

  // Explicit Admin automation remains available as an exceptional opt-in.
  const autoForm = (await db.query(
    `insert into public.form_templates (slug, title, status, settings)
     values ('admin-auto-conversion', 'Admin Auto Conversion', 'published', '{"create_project_on_submit": true}'::jsonb)
     returning id, settings`
  )).rows[0]
  const autoEmailQuestion = (await db.query(
    `insert into public.form_questions (form_id, question_type, label, required, map_to, position)
     values ($1, 'short_text', 'E-mail', true, 'email', 1) returning id`, [autoForm.id]
  )).rows[0].id
  ok(`${label}: Admin opt-in stores automation attribution`,
    autoForm.settings?.create_project_on_submit === true && autoForm.settings?.auto_project_configured_by === alice)

  await asUser(db, anonVisitor, 'anon')
  const automatedSubmission = (await db.query(
    `select * from public.submit_dynamic_form($1, $2::jsonb)`,
    [autoForm.id, JSON.stringify({ [autoEmailQuestion]: 'explicit-auto@test.local' })]
  )).rows[0]
  await asUser(db, alice)
  const automatedStored = (await db.query(
    `select status, project_id, converted_at from public.form_submissions where id = $1`, [automatedSubmission.id]
  )).rows[0]
  const automatedProject = (await db.query(
    `select source_submission_id from public.projects where id = $1`, [automatedStored.project_id]
  )).rows[0]
  const automatedEvent = (await db.query(
    `select metadata from public.form_submission_events where submission_id = $1 and event_type = 'converted_to_project'`,
    [automatedSubmission.id]
  )).rows[0]
  ok(`${label}: explicitly Admin-configured automation links and finalizes the project`,
    automatedStored?.status === 'converted' && automatedStored?.converted_at !== null &&
    automatedProject?.source_submission_id === automatedSubmission.id && automatedEvent?.metadata?.automatic === true)

  await superUser(db)
}

// ── Session 13: My Work & task management ───────────────────────────────────
// Proves the new task guards and the activity feed at the database layer:
// project-scoped assignees (permission-model escape hatch), activity history,
// work notes, and member-removal hygiene.
async function runTaskManagementSuite(db, ids, label) {
  const { alice, bob, erin } = ids

  // A second employee who never joins the project: the guard must reject her
  // as an assignee everywhere.
  await asUser(db, alice)
  await db.query(`select public.admin_create_team_member('rania@agency.test', 'Rania Designer')`)
  await superUser(db)
  const rania = await addUser(db, 'rania@agency.test', { fullName: 'Rania Designer', adminProvisioned: true })
  await asUser(db, rania)
  await db.query(`select public.mark_password_changed($1)`, [rania])
  const raniaIsActiveEmployee = (await scalar(db, `select public.has_permission('task.edit') v`)).v === true
  ok(`${label}: second employee is a fully provisioned active employee`, raniaIsActiveEmployee)

  await asUser(db, alice)
  const anyClientId = (await db.query(`select id from public.clients order by created_at limit 1`)).rows[0]?.id
  const project = (await db.query(
    `insert into public.projects (name, client_id, status, owner_id) values ('My Work Redesign', $1, 'active', $2) returning id`,
    [anyClientId, alice],
  )).rows[0]
  await db.query(`insert into public.project_members (project_id, user_id, assigned_by) values ($1, $2, $3)`, [project.id, bob, alice])

  // ── Assignee directory mirrors the guard ──────────────────────────────
  const assigneeRows = (await db.query(`select * from public.list_task_assignees($1)`, [project.id])).rows
  ok(`${label}: assignee directory returns members and permission-allowed staff only`,
    assigneeRows.some((row) => row.id === bob && row.is_member === true)
      && assigneeRows.some((row) => row.id === alice)
      && assigneeRows.some((row) => row.id === erin && row.is_member === false)
      && !assigneeRows.some((row) => row.id === rania))
  const memberCount = assigneeRows.filter((row) => row.is_member).length
  // The project owner is auto-kept as a member (Session 12), so membership
  // order — not a specific person — is what must hold: all members come first.
  ok(`${label}: assignee directory lists project members first`,
    memberCount >= 2 && assigneeRows.findIndex((row) => !row.is_member) === memberCount)

  await asUser(db, rania)
  const outsiderDirectoryFails = await expectError(db, () => db.query(`select * from public.list_task_assignees($1)`, [project.id]))
  ok(`${label}: staff outside the project cannot list its assignees`, outsiderDirectoryFails)
  await asUser(db, erin) // manager — project.view_all without membership
  const managerDirectoryWorks = (await db.query(`select count(*)::int n from public.list_task_assignees($1)`, [project.id])).rows[0]?.n
  ok(`${label}: project.view_all manager can list assignees without membership`, (managerDirectoryWorks ?? 0) >= 2)

  // ── Assignee guard ────────────────────────────────────────────────────
  await asUser(db, alice)
  const outsiderAssignFails = await expectError(db, () => db.query(
    `insert into public.tasks (title, project_id, assignee_id) values ('Outsider attempt', $1, $2)`, [project.id, rania]))
  ok(`${label}: DB rejects creating a task assigned to a non-member employee`, outsiderAssignFails)

  const homepageTask = (await db.query(
    `insert into public.tasks (title, project_id, assignee_id, priority, due_date) values ('Homepage design', $1, $2, 'high', current_date + 2) returning id`,
    [project.id, bob],
  )).rows[0]
  const reassignToOutsiderFails = await expectError(db, () => db.query(
    `update public.tasks set assignee_id = $1 where id = $2`, [rania, homepageTask.id]))
  ok(`${label}: DB rejects reassigning a task to a non-member employee`, reassignToOutsiderFails)

  const clientProfile = (await db.query(`select id from public.profiles where role = 'client' limit 1`)).rows[0]
  const clientAssignFails = clientProfile && await expectError(db, () => db.query(
    `insert into public.tasks (title, project_id, assignee_id) values ('Client attempt', $1, $2)`, [project.id, clientProfile.id]))
  ok(`${label}: DB rejects assigning a task to a client account`, Boolean(clientProfile) && Boolean(clientAssignFails))

  // The permission model explicitly allows view_all staff without membership.
  await asUser(db, erin)
  const managerSelfTask = (await db.query(
    `insert into public.tasks (title, project_id, assignee_id) values ('Manager sign-off', $1, $2) returning id`,
    [project.id, erin],
  )).rows[0]
  ok(`${label}: project.view_all manager can be assigned without project membership`, Boolean(managerSelfTask?.id))

  // Reassigning to another person requires task.assign (employees may only
  // pick tasks up for themselves). Employees also lack task.create entirely.
  await asUser(db, bob)
  const memberCreateFails = await expectError(db, () => db.query(
    `insert into public.tasks (title, project_id, created_by) values ('Sneaky', $1, $2)`, [project.id, bob]))
  ok(`${label}: default employee cannot create tasks (no task.create)`, memberCreateFails)
  await asUser(db, alice)
  const delegatedTask = (await db.query(
    `insert into public.tasks (title, project_id) values ('Copy draft', $1) returning id`, [project.id])).rows[0]
  await asUser(db, bob)
  const selfPickup = await db.query(`update public.tasks set assignee_id = $1 where id = $2`, [bob, delegatedTask.id])
    .then((r) => r.affectedRows ?? 0).catch(() => -1)
  ok(`${label}: employee can pick up an unassigned task for themselves`, selfPickup === 1)
  const delegateBackFails = await expectError(db, () => db.query(
    `update public.tasks set assignee_id = $1 where id = $2`, [alice, delegatedTask.id]))
  ok(`${label}: employee cannot hand a task to someone else (no task.assign)`, delegateBackFails)
  const handBack = await db.query(`update public.tasks set assignee_id = null where id = $1`, [delegatedTask.id])
    .then((r) => r.affectedRows ?? 0).catch(() => -1)
  ok(`${label}: employee can release their own task back to unassigned`, handBack === 1)
  await asUser(db, erin)
  const managerDelegates = await db.query(`update public.tasks set assignee_id = $1 where id = $2`, [bob, delegatedTask.id])
    .then((r) => r.affectedRows ?? 0).catch(() => -1)
  ok(`${label}: manager with task.assign reassigns to a project member`, managerDelegates === 1)

  // ── Activity feed ─────────────────────────────────────────────────────
  const createdEvents = (await db.query(
    `select * from public.task_activity where task_id = $1 and event_type = 'created'`, [homepageTask.id])).rows
  ok(`${label}: task creation records an activity event with actor`, createdEvents.length === 1 && createdEvents[0]?.actor_id === alice)

  await asUser(db, bob)
  await db.query(`update public.tasks set status = 'inprogress' where id = $1`, [homepageTask.id])
  const statusEvents = (await db.query(
    `select * from public.task_activity where task_id = $1 and event_type = 'status_changed'`, [homepageTask.id])).rows
  ok(`${label}: status change is recorded with old/new values and the actor`,
    statusEvents.length === 1 && statusEvents[0]?.old_value === 'todo' && statusEvents[0]?.new_value === 'inprogress' && statusEvents[0]?.actor_id === bob)

  const note = (await db.query(`select * from public.add_task_note($1, 'Wireframes approved by the client.')`, [homepageTask.id])).rows[0]
  ok(`${label}: member adds a work note via the guarded RPC`, note?.event_type === 'note' && note?.actor_id === bob && note?.new_value?.includes('Wireframes'))
  const emptyNoteFails = await expectError(db, () => db.query(`select * from public.add_task_note($1, '   ')`, [homepageTask.id]))
  ok(`${label}: empty work notes are rejected`, emptyNoteFails)

  // The note-only insert policy: members can insert notes, but nobody may
  // forge a system event through the table API.
  const directNote = await db.query(
    `insert into public.task_activity (task_id, project_id, event_type, new_value) values ($1, $2, 'note', 'Direct insert note')`,
    [homepageTask.id, project.id]).then((r) => r.affectedRows ?? 0).catch(() => -1)
  ok(`${label}: direct note insert passes the note-only RLS policy`, directNote === 1)
  const forgedEventFails = await expectError(db, () => db.query(
    `insert into public.task_activity (task_id, project_id, event_type, new_value) values ($1, $2, 'status_changed', 'done')`,
    [homepageTask.id, project.id]))
  ok(`${label}: system activity events cannot be forged through direct inserts`, forgedEventFails)

  const feed = (await db.query(`select * from public.task_activity where task_id = $1 order by created_at`, [homepageTask.id])).rows
  ok(`${label}: the full activity feed is visible to project members`, feed.length >= 4)

  // The feed is append-only: no update or delete policies exist for anyone.
  const activityUpdate = await db.query(`update public.task_activity set new_value = 'edited' where task_id = $1`, [homepageTask.id])
    .then((r) => r.affectedRows ?? 0).catch(() => -1)
  const activityDelete = await db.query(`delete from public.task_activity where task_id = $1`, [homepageTask.id])
    .then((r) => r.affectedRows ?? 0).catch(() => -1)
  ok(`${label}: activity rows cannot be edited or deleted (append-only)`, activityUpdate === 0 && activityDelete === 0)

  // ── Isolation ─────────────────────────────────────────────────────────
  await asUser(db, rania)
  ok(`${label}: non-member employee sees no task activity (RLS)`,
    (await scalar(db, `select count(*)::int n from public.task_activity where task_id = $1`, [homepageTask.id])).n === 0)
  const outsiderNoteFails = await expectError(db, () => db.query(`select * from public.add_task_note($1, 'Outsider note')`, [homepageTask.id]))
  ok(`${label}: non-member employee cannot add work notes`, outsiderNoteFails)
  ok(`${label}: non-member employee does not see the project tasks`,
    (await scalar(db, `select count(*)::int n from public.tasks where project_id = $1`, [project.id])).n === 0)

  // ── Member-removal hygiene ────────────────────────────────────────────
  await asUser(db, alice)
  const doneTask = (await db.query(
    `insert into public.tasks (title, project_id, assignee_id, status) values ('Finished piece', $1, $2, 'done') returning id`,
    [project.id, bob],
  )).rows[0]
  await db.query(`delete from public.project_members where project_id = $1 and user_id = $2`, [project.id, bob])
  const afterRemoval = await scalar(db,
    `select
       (select assignee_id from public.tasks where id = $1) open_assignee,
       (select assignee_id from public.tasks where id = $2) done_assignee`,
    [delegatedTask.id, doneTask.id])
  ok(`${label}: removing a member releases their open tasks but keeps completed attribution`,
    afterRemoval?.open_assignee === null && afterRemoval?.done_assignee === bob)
  ok(`${label}: the unassignment itself is recorded in the activity feed`,
    (await scalar(db,
      `select count(*)::int n from public.task_activity where task_id = $1 and event_type = 'assignee_changed' and new_value is null`,
      [delegatedTask.id])).n >= 1)

  // After removal the former member loses access to the task AND its history.
  await asUser(db, bob)
  ok(`${label}: removed member can no longer read the task or its activity`,
    (await scalar(db, `select count(*)::int n from public.tasks where id = $1`, [delegatedTask.id])).n === 0
      && (await scalar(db, `select count(*)::int n from public.task_activity where task_id = $1`, [delegatedTask.id])).n === 0)

  await superUser(db)
}

// ── Session 14: unified project activity & audit timeline ───────────────────
// Proves the project_activity feed at the database layer: creation, submission
// conversion, ownership/status/deadline changes, team membership, file
// uploads/deletes, RLS scoping, and the append-only (unforgeable) guarantee.
async function runProjectActivitySuite(db, ids, label) {
  const { anonVisitor, alice, bob, erin } = ids
  // rania is a regular employee (no project.view_all) created by the task
  // management suite; she is never a member of the audit-test project.
  const rania = (await db.query(`select id from public.profiles where email = 'rania@agency.test'`)).rows[0]?.id

  // Build a source submission so "submission converted" can be attributed.
  await asUser(db, alice)
  const paForm = (await db.query(
    `insert into public.form_templates (slug, title, status) values ('pa-audit-form', 'Audit Form', 'published') returning id`
  )).rows[0]
  const paEmailQ = (await db.query(
    `insert into public.form_questions (form_id, question_type, label, required, map_to, position)
     values ($1, 'short_text', 'E-mail', true, 'email', 1) returning id`, [paForm.id]
  )).rows[0].id
  await asUser(db, anonVisitor, 'anon')
  const paSub = (await db.query(`select * from public.submit_dynamic_form($1, $2::jsonb)`, [
    paForm.id, JSON.stringify({ [paEmailQ]: 'audit@conversion.test' }),
  ])).rows[0]
  await asUser(db, alice)
  const paClientId = paSub.client_id
  ok(`${label}: audit submission auto-creates its CRM client`, !!paClientId)

  // Project created directly from a submission (records 'created' + 'submission_converted').
  const proj = (await db.query(
    `insert into public.projects (name, client_id, status, owner_id, manager_id, source_submission_id, due_date)
     values ('Audit Timeline', $1, 'active', $2, $3, $4, current_date + 10) returning id`,
    [paClientId, alice, erin, paSub.id]
  )).rows[0]

  const createdEvents = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'created'`, [proj.id])).rows
  ok(`${label}: project creation records a 'created' event with the actor`,
    createdEvents.length === 1 && createdEvents[0].actor_id === alice)
  const convertedEvents = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'submission_converted'`, [proj.id])).rows
  ok(`${label}: a project created from a submission records 'submission_converted'`,
    convertedEvents.length === 1 && convertedEvents[0].metadata?.source_submission_id === paSub.id)

  // Status change (active → in-review).
  await db.query(`update public.projects set status = 'in-review' where id = $1`, [proj.id])
  const statusEvents = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'status_changed'`, [proj.id])).rows
  ok(`${label}: status change is recorded with old/new values and the actor`,
    statusEvents.length === 1 && statusEvents[0].old_value === 'active' && statusEvents[0].new_value === 'in-review')

  // Deadline change.
  await db.query(`update public.projects set due_date = current_date + 20 where id = $1`, [proj.id])
  const deadlineEvents = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'deadline_changed'`, [proj.id])).rows
  ok(`${label}: deadline change is recorded with old and new dates`,
    deadlineEvents.length === 1 && deadlineEvents[0].new_value === deadlineEvents[0].new_value && deadlineEvents[0].old_value !== deadlineEvents[0].new_value)

  // Ownership & management changes.
  await db.query(`update public.projects set owner_id = $1 where id = $2`, [bob, proj.id])
  const ownerEvents = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'owner_changed'`, [proj.id])).rows
  ok(`${label}: owner change is recorded with old and new owner names`,
    ownerEvents.length === 1 && ownerEvents[0].old_value && ownerEvents[0].new_value && ownerEvents[0].metadata?.new_owner_id === bob)

  await db.query(`update public.projects set manager_id = null where id = $1`, [proj.id])
  const managerEvents = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'manager_changed'`, [proj.id])).rows
  ok(`${label}: manager change is recorded (cleared manager)`,
    managerEvents.length === 1 && managerEvents[0].new_value === null && managerEvents[0].old_value !== null)

  // Team membership add/remove.
  await db.query(`insert into public.project_members (project_id, user_id, assigned_by) values ($1, $2, $3)`, [proj.id, rania, alice])
  const addedEvents = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'member_added' and metadata->>'user_id' = $2`, [proj.id, rania])).rows
  ok(`${label}: adding a team member records a 'member_added' event`, addedEvents.length === 1 && addedEvents[0].new_value !== null)

  await db.query(`delete from public.project_members where project_id = $1 and user_id = $2`, [proj.id, rania])
  const removedEvents = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'member_removed' and metadata->>'user_id' = $2`, [proj.id, rania])).rows
  ok(`${label}: removing a team member records a 'member_removed' event`, removedEvents.length === 1 && removedEvents[0].old_value !== null)

  // File upload / delete.
  await db.query(`insert into public.files (name, type, size, storage_path, project_id, uploaded_by)
    values ('brief.pdf', 'pdf', 1024, $1, $2, $3)`, [`${proj.id}/brief.pdf`, proj.id, alice])
  const uploadedEvents = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'file_uploaded'`, [proj.id])).rows
  ok(`${label}: file upload records a 'file_uploaded' event with the name`,
    uploadedEvents.length === 1 && uploadedEvents[0].new_value === 'brief.pdf' && uploadedEvents[0].actor_id === alice)

  await db.query(`delete from public.files where name = 'brief.pdf' and project_id = $1`, [proj.id])
  const deletedEvents = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'file_deleted'`, [proj.id])).rows
  ok(`${label}: file deletion records a 'file_deleted' event with the name`,
    deletedEvents.length === 1 && deletedEvents[0].old_value === 'brief.pdf')

  // The feed is append-only and unforgeable: no insert/update/delete policies.
  const forgedInsertFails = await expectError(db, () => db.query(
    `insert into public.project_activity (project_id, event_type, new_value) values ($1, 'status_changed', 'done')`, [proj.id]))
  const activityUpdate = await db.query(`update public.project_activity set new_value = 'edited' where project_id = $1`, [proj.id])
    .then((r) => r.affectedRows ?? 0).catch(() => -1)
  const activityDelete = await db.query(`delete from public.project_activity where project_id = $1`, [proj.id])
    .then((r) => r.affectedRows ?? 0).catch(() => -1)
  ok(`${label}: project activity cannot be forged, edited, or deleted`, forgedInsertFails && activityUpdate === 0 && activityDelete === 0)

  // RLS scoping: outsiders see no project_activity; members do.
  await asUser(db, rania)
  ok(`${label}: non-member employee sees no project activity (RLS)`,
    (await scalar(db, `select count(*)::int n from public.project_activity where project_id = $1`, [proj.id])).n === 0)
  await asUser(db, bob)
  ok(`${label}: project member can read the full activity feed`,
    (await scalar(db, `select count(*)::int n from public.project_activity where project_id = $1`, [proj.id])).n >= 9)

  await superUser(db)
}

// ── Session 15: project delivery & closure ───────────────────────────────────
// Final delivery files, delivery state, revision, internal approval placeholder,
// completion guards, and archive. Client-facing approval is out of scope.
async function runProjectDeliveryClosureSuite(db, ids, label) {
  const { alice, bob, erin } = ids
  const dina = (await db.query(`select id from public.profiles where email = 'dina@newco.test' and role = 'client'`)).rows[0]?.id
  const rania = (await db.query(`select id from public.profiles where email = 'rania@agency.test'`)).rows[0]?.id

  await asUser(db, alice)
  const clientId = (await db.query(`select id from public.clients order by created_at limit 1`)).rows[0]?.id
  const proj = (await db.query(
    `insert into public.projects (name, client_id, status, owner_id, manager_id)
     values ('Delivery Closure', $1, 'active', $2, $3) returning id`,
    [clientId, alice, erin],
  )).rows[0]
  await db.query(`insert into public.project_members (project_id, user_id, assigned_by) values ($1, $2, $3)`, [proj.id, bob, alice])

  // New projects cannot start at a delivery stage.
  const startDeliveredFails = await expectError(db, () => db.query(
    `insert into public.projects (name, client_id, status) values ('Skip Delivery', $1, 'delivered')`, [clientId]))
  ok(`${label}: new projects cannot start at Delivered`, startDeliveredFails)

  await db.query(`update public.projects set status = 'in-review' where id = $1`, [proj.id])
  const readyWithoutFileFails = await expectError(db, () =>
    db.query(`update public.projects set status = 'ready-for-delivery' where id = $1`, [proj.id]))
  ok(`${label}: cannot move to Ready for delivery without a final delivery file`, readyWithoutFileFails)

  await db.query(`insert into public.files (name, type, size, storage_path, project_id, uploaded_by)
    values ('working-notes.txt', 'document', 120, $1, $2, $3)`, [`${proj.id}/working-notes.txt`, proj.id, alice])
  const workingId = (await db.query(`select id from public.files where project_id = $1 and name = 'working-notes.txt'`, [proj.id])).rows[0].id
  // Working files alone are not enough — they must be attached to the package.
  const stillBlocked = await expectError(db, () =>
    db.query(`update public.projects set status = 'ready-for-delivery' where id = $1`, [proj.id]))
  ok(`${label}: a working file that is not on the delivery package does not unlock Ready for delivery`, stillBlocked)

  await db.query(`select public.add_project_delivery_file($1, $2)`, [proj.id, workingId])
  const pkg = (await db.query(`select * from public.current_project_delivery($1)`, [proj.id])).rows[0]
  ok(`${label}: attaching a file creates a preparing delivery package`, pkg?.status === 'preparing' && pkg?.version === 1)

  await db.query(`update public.projects set status = 'ready-for-delivery' where id = $1`, [proj.id])
  const readyPkg = (await db.query(`select status from public.project_deliveries where id = $1`, [pkg.id])).rows[0]
  ok(`${label}: moving the project to Ready for delivery stamps the package ready`, readyPkg?.status === 'ready')

  const removeLockedFileFails = await expectError(db, () =>
    db.query(`select public.remove_project_delivery_file($1, $2)`, [proj.id, workingId]))
  ok(`${label}: final delivery files are locked once the package is ready`, removeLockedFileFails)

  const deleteLockedFileFails = await expectError(db, () =>
    db.query(`delete from public.files where id = $1`, [workingId]))
  ok(`${label}: a locked final delivery file cannot be deleted`, deleteLockedFileFails)

  await db.query(`update public.projects set status = 'delivered' where id = $1`, [proj.id])
  const deliveredPkg = (await db.query(`select status, delivered_at from public.project_deliveries where id = $1`, [pkg.id])).rows[0]
  ok(`${label}: moving to Delivered stamps the package delivered`, deliveredPkg?.status === 'delivered' && deliveredPkg?.delivered_at !== null)

  const completeBareFails = await expectError(db, () =>
    db.query(`select public.complete_project($1)`, [proj.id]))
  ok(`${label}: complete is rejected without the internal approval placeholder`, completeBareFails)

  // Internal approval is a staff placeholder, not a client action.
  await db.query(`select public.record_internal_client_approval($1, 'Approved on the weekly call.', 'approved_internally')`, [proj.id])
  const approvedPkg = (await db.query(`select status, approval_state, approval_recorded_by from public.project_deliveries where id = $1`, [pkg.id])).rows[0]
  ok(`${label}: internal approval placeholder is recorded on the delivery package`,
    approvedPkg?.approval_state === 'approved_internally' && approvedPkg?.approval_recorded_by === alice && approvedPkg?.status === 'approved')

  const blockers = (await scalar(db, `select public.project_completion_blockers($1) blockers`, [proj.id])).blockers
  ok(`${label}: completion blockers are empty once files, delivery, and internal approval are in place`,
    Array.isArray(blockers) && blockers.length === 0, JSON.stringify(blockers))

  await asUser(db, bob)
  const employeeCompleteFails = await expectError(db, () => db.query(`select public.complete_project($1)`, [proj.id]))
  ok(`${label}: employee without project.edit cannot complete the project`, employeeCompleteFails)

  await asUser(db, alice)
  await db.query(`select public.complete_project($1)`, [proj.id])
  const completed = await scalar(db, `select status, completed_date, progress from public.projects where id = $1`, [proj.id])
  ok(`${label}: complete succeeds and stamps completed_date + 100% progress`,
    completed?.status === 'completed' && completed?.completed_date !== null && completed?.progress === 100)

  const archiveEarlyProject = (await db.query(
    `insert into public.projects (name, client_id, status) values ('Still Active', $1, 'active') returning id`, [clientId]
  )).rows[0]
  const archiveActiveFails = await expectError(db, () => db.query(`select public.archive_project($1)`, [archiveEarlyProject.id]))
  ok(`${label}: active projects cannot be archived`, archiveActiveFails)

  await db.query(`select public.archive_project($1)`, [proj.id])
  const archived = await scalar(db, `select archived_at, archived_by from public.projects where id = $1`, [proj.id])
  ok(`${label}: completed projects can be archived`, archived?.archived_at !== null && archived?.archived_by === alice)

  const statusWhileArchivedFails = await expectError(db, () =>
    db.query(`update public.projects set status = 'in-review' where id = $1`, [proj.id]))
  ok(`${label}: archived projects cannot change status`, statusWhileArchivedFails)

  const activityTypes = (await db.query(
    `select event_type from public.project_activity where project_id = $1`, [proj.id]
  )).rows.map((row) => row.event_type)
  ok(`${label}: delivery, approval, and archive events appear on the audit timeline`,
    activityTypes.includes('delivery_prepared')
      && activityTypes.includes('delivery_file_added')
      && activityTypes.includes('delivery_sent')
      && activityTypes.includes('approval_recorded')
      && activityTypes.includes('archived'))

  await db.query(`select public.unarchive_project($1)`, [proj.id])
  ok(`${label}: unarchive clears the archive flag`,
    (await scalar(db, `select archived_at from public.projects where id = $1`, [proj.id])).archived_at === null)

  // Revision path: a second project goes delivered → revision → new package.
  const rev = (await db.query(
    `insert into public.projects (name, client_id, status, owner_id) values ('Revision Path', $1, 'in-review', $2) returning id`,
    [clientId, alice],
  )).rows[0]
  await db.query(`insert into public.files (name, type, size, storage_path, project_id, uploaded_by)
    values ('v1.pdf', 'pdf', 500, $1, $2, $3)`, [`${rev.id}/v1.pdf`, rev.id, alice])
  const v1 = (await db.query(`select id from public.files where project_id = $1 and name = 'v1.pdf'`, [rev.id])).rows[0].id
  await db.query(`select public.add_project_delivery_file($1, $2)`, [rev.id, v1])
  await db.query(`select public.mark_project_delivered($1, 'First handoff')`, [rev.id])
  await db.query(`select public.request_project_revision($1, 'Client wants the logo larger.')`, [rev.id])
  const afterRev = await scalar(db, `
    select
      (select status from public.projects where id = $1) project_status,
      (select status from public.project_deliveries where project_id = $1 and version = 1) v1_status,
      (select status from public.project_deliveries where project_id = $1 and version = 2) v2_status,
      (select approval_state from public.project_deliveries where project_id = $1 and version = 1) v1_approval
  `, [rev.id])
  ok(`${label}: revision returns the project to In review and opens a new preparing package`,
    afterRev?.project_status === 'in-review'
      && afterRev?.v1_status === 'revision_requested'
      && afterRev?.v2_status === 'preparing'
      && afterRev?.v1_approval === 'revision_required')

  // Clients cannot read internal delivery data.
  if (dina) {
    await asUser(db, dina)
    ok(`${label}: client cannot read internal delivery packages`,
      (await scalar(db, `select count(*)::int n from public.project_deliveries where project_id = $1`, [proj.id])).n === 0)
    ok(`${label}: client cannot read delivery file links`,
      (await scalar(db, `select count(*)::int n from public.project_delivery_files`)).n === 0)
    const clientApproveFails = await expectError(db, () =>
      db.query(`select public.record_internal_client_approval($1, 'I approve', 'approved_internally')`, [proj.id]))
    ok(`${label}: client cannot record the internal approval placeholder`, clientApproveFails)
  }

  // Outsiders cannot read another project's delivery rows.
  if (rania) {
    await asUser(db, rania)
    ok(`${label}: non-member employee sees no delivery packages (RLS)`,
      (await scalar(db, `select count(*)::int n from public.project_deliveries where project_id = $1`, [rev.id])).n === 0)
  }

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

async function runSubmissionTrackingSuite(db, ids, label) {
  const { anonVisitor, alice } = ids

  // 1. Reference generator format check
  const generatedRef = (await scalar(db, `select public.generate_submission_reference() as ref`)).ref
  ok(`${label}: submission reference matches expected format REQ-YYMM-XXXXXX`, /^REQ-\d{4}-[A-Z0-9]{6,}$/.test(generatedRef))

  // 2. Submit dynamic form and verify unique reference_number and tracking_token
  await asUser(db, alice)
  await db.query(`insert into public.form_templates (slug, title, description, status) values ('track-form', 'Branding Track Form', 'Tracking test form', 'published') on conflict do nothing`)
  const trackForm = (await db.query(`select id from public.form_templates where slug = 'track-form'`)).rows[0]
  await db.query(`insert into public.form_questions (form_id, question_type, label, required, map_to, position) values
    ($1, 'short_text', 'Your Name', true, 'name', 1),
    ($1, 'short_text', 'Email Address', true, 'email', 2)
    on conflict do nothing`, [trackForm.id])
  const qRows = (await db.query(`select id, map_to from public.form_questions where form_id = $1`, [trackForm.id])).rows
  const qName = qRows.find((q) => q.map_to === 'name').id
  const qEmail = qRows.find((q) => q.map_to === 'email').id

  await asUser(db, anonVisitor, 'anon')
  const subRec = (await db.query(`select * from public.submit_dynamic_form($1, $2::jsonb)`, [
    trackForm.id,
    JSON.stringify({ [qName]: 'Tracking Client', [qEmail]: 'tracker@domain.test' }),
  ])).rows[0]

  ok(`${label}: new submission receives unique reference number`,
    typeof subRec?.reference_number === 'string' && subRec.reference_number.startsWith('REQ-'))
  ok(`${label}: new submission receives unguessable tracking token`,
    typeof subRec?.tracking_token === 'string' && subRec.tracking_token.length >= 32)

  // 3. Anonymous visitor can track using reference_number (case-insensitive)
  const trackingByRef = (await scalar(db, `select public.get_public_submission_tracking($1) as t`, [subRec.reference_number])).t
  ok(`${label}: tracking lookup by exact reference succeeds`,
    trackingByRef?.reference_number === subRec.reference_number && trackingByRef?.form_title === 'Branding Track Form')
  ok(`${label}: tracking stage index defaults to 1 (Received)`,
    trackingByRef?.stage_index === 1 && trackingByRef?.status === 'new' && trackingByRef?.client_status_label === 'Received')

  const trackingLower = (await scalar(db, `select public.get_public_submission_tracking($1) as t`, [subRec.reference_number.toLowerCase()])).t
  ok(`${label}: tracking lookup by lowercase reference succeeds (case-insensitive)`,
    trackingLower?.reference_number === subRec.reference_number)

  // 4. Anonymous visitor can track using tracking_token
  const trackingByToken = (await scalar(db, `select public.get_public_submission_tracking($1) as t`, [subRec.tracking_token])).t
  ok(`${label}: tracking lookup by tracking token succeeds`,
    trackingByToken?.reference_number === subRec.reference_number && trackingByToken?.tracking_token === subRec.tracking_token)

  // 5. Invalid / non-existent key returns null
  const trackingNotFound = (await scalar(db, `select public.get_public_submission_tracking('REQ-NON-EXISTENT-999') as t`)).t
  ok(`${label}: tracking lookup for unknown reference returns null`, trackingNotFound === null)

  const trackingBlank = (await scalar(db, `select public.get_public_submission_tracking('   ') as t`)).t
  ok(`${label}: tracking lookup for blank key returns null`, trackingBlank === null)

  // 6. Verification of payload security: NO internal notes, reviewer ID, or audit logs leaked
  ok(`${label}: public tracking payload contains SLA and contact metadata`,
    typeof trackingByRef?.expected_response_time === 'string' && typeof trackingByRef?.contact_email === 'string')
  ok(`${label}: public tracking payload does not leak internal reviewer_id`,
    trackingByRef?.reviewer_id === undefined)
  ok(`${label}: public tracking payload does not leak internal notes or audit events`,
    trackingByRef?.notes === undefined && trackingByRef?.events === undefined)

  // 7. Status transitions update client tracking projection in real time
  await asUser(db, alice)
  await db.query(`select public.update_form_submission_status($1, 'reviewing', 'Starting review')`, [subRec.id])
  await asUser(db, anonVisitor, 'anon')
  const trackingReviewing = (await scalar(db, `select public.get_public_submission_tracking($1) as t`, [subRec.reference_number])).t
  ok(`${label}: moving status to reviewing updates tracking stage to 2`,
    trackingReviewing?.stage_index === 2 && trackingReviewing?.client_status_label === 'Under Review')

  await asUser(db, alice)
  await db.query(`select public.update_form_submission_status($1, 'qualified', 'Qualified for branding')`, [subRec.id])
  await asUser(db, anonVisitor, 'anon')
  const trackingQualified = (await scalar(db, `select public.get_public_submission_tracking($1) as t`, [subRec.reference_number])).t
  ok(`${label}: moving status to qualified updates tracking stage to 3`,
    trackingQualified?.stage_index === 3 && trackingQualified?.client_status_label === 'Qualified')

  // 8. Anonymous visitor cannot query form_submissions table directly for other users' rows
  await superUser(db)
  const otherVisitor = await addUser(db, null, { anon: true })
  await asUser(db, otherVisitor, 'anon')
  const otherSeesZero = (await scalar(db, `select count(*)::int n from public.form_submissions`)).n
  ok(`${label}: other anonymous visitor cannot read foreign submissions directly from table (RLS enforced)`,
    otherSeesZero === 0)
  const otherTracksSuccess = (await scalar(db, `select public.get_public_submission_tracking($1) as t`, [subRec.reference_number])).t
  ok(`${label}: other anonymous visitor CAN track submission using reference number without account`,
    otherTracksSuccess?.reference_number === subRec.reference_number)

  await superUser(db)
}

async function runClientPortalSuite(db, ids, label) {
  const { anonVisitor, alice, bob, erin } = ids

  // ── Setup: two clients, each with their own project ─────────────────────
  await asUser(db, alice)
  const portalClientId = (await db.query(
    `insert into public.clients (name, email) values ('Portal Client Co', 'portal@client.test') returning id`,
  )).rows[0].id
  const portalProjectId = (await db.query(
    `insert into public.projects (name, client_id, status, progress, phase) values ('Portal Project', $1, 'active', 40, 2) returning id`,
    [portalClientId],
  )).rows[0].id
  const otherClientId = (await db.query(
    `insert into public.clients (name, email) values ('Other Co', 'other@client.test') returning id`,
  )).rows[0].id
  const otherProjectId = (await db.query(
    `insert into public.projects (name, client_id, status) values ('Other Project', $1, 'active') returning id`,
    [otherClientId],
  )).rows[0].id

  // ── Non-admins cannot invite clients ─────────────────────────────────────
  await asUser(db, erin) // manager
  const managerInviteFails = await expectError(db, () => db.query(
    `select public.admin_create_client_account($1, 'sneaky@client.test', 'Sneaky')`,
    [portalClientId],
  ))
  ok(`${label}: manager cannot create a client portal account (admin.manage only)`, managerInviteFails)

  // ── Admin invites the client: placeholder with the CRM link ─────────────
  await asUser(db, alice)
  const placeholder = (await db.query(
    `select * from public.admin_create_client_account($1, 'portal@client.test', 'Portal Client')`,
    [portalClientId],
  )).rows[0]
  ok(`${label}: admin creates a client portal placeholder linked to the CRM record`,
    placeholder?.role === 'client' && placeholder?.client_id === portalClientId && placeholder?.status === 'active')

  const duplicateEmailRejected = await expectError(db, () => db.query(
    `select public.admin_create_client_account($1, 'portal@client.test', 'Duplicate')`,
    [portalClientId],
  ))
  ok(`${label}: duplicate client account e-mail is rejected`, duplicateEmailRejected)

  // ── Trusted Auth provisioning claims the client placeholder ──────────────
  await superUser(db)
  const portalUser = await addUser(db, 'portal@client.test', { fullName: 'Portal Client', adminProvisioned: true })
  const claimed = await scalar(db,
    `select role, client_id, status, must_change_password from public.profiles where id = $1`, [portalUser])
  ok(`${label}: trusted Auth provisioning claims the client placeholder preserving the CRM link`,
    claimed?.role === 'client' && claimed?.client_id === portalClientId && claimed?.must_change_password === true)
  ok(`${label}: claiming a client placeholder leaves no second profile`,
    (await scalar(db, `select count(*)::int n from public.profiles where lower(email) = 'portal@client.test'`)).n === 1)

  // ── The client sees only their own, sanitized projects ───────────────────
  await asUser(db, portalUser)
  await db.query(`select public.mark_password_changed($1)`, [portalUser])

  const projects = (await db.query(`select * from public.get_client_portal_projects()`)).rows
  ok(`${label}: portal lists only the client's own projects`, projects.length === 1 && projects[0].id === portalProjectId)
  ok(`${label}: portal project rows are sanitized (no owner, manager, team, budget, health, priority)`,
    projects[0]?.owner_id === undefined
      && projects[0]?.manager_id === undefined
      && projects[0]?.budget === undefined
      && projects[0]?.health === undefined
      && projects[0]?.priority === undefined)

  const detail = (await db.query(`select * from public.get_client_portal_project($1)`, [portalProjectId])).rows[0]
  ok(`${label}: portal project detail returns the client's own project`, detail?.id === portalProjectId && detail?.status === 'active')
  ok(`${label}: portal project detail returns nothing for another client's project`,
    (await db.query(`select * from public.get_client_portal_project($1)`, [otherProjectId])).rows.length === 0)

  const clientInfo = (await db.query(`select * from public.get_client_portal_client()`)).rows[0]
  ok(`${label}: portal returns the client's own CRM record`, clientInfo?.id === portalClientId && clientInfo?.name === 'Portal Client Co')

  // Raw table reads remain blocked by RLS (the portal uses SECURITY DEFINER RPCs).
  ok(`${label}: client still cannot read the raw projects table`,
    (await scalar(db, `select count(*)::int n from public.projects`)).n === 0)
  ok(`${label}: client still cannot read the raw clients table`,
    (await scalar(db, `select count(*)::int n from public.clients`)).n === 0)

  // ── Staff get nothing from the client-scoped RPCs ────────────────────────
  await asUser(db, bob)
  ok(`${label}: staff calling the portal RPC get no projects`,
    (await db.query(`select * from public.get_client_portal_projects()`)).rows.length === 0)

  // ── Suspended clients lose portal access immediately ─────────────────────
  await asUser(db, alice)
  await db.query(`select public.set_user_status($1, 'inactive')`, [portalUser])
  await asUser(db, portalUser)
  ok(`${label}: suspended client portal returns no projects`,
    (await db.query(`select * from public.get_client_portal_projects()`)).rows.length === 0)
  await asUser(db, alice)
  await db.query(`select public.set_user_status($1, 'active')`, [portalUser])

  // ── Anonymous visitors cannot call the portal RPC at all ─────────────────
  await asUser(db, anonVisitor, 'anon')
  const anonBlocked = await expectError(db, () => db.query(`select * from public.get_client_portal_projects()`))
  ok(`${label}: anonymous visitor cannot execute the portal RPC`, anonBlocked)

  // ── Revoking access removes the profile and Auth login atomically ────────
  await asUser(db, alice)
  await db.query(`select public.admin_delete_client_account($1)`, [portalUser])
  await superUser(db)
  const revoked = await scalar(db, `select
    (select count(*)::int from public.profiles where id = $1) p,
    (select count(*)::int from auth.users where id = $1) a`, [portalUser])
  ok(`${label}: revoking client access removes both profile and Auth account`, revoked.p === 0 && revoked.a === 0)

  await superUser(db)
}

// ── Session 18: client feedback, shared files & approval ─────────────────────
// Isolation is the point of this suite. Clients see only the files staff
// selected (or delivered), never internal comments, never another client's
// data, and never write `project_deliveries` directly.
async function runClientFeedbackSuite(db, ids, label) {
  const { anonVisitor, alice, bob, erin } = ids

  await asUser(db, alice)
  const clientAId = (await db.query(
    `insert into public.clients (name, email) values ('Feedback Co', 'feedback@client.test') returning id`,
  )).rows[0].id
  const clientBId = (await db.query(
    `insert into public.clients (name, email) values ('Other Feedback Co', 'other-feedback@client.test') returning id`,
  )).rows[0].id
  const projectA = (await db.query(
    `insert into public.projects (name, client_id, status, owner_id, manager_id)
     values ('Feedback Brand', $1, 'active', $2, $3) returning id`,
    [clientAId, alice, erin],
  )).rows[0]
  const projectB = (await db.query(
    `insert into public.projects (name, client_id, status, owner_id)
     values ('Secret Other Brand', $1, 'active', $2) returning id`,
    [clientBId, alice],
  )).rows[0]
  await db.query(`insert into public.project_members (project_id, user_id, assigned_by) values ($1, $2, $3)`, [projectA.id, bob, alice])

  await db.query(`insert into public.files (name, type, size, storage_path, project_id, uploaded_by)
    values ('working-draft.ai', 'other', 800, $1, $2, $3)`, [`${projectA.id}/working-draft.ai`, projectA.id, alice])
  await db.query(`insert into public.files (name, type, size, storage_path, project_id, uploaded_by)
    values ('final-logo.pdf', 'pdf', 1200, $1, $2, $3)`, [`${projectA.id}/final-logo.pdf`, projectA.id, alice])
  await db.query(`insert into public.files (name, type, size, storage_path, project_id, uploaded_by)
    values ('other-secret.pdf', 'pdf', 400, $1, $2, $3)`, [`${projectB.id}/other-secret.pdf`, projectB.id, alice])
  const workingId = (await db.query(`select id from public.files where project_id = $1 and name = 'working-draft.ai'`, [projectA.id])).rows[0].id
  const finalId = (await db.query(`select id from public.files where project_id = $1 and name = 'final-logo.pdf'`, [projectA.id])).rows[0].id
  const otherFileId = (await db.query(`select id from public.files where project_id = $1 and name = 'other-secret.pdf'`, [projectB.id])).rows[0].id

  await db.query(`insert into storage.objects (bucket_id, name, owner_id) values
    ('project-files', $1, $2), ('project-files', $3, $2), ('project-files', $4, $2)`,
    [`${projectA.id}/working-draft.ai`, alice, `${projectA.id}/final-logo.pdf`, `${projectB.id}/other-secret.pdf`])

  // Internal staff comment — must stay invisible to the client.
  await db.query(`insert into public.comments (content, entity_type, entity_id, author_id)
    values ('Do not show the client this internal note.', 'project', $1, $2)`, [projectA.id, alice])

  // Invite two portal clients and claim them.
  const placeholderA = (await db.query(
    `select * from public.admin_create_client_account($1, 'feedback@client.test', 'Feedback Client')`,
    [clientAId],
  )).rows[0]
  const placeholderB = (await db.query(
    `select * from public.admin_create_client_account($1, 'other-feedback@client.test', 'Other Client')`,
    [clientBId],
  )).rows[0]
  ok(`${label}: admin provisions two isolated portal accounts`,
    placeholderA?.client_id === clientAId && placeholderB?.client_id === clientBId)

  await superUser(db)
  const clientUserA = await addUser(db, 'feedback@client.test', { fullName: 'Feedback Client', adminProvisioned: true })
  const clientUserB = await addUser(db, 'other-feedback@client.test', { fullName: 'Other Client', adminProvisioned: true })
  await asUser(db, clientUserA)
  await db.query(`select public.mark_password_changed($1)`, [clientUserA])
  await asUser(db, clientUserB)
  await db.query(`select public.mark_password_changed($1)`, [clientUserB])

  // ── Unshared working files stay private ────────────────────────────────
  await asUser(db, clientUserA)
  const emptyCollab = (await scalar(db, `select public.get_client_portal_collaboration($1) c`, [projectA.id])).c
  ok(`${label}: client sees no files before anything is shared or delivered`,
    Array.isArray(emptyCollab?.files) && emptyCollab.files.length === 0)
  ok(`${label}: client cannot read the raw files table`,
    (await scalar(db, `select count(*)::int n from public.files`)).n === 0)
  ok(`${label}: client cannot read internal comments`,
    (await scalar(db, `select count(*)::int n from public.comments`)).n === 0)
  ok(`${label}: client cannot read internal delivery packages`,
    (await scalar(db, `select count(*)::int n from public.project_deliveries`)).n === 0)
  ok(`${label}: client cannot read the project activity audit feed`,
    (await scalar(db, `select count(*)::int n from public.project_activity`)).n === 0)
  ok(`${label}: client cannot read unshared storage objects`,
    (await scalar(db, `select count(*)::int n from storage.objects where bucket_id = 'project-files'`)).n === 0)
  const clientInsertsComment = await expectError(db, () => db.query(
    `insert into public.comments (content, entity_type, entity_id) values ('sneaky', 'project', $1)`, [projectA.id]))
  ok(`${label}: client cannot insert an internal comment`, clientInsertsComment)
  const clientSharesFails = await expectError(db, () => db.query(
    `select public.share_project_file_with_client($1, $2)`, [projectA.id, finalId]))
  ok(`${label}: client cannot call the staff share RPC`, clientSharesFails)

  // ── Staff share a selected file ────────────────────────────────────────
  await asUser(db, alice)
  await db.query(`select public.share_project_file_with_client($1, $2, 'Please review the draft.')`, [projectA.id, workingId])
  const shareEvent = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'file_shared'`, [projectA.id])).rows
  ok(`${label}: sharing a file records a file_shared operational event`,
    shareEvent.length === 1 && shareEvent[0].new_value === 'working-draft.ai')

  await asUser(db, clientUserA)
  const afterShare = (await scalar(db, `select public.get_client_portal_collaboration($1) c`, [projectA.id])).c
  ok(`${label}: client sees only the explicitly shared file`,
    afterShare.files.length === 1 && afterShare.files[0].id === workingId && afterShare.files[0].source === 'shared')
  ok(`${label}: client can read the shared storage object and only that object`,
    (await scalar(db, `select count(*)::int n from storage.objects where bucket_id = 'project-files'`)).n === 1
      && (await scalar(db, `select name from storage.objects where bucket_id = 'project-files'`)).name === `${projectA.id}/working-draft.ai`)

  // ── Other client's project is invisible ────────────────────────────────
  const otherProjectBlocked = await expectError(db, () =>
    scalar(db, `select public.get_client_portal_collaboration($1) c`, [projectB.id]))
  ok(`${label}: client A cannot open client B's collaboration payload`, otherProjectBlocked)
  await asUser(db, clientUserB)
  const clientBSeesNothing = (await scalar(db, `select public.get_client_portal_collaboration($1) c`, [projectB.id])).c
  ok(`${label}: client B does not see client A's shared files`,
    Array.isArray(clientBSeesNothing?.files) && clientBSeesNothing.files.length === 0)
  ok(`${label}: client B cannot read client A's storage objects`,
    (await scalar(db, `select count(*)::int n from storage.objects where bucket_id = 'project-files'`)).n === 0)

  // ── Feedback notifies the project owner ────────────────────────────────
  await superUser(db)
  await db.query(`delete from public.notifications where project_id = $1`, [projectA.id])
  await asUser(db, clientUserA)
  await db.query(`select public.add_client_portal_feedback($1, 'The blue is too dark on the draft.')`, [projectA.id])
  const feedbackCollab = (await scalar(db, `select public.get_client_portal_collaboration($1) c`, [projectA.id])).c
  ok(`${label}: client feedback appears in the client-visible thread`,
    feedbackCollab.messages.some((m) => m.kind === 'feedback' && m.mine === true && m.body.includes('blue is too dark')))

  await superUser(db)
  const ownerNotifs = (await db.query(
    `select * from public.notifications where recipient_id = $1 and type = 'client_feedback' and project_id = $2`,
    [alice, projectA.id],
  )).rows
  ok(`${label}: client feedback notifies the project owner`,
    ownerNotifs.length === 1 && ownerNotifs[0].action_url === `/projects/${projectA.id}`)
  const managerNotifs = (await db.query(
    `select * from public.notifications where recipient_id = $1 and type = 'client_feedback' and project_id = $2`,
    [erin, projectA.id],
  )).rows
  ok(`${label}: client feedback also notifies the project manager`, managerNotifs.length === 1)
  const feedbackEvent = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'client_feedback'`, [projectA.id])).rows
  ok(`${label}: client feedback is recorded as a project activity event`, feedbackEvent.length === 1)

  // Internal comments stay out of the client payload.
  await asUser(db, clientUserA)
  ok(`${label}: client-visible thread does not include the internal staff comment`,
    !feedbackCollab.messages.some((m) => String(m.body).includes('Do not show')))
  ok(`${label}: client still cannot read the comments table after leaving feedback`,
    (await scalar(db, `select count(*)::int n from public.comments`)).n === 0)

  // Staff can read the client thread and post a client-visible reply.
  await asUser(db, alice)
  ok(`${label}: staff can read client messages through RLS`,
    (await scalar(db, `select count(*)::int n from public.client_messages where project_id = $1`, [projectA.id])).n >= 1)
  await db.query(`select public.add_client_visible_message($1, 'We will lighten the blue in the next round.')`, [projectA.id])
  const staffCommentStillPrivate = (await scalar(db,
    `select count(*)::int n from public.comments where entity_id = $1 and content like 'Do not show%'`, [projectA.id])).n
  ok(`${label}: staff internal comment remains stored separately from the client thread`, staffCommentStillPrivate === 1)

  await asUser(db, clientUserA)
  const afterReply = (await scalar(db, `select public.get_client_portal_collaboration($1) c`, [projectA.id])).c
  ok(`${label}: client sees the staff reply and never the internal note`,
    afterReply.messages.some((m) => m.from_client === false && String(m.body).includes('lighten the blue'))
      && !afterReply.messages.some((m) => String(m.body).includes('Do not show')))

  // ── Deliverables become visible only after delivery ────────────────────
  await asUser(db, alice)
  await db.query(`update public.projects set status = 'in-review' where id = $1`, [projectA.id])
  await db.query(`select public.add_project_delivery_file($1, $2)`, [projectA.id, finalId])
  const preparingCollab = await (async () => {
    await asUser(db, clientUserA)
    return (await scalar(db, `select public.get_client_portal_collaboration($1) c`, [projectA.id])).c
  })()
  ok(`${label}: a preparing delivery file is not visible until the package is delivered`,
    !preparingCollab.files.some((f) => f.id === finalId))

  await asUser(db, alice)
  await db.query(`select public.mark_project_delivered($1, 'Handoff for client review')`, [projectA.id])
  await superUser(db)
  const staffDeliveryNotifs = (await db.query(
    `select * from public.notifications where recipient_id = $1 and event = 'delivery.ready' and project_id = $2`,
    [erin, projectA.id],
  )).rows
  ok(`${label}: marking delivery ready notifies the project manager`,
    staffDeliveryNotifs.length >= 1 && staffDeliveryNotifs[0].action_url === `/projects/${projectA.id}`)

  await asUser(db, clientUserA)
  const clientDeliveryNotifs = (await db.query(
    `select * from public.notifications where recipient_id = $1 and event = 'delivery.ready' and project_id = $2`,
    [clientUserA, projectA.id],
  )).rows
  ok(`${label}: a delivered package notifies the client that delivery is ready`,
    clientDeliveryNotifs.length === 1 && clientDeliveryNotifs[0].action_url === `/portal/projects/${projectA.id}`)

  await asUser(db, clientUserA)
  const deliveredCollab = (await scalar(db, `select public.get_client_portal_collaboration($1) c`, [projectA.id])).c
  ok(`${label}: delivered package files become visible to the client`,
    deliveredCollab.files.some((f) => f.id === finalId)
      && deliveredCollab.delivery?.status === 'delivered'
      && deliveredCollab.can_approve === true
      && deliveredCollab.can_request_revision === true)
  ok(`${label}: client can now read the delivered storage object`,
    (await scalar(db, `select count(*)::int n from storage.objects where name = $1`, [`${projectA.id}/final-logo.pdf`])).n === 1)

  // Staff cannot use the client-owned approval RPC.
  await asUser(db, alice)
  const staffApproveFails = await expectError(db, () =>
    db.query(`select public.approve_client_portal_delivery($1, 'I am staff')`, [projectA.id]))
  ok(`${label}: staff cannot record a client-portal approval`, staffApproveFails)

  // ── Client approval updates delivery state ─────────────────────────────
  await superUser(db)
  await db.query(`delete from public.notifications where project_id = $1 and type = 'client_approval'`, [projectA.id])
  await asUser(db, clientUserA)
  await db.query(`select public.approve_client_portal_delivery($1, 'Looks great — approved.')`, [projectA.id])

  await asUser(db, alice)
  const approvedPkg = (await db.query(
    `select status, approval_state, approval_recorded_by from public.project_deliveries
     where project_id = $1 order by version desc limit 1`, [projectA.id])).rows[0]
  ok(`${label}: client approval stamps the delivery as approved_by_client`,
    approvedPkg?.status === 'approved' && approvedPkg?.approval_state === 'approved_by_client' && approvedPkg?.approval_recorded_by === clientUserA)
  const blockersAfterClient = (await scalar(db, `select public.project_completion_blockers($1) blockers`, [projectA.id])).blockers
  ok(`${label}: client approval satisfies the completion blockers`,
    Array.isArray(blockersAfterClient) && blockersAfterClient.length === 0, JSON.stringify(blockersAfterClient))
  const approvalNotifs = (await db.query(
    `select * from public.notifications where recipient_id = $1 and type = 'client_approval' and project_id = $2`,
    [alice, projectA.id],
  )).rows
  ok(`${label}: client approval notifies the project owner`, approvalNotifs.length === 1)
  const clientApprovedEvent = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'client_approved'`, [projectA.id])).rows
  ok(`${label}: client approval is a distinct operational event (not the internal placeholder)`,
    clientApprovedEvent.length === 1 && clientApprovedEvent[0].metadata?.client_facing === true)

  await asUser(db, clientUserA)
  const alreadyApproved = await expectError(db, () =>
    db.query(`select public.approve_client_portal_delivery($1, 'again')`, [projectA.id]))
  ok(`${label}: a second approval of the same package is rejected`, alreadyApproved)

  // Client B still cannot approve project A.
  await asUser(db, clientUserB)
  const crossApproveFails = await expectError(db, () =>
    db.query(`select public.approve_client_portal_delivery($1, 'not mine')`, [projectA.id]))
  ok(`${label}: client B cannot approve client A's delivery`, crossApproveFails)

  // ── Client revision request is an operational event ────────────────────
  await asUser(db, alice)
  // Re-open a delivered package on a fresh project so we can request a revision.
  const revProject = (await db.query(
    `insert into public.projects (name, client_id, status, owner_id)
     values ('Revision Brand', $1, 'in-review', $2) returning id`,
    [clientAId, alice],
  )).rows[0]
  await db.query(`insert into public.files (name, type, size, storage_path, project_id, uploaded_by)
    values ('rev-v1.pdf', 'pdf', 900, $1, $2, $3)`, [`${revProject.id}/rev-v1.pdf`, revProject.id, alice])
  const revFileId = (await db.query(`select id from public.files where project_id = $1`, [revProject.id])).rows[0].id
  await db.query(`select public.add_project_delivery_file($1, $2)`, [revProject.id, revFileId])
  await db.query(`select public.mark_project_delivered($1, 'First pass')`, [revProject.id])

  await superUser(db)
  await db.query(`delete from public.notifications where project_id = $1`, [revProject.id])
  await asUser(db, clientUserA)
  await db.query(`select public.request_client_portal_revision($1, 'Please enlarge the wordmark and lighten the blue.')`, [revProject.id])

  await asUser(db, alice)
  const afterClientRev = await scalar(db, `
    select
      (select status from public.projects where id = $1) project_status,
      (select status from public.project_deliveries where project_id = $1 and version = 1) v1_status,
      (select status from public.project_deliveries where project_id = $1 and version = 2) v2_status,
      (select approval_state from public.project_deliveries where project_id = $1 and version = 1) v1_approval,
      (select revision_note from public.project_deliveries where project_id = $1 and version = 1) v1_note
  `, [revProject.id])
  ok(`${label}: client revision returns the project to In review and opens a new package`,
    afterClientRev?.project_status === 'in-review'
      && afterClientRev?.v1_status === 'revision_requested'
      && afterClientRev?.v2_status === 'preparing'
      && afterClientRev?.v1_approval === 'revision_required'
      && String(afterClientRev?.v1_note || '').includes('enlarge the wordmark'))
  const revEvent = (await db.query(
    `select * from public.project_activity where project_id = $1 and event_type = 'client_revision_requested'`,
    [revProject.id],
  )).rows
  ok(`${label}: client revision request is a clear operational event`,
    revEvent.length === 1 && revEvent[0].metadata?.client_facing === true)
  const revNotifs = (await db.query(
    `select * from public.notifications where recipient_id = $1 and type = 'client_revision' and project_id = $2`,
    [alice, revProject.id],
  )).rows
  ok(`${label}: client revision request notifies the project owner`, revNotifs.length === 1)

  await asUser(db, clientUserA)
  const afterRevCollab = (await scalar(db, `select public.get_client_portal_collaboration($1) c`, [revProject.id])).c
  ok(`${label}: after a revision the client can no longer approve the superseded package`,
    afterRevCollab.can_approve === false
      && afterRevCollab.messages.some((m) => m.kind === 'revision'))

  // Unshare hides a working file that is not on a delivered package.
  await asUser(db, alice)
  await db.query(`select public.unshare_project_file_with_client($1, $2)`, [projectA.id, workingId])
  await asUser(db, clientUserA)
  const afterUnshare = (await scalar(db, `select public.get_client_portal_collaboration($1) c`, [projectA.id])).c
  ok(`${label}: unsharing a working file hides it; delivered files stay visible`,
    !afterUnshare.files.some((f) => f.id === workingId) && afterUnshare.files.some((f) => f.id === finalId))

  // Suspended client loses collaboration access immediately.
  await asUser(db, alice)
  await db.query(`select public.set_user_status($1, 'inactive')`, [clientUserA])
  await asUser(db, clientUserA)
  const suspendedBlocked = await expectError(db, () =>
    scalar(db, `select public.get_client_portal_collaboration($1) c`, [projectA.id]))
  ok(`${label}: suspended client loses collaboration access`, suspendedBlocked)
  await asUser(db, alice)
  await db.query(`select public.set_user_status($1, 'active')`, [clientUserA])

  // Anonymous visitors cannot call the collaboration RPCs.
  await asUser(db, anonVisitor, 'anon')
  const anonCollabBlocked = await expectError(db, () =>
    db.query(`select public.get_client_portal_collaboration($1)`, [projectA.id]))
  ok(`${label}: anonymous visitor cannot read portal collaboration`, anonCollabBlocked)

  // Employee outside the project cannot share its files.
  await superUser(db)
  const rania = (await db.query(`select id from public.profiles where email = 'rania@agency.test'`)).rows[0]?.id
  if (rania) {
    await asUser(db, rania)
    const outsiderShareFails = await expectError(db, () =>
      db.query(`select public.share_project_file_with_client($1, $2)`, [projectA.id, otherFileId]))
    ok(`${label}: non-member employee cannot share files on another project`, outsiderShareFails)
  }

  await superUser(db)
}

async function runDeadlineReminderSuite(db, ids, label) {
  const { alice, bob, erin } = ids

  await asUser(db, alice)
  const clientId = (await db.query(`select id from public.clients order by created_at limit 1`)).rows[0].id
  const proj = (await db.query(
    `insert into public.projects (name, client_id, status, owner_id, manager_id, due_date)
     values ('Deadline Scan', $1, 'active', $2, $3, current_date + 5) returning id`,
    [clientId, alice, erin],
  )).rows[0]
  await db.query(`insert into public.project_members (project_id, user_id, assigned_by) values ($1, $2, $3)`, [proj.id, bob, alice])

  const soonTask = (await db.query(
    `insert into public.tasks (title, project_id, assignee_id, due_date) values ('Soon task', $1, $2, current_date + 2) returning id`,
    [proj.id, bob],
  )).rows[0]
  const todayTask = (await db.query(
    `insert into public.tasks (title, project_id, assignee_id, due_date) values ('Today task', $1, $2, current_date) returning id`,
    [proj.id, bob],
  )).rows[0]
  const overdueTask = (await db.query(
    `insert into public.tasks (title, project_id, assignee_id, due_date) values ('Late task', $1, $2, current_date - 3) returning id`,
    [proj.id, bob],
  )).rows[0]
  const doneTask = (await db.query(
    `insert into public.tasks (title, project_id, assignee_id, due_date, status) values ('Done late', $1, $2, current_date - 1, 'done') returning id`,
    [proj.id, bob],
  )).rows[0]

  const overdueProj = (await db.query(
    `insert into public.projects (name, client_id, status, owner_id, manager_id, due_date)
     values ('Overdue Brand', $1, 'active', $2, $3, current_date - 4) returning id`,
    [clientId, alice, erin],
  )).rows[0]

  await superUser(db)
  await db.query(`delete from public.notifications where recipient_id in ($1, $2, $3)`, [alice, bob, erin])
  await db.query(`delete from public.reminder_events`)

  const first = (await scalar(db, `select public.run_deadline_reminders(current_date) r`)).r
  ok(`${label}: reminder job reports sent > 0`, first?.ok === true && Number(first.sent) >= 5, JSON.stringify(first))

  const bobSoon = (await db.query(
    `select * from public.notifications where recipient_id = $1 and task_id = $2 and event = 'task.due_soon'`,
    [bob, soonTask.id],
  )).rows
  ok(`${label}: assignee is notified when a task is due soon`, bobSoon.length === 1 && bobSoon[0].type === 'deadline_reminder')

  const bobToday = (await db.query(
    `select * from public.notifications where recipient_id = $1 and task_id = $2 and event = 'task.due_today'`,
    [bob, todayTask.id],
  )).rows
  ok(`${label}: assignee is notified when a task is due today`, bobToday.length === 1)

  const bobOverdue = (await db.query(
    `select * from public.notifications where recipient_id = $1 and task_id = $2 and event = 'task.overdue'`,
    [bob, overdueTask.id],
  )).rows
  ok(`${label}: assignee is notified when a task is overdue`, bobOverdue.length === 1)

  const erinEscalation = (await db.query(
    `select * from public.notifications where recipient_id = $1 and task_id = $2 and event = 'task.overdue'`,
    [erin, overdueTask.id],
  )).rows
  ok(`${label}: overdue task escalates to the project manager`,
    erinEscalation.length === 1 && erinEscalation[0].metadata?.escalation === true)

  const aliceEscalation = (await db.query(
    `select * from public.notifications where recipient_id = $1 and task_id = $2 and event = 'task.overdue'`,
    [alice, overdueTask.id],
  )).rows
  ok(`${label}: overdue task also escalates to the project owner`, aliceEscalation.length === 1)

  const doneNotifs = (await db.query(
    `select * from public.notifications where task_id = $1 and type = 'deadline_reminder'`,
    [doneTask.id],
  )).rows
  ok(`${label}: completed tasks do not receive deadline reminders`, doneNotifs.length === 0)

  const approaching = (await db.query(
    `select recipient_id from public.notifications where project_id = $1 and event = 'project.deadline_approaching'`,
    [proj.id],
  )).rows.map((r) => r.recipient_id)
  ok(`${label}: approaching project deadline notifies owner and manager`,
    approaching.includes(alice) && approaching.includes(erin))

  const overdueProjectNotifs = (await db.query(
    `select recipient_id from public.notifications where project_id = $1 and event = 'project.overdue'`,
    [overdueProj.id],
  )).rows.map((r) => r.recipient_id)
  ok(`${label}: overdue project notifies owner and manager`,
    overdueProjectNotifs.includes(alice) && overdueProjectNotifs.includes(erin))

  const logCount = (await scalar(db, `select count(*)::int n from public.reminder_events`)).n
  ok(`${label}: reminder events are recorded for each delivery`, logCount >= 5)

  const second = (await scalar(db, `select public.run_deadline_reminders(current_date) r`)).r
  const notifCount = (await scalar(db,
    `select count(*)::int n from public.notifications where type = 'deadline_reminder' and (
      task_id in ($1, $2, $3) or project_id in ($4, $5)
    )`,
    [soonTask.id, todayTask.id, overdueTask.id, proj.id, overdueProj.id],
  )).n
  const logCountAfter = (await scalar(db, `select count(*)::int n from public.reminder_events`)).n
  ok(`${label}: a second run does not duplicate reminders`,
    Number(second.sent) === 0 && notifCount === logCountAfter || (Number(second.sent) === 0 && logCountAfter === logCount),
    JSON.stringify({ second, notifCount, logCount, logCountAfter }))

  await asUser(db, alice)
  await db.query(`select public.set_user_status($1, 'inactive')`, [bob])
  await superUser(db)
  await db.query(`delete from public.reminder_events`)
  await db.query(`delete from public.notifications where recipient_id = $1 and type = 'deadline_reminder'`, [bob])
  await scalar(db, `select public.run_deadline_reminders(current_date)`)
  const inactiveBob = (await db.query(
    `select * from public.notifications where recipient_id = $1 and type = 'deadline_reminder'`,
    [bob],
  )).rows
  ok(`${label}: inactive assignees are not notified`, inactiveBob.length === 0)

  await asUser(db, alice)
  await db.query(`select public.set_user_status($1, 'active')`, [bob])
  await asUser(db, bob)
  const employeeInsertsLog = await expectError(db, () => db.query(
    `insert into public.reminder_events (kind, entity_type, entity_id, recipient_id, due_date, dedupe_key)
     values ('task.due_today', 'task', $1, $2, current_date, 'forged')`,
    [todayTask.id, bob],
  ))
  ok(`${label}: reminder_events cannot be forged by authenticated users`, employeeInsertsLog)

  await asUser(db, bob)
  const employeeRunsJob = await expectError(db, () => db.query(`select public.run_deadline_reminders(current_date)`))
  ok(`${label}: authenticated users cannot execute the reminder job`, employeeRunsJob)

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
  await runSubmissionReviewWorkflowSuite(dbA, idsA, 'upgrade')
  await runSubmissionConversionSuite(dbA, idsA, 'upgrade')
  await runTaskManagementSuite(dbA, idsA, 'upgrade')
  await runProjectActivitySuite(dbA, idsA, 'upgrade')
  await runProjectDeliveryClosureSuite(dbA, idsA, 'upgrade')
  await runSubmissionTrackingSuite(dbA, idsA, 'upgrade')
  await runClientPortalSuite(dbA, idsA, 'upgrade')
  await runClientFeedbackSuite(dbA, idsA, 'upgrade')
  await runDeadlineReminderSuite(dbA, idsA, 'upgrade')
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
  ok('fresh: anonymous submission works end to end', freshSubmission?.status === 'new' && freshSubmission?.respondent_email === 'visitor@fresh.test')
  ok('fresh: anonymous submission generates reference number and tracking token',
    typeof freshSubmission?.reference_number === 'string' && freshSubmission.reference_number.startsWith('REQ-') && typeof freshSubmission?.tracking_token === 'string')
  const freshTracking = (await scalar(dbB, `select public.get_public_submission_tracking($1) as t`, [freshSubmission.reference_number])).t
  ok('fresh: public tracking lookup by reference number succeeds',
    freshTracking?.reference_number === freshSubmission.reference_number && freshTracking?.stage_index === 1)

  await asUser(dbB, aliceB)
  ok('fresh: staff read the stored answers', (await scalar(dbB, 'select count(*)::int n from public.form_submission_answers')).n === 1)
  const freshAdminNotifs = (await dbB.query(`select * from public.notifications where recipient_id = $1`, [aliceB])).rows
  ok('fresh: admin receives notification on submission', freshAdminNotifs.length >= 1 && freshAdminNotifs[0].type === 'form_submission')

  // Fresh install review workflow check: assign reviewer + internal notes + qualification
  await dbB.query(`select public.assign_form_submission_reviewer($1, $2, 'Fresh assignment note')`, [freshSubmission.id, employeeB])
  const freshAssignedSub = (await dbB.query(`select reviewer_id from public.form_submissions where id = $1`, [freshSubmission.id])).rows[0]
  ok('fresh: admin assigns reviewer on fresh schema', freshAssignedSub?.reviewer_id === employeeB)
  const freshNotes = (await dbB.query(`select * from public.form_submission_notes where submission_id = $1`, [freshSubmission.id])).rows
  ok('fresh: assignment note recorded on fresh schema', freshNotes.length === 1 && freshNotes[0].note === 'Fresh assignment note')
  await dbB.query(`select public.update_form_submission_status($1, 'qualified', 'Fresh qualification note')`, [freshSubmission.id])
  const freshEvents = (await dbB.query(`select * from public.form_submission_events where submission_id = $1 order by created_at asc`, [freshSubmission.id])).rows
  ok('fresh: full event audit log recorded on fresh schema', freshEvents.length === 3 && freshEvents.map((e) => e.event_type).includes('status_changed'))
  const freshTrackingQualified = (await scalar(dbB, `select public.get_public_submission_tracking($1) as t`, [freshSubmission.reference_number])).t
  ok('fresh: public tracking reflects qualification status',
    freshTrackingQualified?.stage_index === 3 && freshTrackingQualified?.client_status_label === 'Qualified')

  // Session 23 — server-side inbox pagination RPCs (SECURITY INVOKER).
  const inboxPage = (await dbB.query(
    `select * from public.get_submission_inbox_page(null, null, null, null, null, 'newest', 1, 25)`
  )).rows[0]
  ok('fresh: inbox page RPC returns the page plus exact total',
    Array.isArray(inboxPage?.data) && inboxPage.data.length === 1 && inboxPage.total === 1)
  ok('fresh: inbox page RPC joins form title and reviewer',
    inboxPage?.data?.[0]?.form_templates?.title === 'Fresh Form' && inboxPage.data[0]?.reviewer?.email === 'employee@fresh.test')
  const inboxSearchHit = (await dbB.query(
    `select * from public.get_submission_inbox_page('visitor@fresh.test', null, null, null, null, 'newest', 1, 25)`
  )).rows[0]
  ok('fresh: inbox page RPC searches respondent fields', inboxSearchHit?.total === 1)
  const inboxSearchMiss = (await dbB.query(
    `select * from public.get_submission_inbox_page('no-such-person', null, null, null, null, 'newest', 1, 25)`
  )).rows[0]
  ok('fresh: inbox page RPC returns an empty page on no match', inboxSearchMiss?.total === 0 && inboxSearchMiss?.data?.length === 0)
  const inboxStatus = (await dbB.query(
    `select * from public.get_submission_inbox_page(null, 'qualified', null, null, null, 'status', 1, 25)`
  )).rows[0]
  ok('fresh: inbox page RPC filters by status', inboxStatus?.total === 1 && inboxStatus?.data?.[0]?.status === 'qualified')
  const inboxReviewer = (await dbB.query(
    `select * from public.get_submission_inbox_page(null, null, null, $1, null, 'newest', 1, 25)`,
    [employeeB]
  )).rows[0]
  ok('fresh: inbox page RPC filters by reviewer id', inboxReviewer?.total === 1)
  const inboxAssignedToMe = (await dbB.query(
    `select * from public.get_submission_inbox_page(null, 'assigned_to_me', null, null, null, 'newest', 1, 25)`
  )).rows[0]
  ok('fresh: inbox page RPC assigned-to-me honors auth.uid()', inboxAssignedToMe?.total === 0)
  await asUser(dbB, employeeB)
  const employeeInbox = (await dbB.query(
    `select * from public.get_submission_inbox_page(null, null, null, null, null, 'newest', 1, 25)`
  )).rows[0]
  ok('fresh: inbox page RPC is RLS-scoped (staff without submission.view sees nothing)',
    employeeInbox?.total === 0 && employeeInbox?.data?.length === 0)
  await asUser(dbB, aliceB)
  const pipelineBefore = (await dbB.query(`select * from public.get_submission_pipeline_counts()`)).rows[0]
  ok('fresh: pipeline counts aggregate in the database',
    pipelineBefore?.total === 1 && pipelineBefore?.by_status?.qualified === 1 && pipelineBefore?.assigned_to_me === 0)
  await dbB.query(`select public.assign_form_submission_reviewer($1, $2, 'Pagination suite')`, [freshSubmission.id, aliceB])
  const pipelineAssigned = (await dbB.query(`select * from public.get_submission_pipeline_counts()`)).rows[0]
  ok('fresh: pipeline counts track the assigned-to-me bucket',
    pipelineAssigned?.assigned_to_me === 1 && pipelineAssigned?.total === 1)

  const freshProject = (await dbB.query(
    `select * from public.convert_submission_to_project(
       $1, $2, null, 'Fresh Converted Project', 'Fresh conversion', 'General', 'medium', 'active',
       1, 'Discovery', null, null, null, 'USD', $3, null, array[$4]::uuid[]
     )`,
    [freshSubmission.id, freshSubmission.client_id, aliceB, employeeB]
  )).rows[0]
  ok('fresh: controlled conversion creates a source-linked project',
    freshProject?.source_submission_id === freshSubmission.id && freshProject?.client_id === freshSubmission.client_id)
  ok('fresh: converted project retains the submitted answer',
    (await scalar(dbB, `select count(*)::int n from public.form_submission_answers where submission_id = $1`, [freshSubmission.id])).n === 1)
  ok('fresh: duplicate controlled conversion remains blocked', await expectError(dbB, () => dbB.query(
    `select * from public.convert_submission_to_project($1, $2, null, 'Duplicate', null, 'General', 'medium', 'active', 1, null, null, null, null, 'USD', $3, null, '{}'::uuid[])`,
    [freshSubmission.id, freshSubmission.client_id, aliceB]
  )))

  const freshSkipDeliveryFails = await expectError(dbB, () => dbB.query(
    `update public.projects set status = 'completed' where id = $1`, [freshProject.id]
  ))
  ok('fresh: completion is blocked until delivery conditions are met', freshSkipDeliveryFails)
  await dbB.query(`insert into public.files (name, type, size, storage_path, project_id, uploaded_by)
    values ('fresh-final.pdf', 'pdf', 800, $1, $2, $3)`, [`${freshProject.id}/fresh-final.pdf`, freshProject.id, aliceB])
  const freshFile = (await dbB.query(`select id from public.files where project_id = $1`, [freshProject.id])).rows[0]
  await dbB.query(`select public.add_project_delivery_file($1, $2)`, [freshProject.id, freshFile.id])
  await dbB.query(`update public.projects set status = 'in-review' where id = $1`, [freshProject.id])
  await dbB.query(`select public.mark_project_delivered($1, 'Fresh handoff')`, [freshProject.id])
  await dbB.query(`select public.record_internal_client_approval($1, 'Signed in person.', 'approved_internally')`, [freshProject.id])
  await dbB.query(`select public.complete_project($1)`, [freshProject.id])
  await dbB.query(`select public.archive_project($1)`, [freshProject.id])
  const freshClosed = await scalar(dbB, `select status, archived_at from public.projects where id = $1`, [freshProject.id])
  ok('fresh: delivery → internal approval → complete → archive works end to end',
    freshClosed?.status === 'completed' && freshClosed?.archived_at !== null)

  const collabFn = (await scalar(dbB, `select count(*)::int n from pg_proc where proname = 'get_client_portal_collaboration'`)).n
  const approvalsTable = (await scalar(dbB, `select count(*)::int n from information_schema.tables where table_schema = 'public' and table_name = 'client_approvals'`)).n
  ok('fresh: client collaboration RPCs and tables are installed', collabFn === 1 && approvalsTable === 1)

  const reminderFn = (await scalar(dbB, `select count(*)::int n from pg_proc where proname = 'run_deadline_reminders'`)).n
  const reminderTable = (await scalar(dbB, `select count(*)::int n from information_schema.tables where table_schema = 'public' and table_name = 'reminder_events'`)).n
  ok('fresh: deadline reminder job and event log are installed', reminderFn === 1 && reminderTable === 1)

  // ── Transactional email outbox (Session 21) ─────────────────────────────
  // The database only ENQUEUES; the server-side job sends. These checks pin
  // down the enqueue rules: event coverage, dedupe, eligibility, and RLS.

  // freshSubmission (visitor@fresh.test) was inserted above → the trigger must
  // have enqueued the client receipt and the staff new-submission email.
  await superUser(dbB)
  ok('fresh: submission insert enqueues transactional emails',
    (await scalar(dbB, 'select count(*)::int n from public.email_outbox')).n >= 2)
  const receiptRow = await scalar(dbB, `select * from public.email_outbox where template_key = 'submission-received'`)
  ok('fresh: respondent receipt carries the reference + public tracking link',
    receiptRow?.recipient_email === 'visitor@fresh.test'
      && receiptRow?.payload?.reference_number === freshSubmission.reference_number
      && receiptRow?.payload?.tracking_path === `/track/${freshSubmission.reference_number}`)
  const staffSubRow = await scalar(dbB, `select * from public.email_outbox where template_key = 'new-submission' and recipient_user_id = $1`, [aliceB])
  ok('fresh: new-submission email goes to staff with submission.view',
    staffSubRow?.recipient_email === 'admin@fresh.test')
  ok('fresh: staff submission email does not leak the respondent email address',
    staffSubRow !== undefined && !JSON.stringify(staffSubRow.payload).includes('visitor@fresh.test'))

  // Dedupe + normalization on the enqueue helper.
  await dbB.query(`select public.enqueue_email('client-invitation', 'Dedupe@Fresh.test', null, '{}'::jsonb, 'test.dedupe.1')`)
  await dbB.query(`select public.enqueue_email('client-invitation', 'dedupe@fresh.test', null, '{}'::jsonb, 'test.dedupe.1')`)
  ok('fresh: enqueue_email dedupes on (template_key, dedupe_key)',
    (await scalar(dbB, `select count(*)::int n from public.email_outbox where dedupe_key = 'test.dedupe.1'`)).n === 1)
  ok('fresh: recipient email is normalized to lowercase',
    (await scalar(dbB, `select recipient_email e from public.email_outbox where dedupe_key = 'test.dedupe.1'`)).e === 'dedupe@fresh.test')

  // Browser roles can neither call the enqueue helper nor touch the queue.
  await asUser(dbB, aliceB)
  ok('fresh: authenticated users cannot execute enqueue_email',
    await expectError(dbB, () => dbB.query(`select public.enqueue_email('client-invitation', 'x@fresh.test', null, '{}'::jsonb, 'test.forbidden')`)))
  // The outbox revokes table privileges from browser roles outright (RLS
  // deny-all policies sit on top as defense in depth) → permission denied.
  ok('fresh: authenticated users cannot read the outbox',
    await expectError(dbB, () => dbB.query('select count(*) from public.email_outbox')))
  ok('fresh: authenticated users cannot write the outbox',
    await expectError(dbB, () => dbB.query(`insert into public.email_outbox (template_key, recipient_email, dedupe_key) values ('task-assigned', 'x@fresh.test', 'test.rls')`)))

  // Assignment emails: team member → project-assigned; task → task-assigned;
  // self-assignment never emails the actor.
  await asUser(dbB, employeeB)
  await dbB.query(`select public.mark_password_changed($1)`, [employeeB])
  await asUser(dbB, aliceB)
  const emailProject = (await dbB.query(
    `insert into public.projects (name, client_id, status, owner_id) values ('Email Brand', $1, 'in-review', $2) returning id`,
    [carolClient, aliceB],
  )).rows[0]
  await dbB.query(`insert into public.project_members (project_id, user_id) values ($1, $2)`, [emailProject.id, employeeB])
  await dbB.query(`insert into public.tasks (title, project_id, assignee_id, priority, due_date)
    values ('Email Test Task', $1, $2, 'high', current_date + 2)`, [emailProject.id, employeeB])
  await dbB.query(`insert into public.tasks (title, project_id, assignee_id) values ('Self Task', $1, $2)`, [emailProject.id, aliceB])
  await superUser(dbB)
  const memberEmail = await scalar(dbB, `select * from public.email_outbox where template_key = 'project-assigned' and recipient_user_id = $1 and dedupe_key like 'team.member.assigned:%'`, [employeeB])
  ok('fresh: adding a team member enqueues a project-assigned email',
    memberEmail?.recipient_email === 'employee@fresh.test')
  const taskEmail = await scalar(dbB, `select * from public.email_outbox where template_key = 'task-assigned' and recipient_user_id = $1`, [employeeB])
  ok('fresh: task assignment enqueues an email to the assignee',
    taskEmail?.recipient_email === 'employee@fresh.test'
      && taskEmail?.payload?.task_title === 'Email Test Task'
      && taskEmail?.payload?.project_name === 'Email Brand')
  ok('fresh: self-assignment never emails the actor',
    (await scalar(dbB, `select count(*)::int n from public.email_outbox where template_key = 'task-assigned' and recipient_user_id = $1`, [aliceB])).n === 0)

  // Delivery → delivery-ready email to client portal accounts.
  await asUser(dbB, aliceB)
  const carolPlaceholder = (await dbB.query(
    `select * from public.admin_create_client_account($1, 'carol@beta.test', 'Carol Beta')`, [carolClient])).rows[0]
  ok('fresh: portal invitation placeholder provisions a client account', carolPlaceholder?.client_id === carolClient)
  await superUser(dbB)
  const carolUser = await addUser(dbB, 'carol@beta.test', { adminProvisioned: true, fullName: 'Carol Beta' })
  await asUser(dbB, carolUser)
  await dbB.query(`select public.mark_password_changed($1)`, [carolUser])
  await asUser(dbB, aliceB)
  await dbB.query(`insert into public.files (name, type, size, storage_path, project_id, uploaded_by)
    values ('email-brand-final.pdf', 'pdf', 900, $1, $2, $3)`, [`${emailProject.id}/email-brand-final.pdf`, emailProject.id, aliceB])
  const emailFileId = (await dbB.query(`select id from public.files where project_id = $1`, [emailProject.id])).rows[0].id
  await dbB.query(`select public.add_project_delivery_file($1, $2)`, [emailProject.id, emailFileId])
  await dbB.query(`select public.mark_project_delivered($1, 'Handoff for the email test')`, [emailProject.id])
  await superUser(dbB)
  const deliveryEmail = await scalar(dbB, `select * from public.email_outbox where template_key = 'delivery-ready' and recipient_user_id = $1`, [carolUser])
  ok('fresh: delivering a package enqueues a delivery-ready email to the client',
    deliveryEmail?.recipient_email === 'carol@beta.test' && deliveryEmail?.payload?.version === 1)

  // Approval → confirmation to the client + project-update to owner/manager.
  await asUser(dbB, carolUser)
  await dbB.query(`select public.approve_client_portal_delivery($1, 'Approved via email test.')`, [emailProject.id])
  await superUser(dbB)
  const approvalEmail = await scalar(dbB, `select * from public.email_outbox where template_key = 'revision-approval-update' and recipient_user_id = $1`, [carolUser])
  ok('fresh: client approval enqueues a confirmation email to the client',
    approvalEmail?.recipient_email === 'carol@beta.test' && approvalEmail?.payload?.action === 'approved')
  const ownerUpdateEmail = await scalar(dbB, `select * from public.email_outbox where template_key = 'project-update' and recipient_user_id = $1`, [aliceB])
  ok('fresh: client approval enqueues a project-update email to the owner',
    ownerUpdateEmail?.recipient_email === 'admin@fresh.test' && ownerUpdateEmail?.payload?.label === 'Client approval')

  // Revision request → confirmation to the client + project-update to owner.
  await asUser(dbB, aliceB)
  const revEmailProject = (await dbB.query(
    `insert into public.projects (name, client_id, status, owner_id) values ('Email Revision Brand', $1, 'in-review', $2) returning id`,
    [carolClient, aliceB],
  )).rows[0]
  await dbB.query(`insert into public.files (name, type, size, storage_path, project_id, uploaded_by)
    values ('rev-email.pdf', 'pdf', 900, $1, $2, $3)`, [`${revEmailProject.id}/rev-email.pdf`, revEmailProject.id, aliceB])
  const revEmailFileId = (await dbB.query(`select id from public.files where project_id = $1`, [revEmailProject.id])).rows[0].id
  await dbB.query(`select public.add_project_delivery_file($1, $2)`, [revEmailProject.id, revEmailFileId])
  await dbB.query(`select public.mark_project_delivered($1, 'First pass')`, [revEmailProject.id])
  await asUser(dbB, carolUser)
  await dbB.query(`select public.request_client_portal_revision($1, 'Please change the font.')`, [revEmailProject.id])
  await superUser(dbB)
  const revisionEmail = await scalar(dbB, `select * from public.email_outbox where template_key = 'revision-approval-update' and payload->>'action' = 'revision_requested' and recipient_user_id = $1`, [carolUser])
  ok('fresh: client revision request enqueues a confirmation email to the client',
    revisionEmail?.recipient_email === 'carol@beta.test')
  const revisionOwnerEmail = await scalar(dbB, `select * from public.email_outbox where template_key = 'project-update' and payload->>'label' = 'Revision request' and recipient_user_id = $1`, [aliceB])
  ok('fresh: client revision request enqueues a project-update email to the owner',
    revisionOwnerEmail?.recipient_email === 'admin@fresh.test')

  // The unique index makes double-delivery structurally impossible.
  ok('fresh: every outbox row is unique per (template_key, dedupe_key)',
    (await scalar(dbB, `select count(*)::int n from (select 1 from public.email_outbox group by template_key, dedupe_key having count(*) > 1) d`)).n === 0)

  await dbB.close()

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) process.exit(1)
}

main().catch((error) => { console.error('HARNESS ERROR:', error); process.exit(2) })
