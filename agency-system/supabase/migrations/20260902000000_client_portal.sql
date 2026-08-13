-- Session 17 — Client Portal
--
-- Turns the Client role into a real, invitation-only portal:
--   1. `client_portal_client_id()` — resolves the *active* client account's linked
--      CRM record, and only for `client`-role profiles. Public form submitters have
--      no profile and therefore no portal access until an Admin invites them.
--   2. Admin-only client account provisioning (`admin_create_client_account`,
--      `admin_update_client_account`, `admin_delete_client_account`) — creates a
--      client profile placeholder that the trusted Auth provisioning flow claims.
--   3. `handle_new_user` is extended so a trusted Auth user can claim a *client*
--      placeholder (preserving the CRM link), not just a team-member placeholder.
--   4. Sanitized, SECURITY DEFINER read RPCs for the portal: a client can only ever
--      read projects whose `client_id` equals their own linked record. No internal
--      notes, tasks, activity, files, staff, or other clients' data is returned.

begin;

-- ── 1. Portal identity: active client accounts only ──────────────────────────
create or replace function public.client_portal_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.client_id
  from public.profiles p
  where p.id = auth.uid()
    and p.role = 'client'::public.app_role
    and p.status = 'active';
$$;

-- ── 2. Client account provisioning (Admin-only invitations) ─────────────────
create or replace function public.admin_create_client_account(
  p_client_id uuid,
  p_email text,
  p_full_name text default null,
  p_status text default 'active'
)
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.profiles;
  target_role_id uuid;
  clean_email text := lower(trim(p_email));
  clean_status text := lower(trim(p_status));
begin
  if not public.has_permission('admin.manage') then
    raise exception 'Administrator access required: admin.manage';
  end if;

  if clean_email is null or clean_email = '' then
    raise exception 'Email is required';
  end if;

  if clean_status not in ('active', 'inactive') then
    clean_status := 'active';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'Client record not found';
  end if;

  -- Same provisioning rules as team accounts: an e-mail can never be shared by
  -- two profiles or reused against an existing Auth login.
  if exists (select 1 from public.profiles where lower(email) = clean_email) then
    raise exception 'A profile with this email already exists: %', clean_email;
  end if;

  if exists (select 1 from auth.users u where lower(u.email) = clean_email) then
    raise exception 'An account with this email already exists: %', clean_email;
  end if;

  select id into target_role_id
  from public.app_roles
  where key = 'client' and is_system
  limit 1;

  if target_role_id is null then
    raise exception 'Client system role not found';
  end if;

  insert into public.profiles (
    id, email, full_name, role, role_id, client_id, status, must_change_password
  ) values (
    gen_random_uuid(),
    clean_email,
    nullif(trim(p_full_name), ''),
    'client'::public.app_role,
    target_role_id,
    p_client_id,
    clean_status::text,
    false
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.admin_update_client_account(
  p_user_id uuid,
  p_email text default null,
  p_full_name text default null,
  p_client_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  existing public.profiles;
  result public.profiles;
  clean_email text;
begin
  if not public.has_permission('admin.manage') then
    raise exception 'Administrator access required: admin.manage';
  end if;

  select * into existing from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Client account not found';
  end if;

  if existing.role <> 'client'::public.app_role then
    raise exception 'Cannot manage non-client accounts from Client Portal management';
  end if;

  clean_email := case
    when p_email is null then existing.email
    else lower(trim(p_email))
  end;

  if clean_email is null or clean_email = '' then
    raise exception 'Email is required';
  end if;

  if lower(clean_email) <> lower(existing.email)
     and exists (select 1 from public.profiles where lower(email) = lower(clean_email) and id <> p_user_id) then
    raise exception 'A profile with this email already exists: %', clean_email;
  end if;

  if p_client_id is not null and not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'Client record not found';
  end if;

  update public.profiles
  set email = clean_email,
      full_name = case when p_full_name is not null then nullif(trim(p_full_name), '') else full_name end,
      client_id = coalesce(p_client_id, client_id),
      updated_at = now()
  where id = p_user_id
  returning * into result;

  return result;
end;
$$;

create or replace function public.admin_delete_client_account(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.profiles;
begin
  if not public.has_permission('admin.manage') then
    raise exception 'Administrator access required: admin.manage';
  end if;

  select * into existing from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Client account not found';
  end if;

  if existing.role <> 'client'::public.app_role then
    raise exception 'Cannot delete non-client accounts from Client Portal management';
  end if;

  delete from public.profiles where id = p_user_id;
  delete from auth.users where id = p_user_id;
  return true;
end;
$$;

revoke all on function public.admin_create_client_account(uuid, text, text, text) from public, anon;
revoke all on function public.admin_update_client_account(uuid, text, text, uuid) from public, anon;
revoke all on function public.admin_delete_client_account(uuid) from public, anon;
grant execute on function public.admin_create_client_account(uuid, text, text, text) to authenticated;
grant execute on function public.admin_update_client_account(uuid, text, text, uuid) to authenticated;
grant execute on function public.admin_delete_client_account(uuid) to authenticated;

-- ── 3. Extend trusted Auth provisioning to claim client placeholders ─────────
-- Identical to the team-member claim, except the placeholder filter no longer
-- excludes the client role and the CRM link (`client_id`) is preserved.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  placeholder public.profiles;
  target_role_id uuid;
begin
  if coalesce(new.is_anonymous, false)
     or coalesce(new.raw_app_meta_data->>'provider', '') = 'anonymous' then
    return new;
  end if;

  -- Existing permanent accounts may be updated by normal Auth operations.
  if exists (select 1 from public.profiles where id = new.id) then
    update public.profiles
    set email = coalesce(nullif(lower(trim(new.email)), ''), email),
        full_name = coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), full_name),
        updated_at = now()
    where id = new.id;
    return new;
  end if;

  -- Defence in depth if this function is invoked independently of the guard.
  if coalesce(new.raw_app_meta_data->>'agency_os_admin_provisioned', 'false') <> 'true' then
    raise exception 'Public account creation is disabled. An administrator must create this account.';
  end if;

  perform pg_advisory_xact_lock(hashtext('agency_os_admin_account_provisioning'));

  select * into placeholder
  from public.profiles
  where lower(email) = lower(coalesce(new.email, ''))
    and id <> new.id
  order by created_at desc
  limit 1;

  if placeholder.id is not null then
    target_role_id := placeholder.role_id;
    if target_role_id is null then
      select id into target_role_id
      from public.app_roles
      where key = placeholder.role::text and is_system
      limit 1;
    end if;

    create temporary table if not exists _claimed_project_assignments (
      project_id uuid,
      assigned_by uuid,
      assigned_at timestamptz
    ) on commit drop;
    delete from _claimed_project_assignments;

    insert into _claimed_project_assignments (project_id, assigned_by, assigned_at)
    select project_id, assigned_by, assigned_at
    from public.project_members
    where user_id = placeholder.id;

    -- Frees the e-mail for the claimed profile (unique index) before insert.
    delete from public.profiles where id = placeholder.id;

    insert into public.profiles (
      id, email, full_name, avatar_url, role, status, employee_role_id, role_id,
      client_id, agency_name, agency_website, phone, whatsapp, bio, job_title,
      department, specialization, location, portfolio_url, social_links,
      must_change_password, skills, experience, certifications, previous_projects,
      linkedin, behance, instagram, facebook, twitter, personal_website,
      other_social_links, created_at, updated_at
    )
    values (
      new.id,
      coalesce(nullif(lower(trim(new.email)), ''), placeholder.email),
      coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), placeholder.full_name),
      placeholder.avatar_url,
      placeholder.role,
      placeholder.status,
      placeholder.employee_role_id,
      target_role_id,
      placeholder.client_id,
      placeholder.agency_name,
      placeholder.agency_website,
      placeholder.phone,
      placeholder.whatsapp,
      placeholder.bio,
      placeholder.job_title,
      placeholder.department,
      placeholder.specialization,
      placeholder.location,
      placeholder.portfolio_url,
      coalesce(placeholder.social_links, '{}'::jsonb),
      true,
      placeholder.skills,
      placeholder.experience,
      placeholder.certifications,
      placeholder.previous_projects,
      placeholder.linkedin,
      placeholder.behance,
      placeholder.instagram,
      placeholder.facebook,
      placeholder.twitter,
      placeholder.personal_website,
      coalesce(placeholder.other_social_links, '{}'::jsonb),
      placeholder.created_at,
      now()
    );

    -- Preserve assignments made against the placeholder before it was claimed.
    insert into public.project_members (project_id, user_id, assigned_by, assigned_at)
    select project_id, new.id, assigned_by, assigned_at
    from _claimed_project_assignments
    on conflict do nothing;

    return new;
  end if;

  -- One-time bootstrap for a brand-new workspace. The supplied bootstrap script
  -- uses the same server-only marker. Once any profile exists this path is closed.
  if not exists (select 1 from public.profiles) then
    select id into target_role_id
    from public.app_roles
    where key = 'admin' and is_system
    limit 1;

    insert into public.profiles (
      id, email, full_name, role, role_id, status, must_change_password
    )
    values (
      new.id,
      coalesce(lower(trim(new.email)), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      'admin'::public.app_role,
      target_role_id,
      'active',
      false
    );
    return new;
  end if;

  raise exception 'Internal account must be created from Admin Team Management before Auth provisioning.';
end;
$$;

-- ── 4. Sanitized, client-scoped portal reads ─────────────────────────────────
-- Clients never touch the raw `projects` table: these functions return only the
-- caller's own projects and only client-appropriate fields (no owner, manager,
-- team, budget, health, priority, archive state, or internal audit columns).
create or replace function public.get_client_portal_projects()
returns table (
  id uuid,
  name text,
  description text,
  type text,
  status text,
  progress integer,
  phase integer,
  phase_name text,
  start_date date,
  due_date date,
  reference_number text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  my_client_id uuid := public.client_portal_client_id();
begin
  if my_client_id is null then
    return;
  end if;

  return query
    select
      p.id,
      p.name,
      p.description,
      p.type,
      p.status,
      p.progress,
      p.phase,
      p.phase_name,
      p.start_date,
      p.due_date,
      fs.reference_number,
      p.created_at,
      p.updated_at
    from public.projects p
    left join public.form_submissions fs on fs.id = p.source_submission_id
    where p.client_id = my_client_id
    order by p.updated_at desc, p.created_at desc;
end;
$$;

create or replace function public.get_client_portal_project(p_project_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  type text,
  status text,
  progress integer,
  phase integer,
  phase_name text,
  start_date date,
  due_date date,
  reference_number text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  my_client_id uuid := public.client_portal_client_id();
begin
  if my_client_id is null then
    return;
  end if;

  return query
    select
      p.id,
      p.name,
      p.description,
      p.type,
      p.status,
      p.progress,
      p.phase,
      p.phase_name,
      p.start_date,
      p.due_date,
      fs.reference_number,
      p.created_at,
      p.updated_at
    from public.projects p
    left join public.form_submissions fs on fs.id = p.source_submission_id
    where p.id = p_project_id
      and p.client_id = my_client_id;
end;
$$;

create or replace function public.get_client_portal_client()
returns table (
  id uuid,
  name text,
  email text,
  contact_person text,
  contact_position text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  my_client_id uuid := public.client_portal_client_id();
begin
  if my_client_id is null then
    return;
  end if;

  return query
    select c.id, c.name, c.email, c.contact_person, c.contact_position
    from public.clients c
    where c.id = my_client_id;
end;
$$;

revoke all on function public.get_client_portal_projects() from public, anon;
revoke all on function public.get_client_portal_project(uuid) from public, anon;
revoke all on function public.get_client_portal_client() from public, anon;
grant execute on function public.get_client_portal_projects() to authenticated;
grant execute on function public.get_client_portal_project(uuid) to authenticated;
grant execute on function public.get_client_portal_client() to authenticated;

commit;
