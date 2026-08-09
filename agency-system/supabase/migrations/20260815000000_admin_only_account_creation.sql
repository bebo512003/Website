-- Close public account creation and require Admin-controlled Auth provisioning.
--
-- Anonymous Auth users remain available for public form ownership. They never get
-- a profile and cannot be converted into a permanent login by a browser client.
-- Permanent users must carry trusted app_metadata that only the service-role
-- Admin API can write, and (after bootstrap) must match a Team Management profile.

begin;

-- Reject direct /auth/v1/signup calls at the database boundary. Hiding a button
-- is not sufficient: this trigger also blocks anonymous-to-permanent conversion.
create or replace function public.guard_internal_account_creation()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Anonymous identities are required by the public intake/form flows.
  if coalesce(new.is_anonymous, false)
     or coalesce(new.raw_app_meta_data->>'provider', '') = 'anonymous' then
    return new;
  end if;

  -- Updates to an already-permanent account (password reset, e-mail confirmation,
  -- metadata refresh, etc.) are not account creation and must keep working.
  if tg_op = 'UPDATE' and not coalesce(old.is_anonymous, false) then
    return new;
  end if;

  -- raw_app_meta_data cannot be set by signUp options/user metadata. Only a
  -- service-role Admin API call can add this trusted provisioning marker.
  if coalesce(new.raw_app_meta_data->>'agency_os_admin_provisioned', 'false') <> 'true' then
    raise exception using
      errcode = '42501',
      message = 'Public account creation is disabled. An administrator must create this account.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_internal_account_creation() from public, anon, authenticated;

drop trigger if exists guard_internal_account_creation on auth.users;
create trigger guard_internal_account_creation
before insert or update on auth.users
for each row execute function public.guard_internal_account_creation();

-- Replace legacy sign-up routing. There is no longer a client-claim or implicit
-- employee sign-up path. A trusted Auth user either claims the internal profile
-- just created by Team Management, or bootstraps the first Admin in a new install.
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

    insert into public.profiles (
      id, email, full_name, avatar_url, role, status, employee_role_id, role_id,
      client_id, agency_name, agency_website, phone, whatsapp, bio, job_title,
      department, specialization, location, portfolio_url, social_links,
      created_at, updated_at
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
      placeholder.created_at,
      now()
    );

    -- Preserve any assignments made while upgrading from the former placeholder flow.
    insert into public.project_members (project_id, user_id, assigned_by, assigned_at)
    select project_id, new.id, assigned_by, assigned_at
    from public.project_members
    where user_id = placeholder.id
    on conflict do nothing;

    delete from public.profiles where id = placeholder.id;
    return new;
  end if;

  -- One-time bootstrap for a brand-new workspace. The supplied bootstrap script
  -- uses the same server-only marker. Once any profile exists this path is closed.
  if not exists (select 1 from public.profiles) then
    select id into target_role_id
    from public.app_roles
    where key = 'admin' and is_system
    limit 1;

    insert into public.profiles (id, email, full_name, role, role_id, status)
    values (
      new.id,
      coalesce(lower(trim(new.email)), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      'admin'::public.app_role,
      target_role_id,
      'active'
    );
    return new;
  end if;

  raise exception 'Internal account must be created from Admin Team Management before Auth provisioning.';
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update on auth.users
for each row execute function public.handle_new_user();

commit;
