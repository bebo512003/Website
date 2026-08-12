-- Employee account lifecycle hardening (Session 02).
--
-- 1. E-mail uniqueness for profiles: a Supabase Auth account is unique per
--    e-mail, so the workspace profiles that mirror those accounts must be too.
--    This closes the race where two admins could create placeholders for the
--    same address, and gives a deterministic error instead of an orphaned row.
-- 2. Provisioning rejects e-mails that already exist in auth.users even when
--    no profile row matches (e.g. a manually deleted profile).
-- 3. The temporary-password state becomes a real authorization gate: while
--    must_change_password is pending, the account keeps its role but exercises
--    no permissions — RLS, RPCs and storage policies all flow through
--    has_permission()/get_user_permissions(), so the forced change blocks
--    workspace data at the database, not only in the UI.

begin;

-- ── 1. Unique profile e-mails ────────────────────────────────────────────────
-- Remove stale duplicates before installing the index. Auth-linked rows win;
-- among unclaimed placeholders only the newest per e-mail survives. Real
-- (auth-linked) duplicates cannot exist under GoTrue's own uniqueness, but if
-- a legacy install has them we fail loudly instead of guessing what to delete.
do $$
declare
  bad record;
begin
  select lower(p.email) e, count(*) n
  into bad
  from public.profiles p
  where nullif(trim(p.email), '') is not null
    and exists (select 1 from auth.users u where u.id = p.id)
  group by lower(p.email)
  having count(*) > 1
  limit 1;

  if found then
    raise exception
      'Two Auth-linked profiles share the e-mail %. Fix this duplicate in public.profiles before applying the lifecycle migration.',
      bad.e;
  end if;
end $$;

with ranked as (
  select p.id,
         row_number() over (
           partition by lower(p.email)
           order by exists (select 1 from auth.users u where u.id = p.id) desc,
                    p.created_at desc,
                    p.id
         ) rn,
         exists (select 1 from auth.users u where u.id = p.id) has_auth
  from public.profiles p
  where nullif(trim(p.email), '') is not null
)
delete from public.profiles p
using ranked
where p.id = ranked.id
  and ranked.rn > 1
  and not ranked.has_auth;

drop index if exists public.profiles_email_unique;
create unique index profiles_email_unique
  on public.profiles (lower(email))
  where nullif(trim(email), '') is not null;

-- ── 2. Provisioning rejects e-mails already present in auth.users ──────────
create or replace function public.admin_create_team_member(
  p_email text,
  p_full_name text,
  p_phone text default null,
  p_whatsapp text default null,
  p_avatar_url text default null,
  p_job_title text default null,
  p_department text default null,
  p_specialization text default null,
  p_bio text default null,
  p_location text default null,
  p_portfolio_url text default null,
  p_social_links jsonb default '{}'::jsonb,
  p_role_id uuid default null,
  p_employee_role_id uuid default null,
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
  target_role_key text;
  new_id uuid := gen_random_uuid();
  clean_email text := lower(trim(p_email));
  clean_status text := lower(trim(p_status));
begin
  if not (public.has_permission('employee.manage') or public.has_permission('admin.manage')) then
    raise exception 'Administrator access required: employee.manage';
  end if;

  if clean_email is null or clean_email = '' then
    raise exception 'Email is required';
  end if;

  if clean_status not in ('active', 'inactive') then
    clean_status := 'active';
  end if;

  if exists (select 1 from public.profiles where lower(email) = clean_email) then
    raise exception 'A team member or client with this email already exists: %', clean_email;
  end if;

  -- Supabase Auth is the login authority: an existing account for this e-mail
  -- (even one whose profile was removed) can never be provisioned twice.
  if exists (select 1 from auth.users u where lower(u.email) = clean_email) then
    raise exception 'An account with this email already exists: %', clean_email;
  end if;

  -- Resolve role: must be internal (not client). If p_role_id null, default to employee system role.
  if p_role_id is not null then
    select id, key into target_role_id, target_role_key from public.app_roles where id = p_role_id and is_active;
    if target_role_id is null then
      raise exception 'Role not found or inactive';
    end if;
    if target_role_key = 'client' then
      raise exception 'Team members cannot be assigned the Client role';
    end if;
  else
    select id into target_role_id from public.app_roles where key = 'employee' and is_system limit 1;
  end if;

  if p_employee_role_id is not null and not exists (select 1 from public.employee_roles where id = p_employee_role_id) then
    raise exception 'Employee job role not found';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    role,
    role_id,
    employee_role_id,
    status,
    phone,
    whatsapp,
    bio,
    job_title,
    department,
    specialization,
    location,
    portfolio_url,
    social_links
  )
  values (
    new_id,
    clean_email,
    nullif(trim(p_full_name), ''),
    nullif(trim(p_avatar_url), ''),
    coalesce((select key::public.app_role from public.app_roles where id = target_role_id and key in ('admin','manager','employee','client')), 'employee'::public.app_role),
    target_role_id,
    p_employee_role_id,
    clean_status::text,
    nullif(trim(p_phone), ''),
    nullif(trim(p_whatsapp), ''),
    nullif(trim(p_bio), ''),
    nullif(trim(p_job_title), ''),
    nullif(trim(p_department), ''),
    nullif(trim(p_specialization), ''),
    nullif(trim(p_location), ''),
    nullif(trim(p_portfolio_url), ''),
    coalesce(p_social_links, '{}'::jsonb)
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.admin_create_team_member(text,text,text,text,text,text,text,text,text,text,text,jsonb,uuid,uuid,text) from public, anon;
grant execute on function public.admin_create_team_member(text,text,text,text,text,text,text,text,text,text,text,jsonb,uuid,uuid,text) to authenticated;

-- ── 3. Placeholder claim survives the unique e-mail index ───────────────────
-- The claimed profile takes over the placeholder's e-mail, which the unique
-- index only allows once the placeholder row is gone. The assignments attached
-- to the placeholder are snapshotted first because the project_members FK
-- cascades them away together with the placeholder row.
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
    and role <> 'client'::public.app_role
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
      null,
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

-- ── 4. Temporary-password state blocks workspace access ─────────────────────
-- The account still owns its role; it simply exercises nothing until the
-- temporary password is replaced. Self-service steps needed for the change
-- (reading the own profile, update_own_enhanced_profile, mark_password_changed,
-- Supabase Auth itself) never consult these helpers, so the flow keeps working.
create or replace function public.must_change_password_pending()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.must_change_password from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

grant execute on function public.must_change_password_pending() to authenticated;

create or replace function public.get_user_permissions()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- Inactive accounts and pending temporary-password changes report no
    -- effective permissions, so every consumer (the UI `can()` helper, the
    -- protected provisioning Route Handler, RLS via has_permission) agrees.
    when not public.is_active() or public.must_change_password_pending() then array[]::text[]
    else coalesce(
      (
        select array_agg(distinct p.key order by p.key)
        from public.app_roles r
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        where r.id = public.user_role_id() and r.is_active
      ),
      array[]::text[]
    )
  end;
$$;

create or replace function public.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.is_active()
    and not public.must_change_password_pending()
    and required_permission = any(public.get_user_permissions());
$$;

commit;
