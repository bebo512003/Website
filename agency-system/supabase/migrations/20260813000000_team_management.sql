-- Team Management system
-- Adds extended profile fields for team members and enables Admin to create/manage team members as Employee/Internal Users.

begin;

-- ── 1. Extend profiles with Team Management fields ──────────────────────────
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists specialization text;
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists portfolio_url text;
alter table public.profiles add column if not exists whatsapp text;
alter table public.profiles add column if not exists social_links jsonb not null default '{}'::jsonb;

-- Keep phone already exists, bio already exists, avatar_url already exists.

comment on column public.profiles.job_title is 'Team member job title e.g. Senior Designer';
comment on column public.profiles.department is 'Department or team e.g. Design, Development';
comment on column public.profiles.specialization is 'Specialization / focus area';
comment on column public.profiles.location is 'Office location or remote city';
comment on column public.profiles.portfolio_url is 'Portfolio external URL';
comment on column public.profiles.whatsapp is 'WhatsApp contact number';
comment on column public.profiles.social_links is 'JSON object of social links e.g. {linkedin: url, github: url, twitter: url, behance: url, dribbble: url}';

-- ── 2. Allow admin-created profiles without auth user (drop FK to auth.users) ─
-- The original schema had: id uuid primary key references auth.users(id) on delete cascade
-- To enable Team Management Add Member without immediate sign-up, we drop that FK.
-- Profiles created by admin will be claimed when the user signs up with same email.

-- Drop all FKs from profiles.id to auth.users regardless of constraint name
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.profiles drop constraint if exists %I', r.conname);
  end loop;
end $$;

-- Ensure primary key still exists
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'p') then
    alter table public.profiles add primary key (id);
  end if;
end $$;

-- ── 3. RLS: allow admin to manage team member directory directly ───────────
-- Existing policy only allowed select. Add insert/update/delete for employee.manage

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles for insert to authenticated
  with check (public.has_permission('employee.manage') or public.has_permission('admin.manage'));

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.has_permission('employee.manage') or public.has_permission('admin.manage'))
  with check (public.has_permission('employee.manage') or public.has_permission('admin.manage'));

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles for delete to authenticated
  using (public.has_permission('employee.manage') or public.has_permission('admin.manage'));

-- Staff can still view directory (existing policy kept, but ensure it still exists)
drop policy if exists profiles_select_staff_or_self on public.profiles;
create policy profiles_select_staff_or_self on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff() or public.has_permission('employee.view') or public.has_permission('employee.manage') or public.has_permission('admin.manage'));

-- ── 4. Storage bucket for team avatars ──────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects for select to anon, authenticated
using (bucket_id = 'avatars');

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (
    public.has_permission('employee.manage')
    or public.has_permission('employee.edit')
    or owner_id = auth.uid()::text
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (
    public.has_permission('employee.manage')
    or owner_id = auth.uid()::text
  )
);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (
    public.has_permission('employee.manage')
    or owner_id = auth.uid()::text
  )
);

-- ── 5. RPCs for Team Management ────────────────────────────────────────────

-- Create or update a team member as Employee (admin only)
-- This RPC allows creation even without an existing auth user; it generates a UUID.
-- If email already exists as client, it will be rejected (team members must be employees).
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
set search_path = public
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
    raise exception 'A profile with this email already exists: %', clean_email;
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

create or replace function public.admin_update_team_member(
  p_user_id uuid,
  p_email text default null,
  p_full_name text default null,
  p_phone text default null,
  p_whatsapp text default null,
  p_avatar_url text default null,
  p_job_title text default null,
  p_department text default null,
  p_specialization text default null,
  p_bio text default null,
  p_location text default null,
  p_portfolio_url text default null,
  p_social_links jsonb default null,
  p_role_id uuid default null,
  p_employee_role_id uuid default null,
  p_status text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
  target_role_id uuid;
  target_role_key text;
  existing public.profiles;
begin
  if not (public.has_permission('employee.manage') or public.has_permission('admin.manage')) then
    raise exception 'Administrator access required: employee.manage';
  end if;

  select * into existing from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Team member not found';
  end if;

  if existing.role = 'client'::public.app_role then
    raise exception 'Cannot edit client accounts from Team Management. Use Client accounts section.';
  end if;

  if p_role_id is not null then
    select id, key into target_role_id, target_role_key from public.app_roles where id = p_role_id and is_active;
    if target_role_id is null then
      raise exception 'Role not found or inactive';
    end if;
    if target_role_key = 'client' then
      raise exception 'Team members cannot be assigned the Client role';
    end if;
  end if;

  if p_employee_role_id is not null and p_employee_role_id::text <> '' and not exists (select 1 from public.employee_roles where id = p_employee_role_id) then
    raise exception 'Employee job role not found';
  end if;

  if p_status is not null and lower(trim(p_status)) not in ('active','inactive') then
    raise exception 'Invalid status';
  end if;

  if p_user_id = auth.uid() and p_status is not null and lower(trim(p_status)) = 'inactive'
    and (select count(*) from public.profiles where role = 'admin'::public.app_role and status = 'active') = 1 then
    raise exception 'The workspace must retain at least one active administrator';
  end if;

  update public.profiles
  set
    email = coalesce(nullif(lower(trim(p_email)), ''), email),
    full_name = case when p_full_name is not null then nullif(trim(p_full_name), '') else full_name end,
    phone = case when p_phone is not null then nullif(trim(p_phone), '') else phone end,
    whatsapp = case when p_whatsapp is not null then nullif(trim(p_whatsapp), '') else whatsapp end,
    avatar_url = case when p_avatar_url is not null then nullif(trim(p_avatar_url), '') else avatar_url end,
    job_title = case when p_job_title is not null then nullif(trim(p_job_title), '') else job_title end,
    department = case when p_department is not null then nullif(trim(p_department), '') else department end,
    specialization = case when p_specialization is not null then nullif(trim(p_specialization), '') else specialization end,
    bio = case when p_bio is not null then nullif(trim(p_bio), '') else bio end,
    location = case when p_location is not null then nullif(trim(p_location), '') else location end,
    portfolio_url = case when p_portfolio_url is not null then nullif(trim(p_portfolio_url), '') else portfolio_url end,
    social_links = coalesce(p_social_links, social_links),
    employee_role_id = case when p_employee_role_id is not null then (case when p_employee_role_id::text = '' then null else p_employee_role_id end) else employee_role_id end,
    role_id = coalesce(target_role_id, role_id),
    status = coalesce(lower(trim(p_status)), status),
    updated_at = now()
  where id = p_user_id
  returning * into result;

  -- sync legacy role enum from role_id if needed
  if target_role_id is not null then
    select key into target_role_key from public.app_roles where id = target_role_id;
    if target_role_key in ('admin','manager','employee','client') then
      update public.profiles set role = target_role_key::public.app_role where id = p_user_id returning * into result;
    end if;
  end if;

  return result;
end;
$$;

create or replace function public.admin_delete_team_member(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.profiles;
begin
  if not (public.has_permission('employee.manage') or public.has_permission('admin.manage')) then
    raise exception 'Administrator access required: employee.manage';
  end if;

  select * into existing from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Team member not found';
  end if;

  if existing.role = 'client'::public.app_role then
    raise exception 'Cannot delete client accounts from Team Management';
  end if;

  if existing.role = 'admin'::public.app_role and (select count(*) from public.profiles where role = 'admin'::public.app_role and status = 'active') = 1 then
    raise exception 'The workspace must retain at least one active administrator';
  end if;

  delete from public.profiles where id = p_user_id;
  return true;
end;
$$;

revoke all on function public.admin_create_team_member(text,text,text,text,text,text,text,text,text,text,text,jsonb,uuid,uuid,text) from public, anon;
revoke all on function public.admin_update_team_member(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb,uuid,uuid,text) from public, anon;
revoke all on function public.admin_delete_team_member(uuid) from public, anon;

grant execute on function public.admin_create_team_member(text,text,text,text,text,text,text,text,text,text,text,jsonb,uuid,uuid,text) to authenticated;
grant execute on function public.admin_update_team_member(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb,uuid,uuid,text) to authenticated;
grant execute on function public.admin_delete_team_member(uuid) to authenticated;

-- ── 6. Update handle_new_user to claim admin-created team member placeholders ─
-- If a profile was pre-created by admin with same email but different id, merge its data.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  initial_role public.app_role;
  matched_client_id uuid;
  target_role_id uuid;
  placeholder public.profiles;
begin
  if coalesce(new.is_anonymous, false) or coalesce(new.raw_app_meta_data->>'provider', '') = 'anonymous' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('agency_os_first_admin'));

  -- Check for admin-created placeholder with same email (case-insensitive) that has no auth user
  select * into placeholder from public.profiles
  where lower(email) = lower(coalesce(new.email, ''))
    and id <> new.id
  order by created_at desc
  limit 1;

  if not exists (select 1 from public.profiles) then
    initial_role := 'admin'::public.app_role;
    matched_client_id := null;
  else
    select c.id into matched_client_id
    from public.clients c
    where coalesce(new.email, '') <> ''
      and lower(c.email) = lower(new.email)
    order by c.created_at asc
    limit 1;
    initial_role := case
      when matched_client_id is not null then 'client'::public.app_role
      else 'employee'::public.app_role
    end;
  end if;

  -- If placeholder exists and is not a client, reuse its role and data
  if placeholder.id is not null and placeholder.role <> 'client'::public.app_role and matched_client_id is null then
    -- Use placeholder's role information for the new user
    initial_role := placeholder.role;
    target_role_id := placeholder.role_id;
    -- We will delete placeholder after creating new profile, but first copy its data via upsert
    -- Insert new profile with placeholder data merged
    select id into target_role_id from public.app_roles where id = coalesce(placeholder.role_id, target_role_id) limit 1;
    if target_role_id is null then
      select id into target_role_id from public.app_roles where key = initial_role::text and is_system limit 1;
    end if;

    insert into public.profiles (id, email, full_name, role, role_id, client_id, avatar_url, phone, whatsapp, bio, job_title, department, specialization, location, portfolio_url, social_links, employee_role_id, status)
    values (
      new.id,
      coalesce(new.email, placeholder.email),
      coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), placeholder.full_name),
      coalesce(initial_role, placeholder.role),
      target_role_id,
      placeholder.client_id,
      placeholder.avatar_url,
      coalesce(placeholder.phone, ''),
      placeholder.whatsapp,
      coalesce(placeholder.bio, ''),
      placeholder.job_title,
      placeholder.department,
      placeholder.specialization,
      placeholder.location,
      placeholder.portfolio_url,
      coalesce(placeholder.social_links, '{}'::jsonb),
      placeholder.employee_role_id,
      coalesce(placeholder.status, 'active')
    )
    on conflict (id) do update set
      email = coalesce(excluded.email, public.profiles.email),
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      role_id = coalesce(excluded.role_id, public.profiles.role_id),
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
      phone = coalesce(excluded.phone, public.profiles.phone);

    -- Delete the placeholder (its project assignments will be migrated if needed)
    -- Migrate project_members if placeholder had assignments
    insert into public.project_members (project_id, user_id, assigned_by, assigned_at)
    select project_id, new.id, assigned_by, assigned_at from public.project_members where user_id = placeholder.id
    on conflict do nothing;

    delete from public.profiles where id = placeholder.id and id <> new.id;

    return new;
  end if;

  -- Normal flow (no placeholder)
  select id into target_role_id from public.app_roles where key = initial_role::text and is_system;

  insert into public.profiles (id, email, full_name, role, role_id, client_id)
  values (new.id, coalesce(new.email, ''), nullif(trim(new.raw_user_meta_data->>'full_name'), ''), initial_role, target_role_id, matched_client_id)
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role_id = coalesce(excluded.role_id, public.profiles.role_id);
  return new;
end;
$$;

commit;
