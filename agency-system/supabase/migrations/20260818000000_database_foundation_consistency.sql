-- Database foundation consistency fixes.
--
-- This migration closes gaps between the profile/authentication code and the
-- migration history, preserves attribution when a team profile is removed, and
-- aligns a few permission-backed RLS policies with the permission catalog.

begin;

-- ── 1. Attribution foreign keys preserve business records on user removal ────
-- These columns are nullable audit fields. Deleting a profile should null the
-- attribution, not block Team Management from removing the account or delete the
-- related business record.
alter table public.employee_roles drop constraint if exists employee_roles_created_by_fkey;
alter table public.employee_roles
  add constraint employee_roles_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.project_members drop constraint if exists project_members_assigned_by_fkey;
alter table public.project_members
  add constraint project_members_assigned_by_fkey
  foreign key (assigned_by) references public.profiles(id) on delete set null;

alter table public.tasks drop constraint if exists tasks_created_by_fkey;
alter table public.tasks
  add constraint tasks_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.files drop constraint if exists files_uploaded_by_fkey;
alter table public.files
  add constraint files_uploaded_by_fkey
  foreign key (uploaded_by) references public.profiles(id) on delete set null;

alter table public.interactions drop constraint if exists interactions_created_by_fkey;
alter table public.interactions
  add constraint interactions_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.comments drop constraint if exists comments_author_id_fkey;
alter table public.comments
  add constraint comments_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete set null;

-- Foreign-key lookup/delete paths that were not covered by the earlier indexes.
create index if not exists idx_role_permissions_permission on public.role_permissions(permission_id);
create index if not exists idx_files_client on public.files(client_id);
create index if not exists idx_interactions_project on public.interactions(project_id);
create index if not exists idx_notifications_project on public.notifications(project_id);
create index if not exists idx_form_submissions_client on public.form_submissions(client_id);
create index if not exists idx_form_submissions_project on public.form_submissions(project_id);
create index if not exists idx_form_answers_question on public.form_submission_answers(question_id);
create index if not exists idx_form_attachments_question on public.form_submission_attachments(question_id);

-- A client login can never carry an employee job-role assignment. Existing bad
-- rows are repaired before the invariant is installed.
update public.profiles
set employee_role_id = null,
    updated_at = now()
where role = 'client'::public.app_role
  and employee_role_id is not null;

alter table public.profiles drop constraint if exists profiles_client_has_no_employee_role;
alter table public.profiles
  add constraint profiles_client_has_no_employee_role
  check (role <> 'client'::public.app_role or employee_role_id is null);

-- Real login profiles use Auth as the e-mail authority. Repair prior drift, then
-- reject profile-only e-mail changes. Placeholder profiles have no auth.users row
-- and remain editable until the protected provisioning route claims them.
update public.profiles p
set email = lower(trim(u.email)),
    updated_at = now()
from auth.users u
where u.id = p.id
  and nullif(trim(u.email), '') is not null
  and lower(trim(p.email)) is distinct from lower(trim(u.email));

create or replace function public.guard_profile_email_matches_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  auth_email text;
begin
  select lower(trim(u.email)) into auth_email
  from auth.users u
  where u.id = new.id;

  if found and lower(trim(new.email)) is distinct from auth_email then
    raise exception using
      errcode = '23514',
      message = 'Profile email must match the Supabase Auth email. Use the protected Team Management server route.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_email_matches_auth() from public, anon, authenticated;
drop trigger if exists guard_profile_email_matches_auth on public.profiles;
create trigger guard_profile_email_matches_auth
before update of email on public.profiles
for each row execute function public.guard_profile_email_matches_auth();

-- Keep the legacy enum and metadata role in sync, and clear a stale job role when
-- an account is deliberately converted to the legacy Client account type.
create or replace function public.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_key text;
begin
  if new.role_id is not null then
    select key into role_key from public.app_roles where id = new.role_id;
    if role_key in ('admin', 'manager', 'employee', 'client') then
      new.role := role_key::public.app_role;
    end if;
  end if;

  if new.role_id is null and new.role is not null then
    select id into new.role_id
    from public.app_roles
    where key = new.role::text and is_system;
  end if;

  if new.role = 'client'::public.app_role then
    new.employee_role_id := null;
  end if;

  return new;
end;
$$;

-- ── 2. Profile RPC required by the existing profile page ─────────────────────
create or replace function public.update_own_enhanced_profile(
  p_user_id uuid,
  p_full_name text,
  p_phone text,
  p_whatsapp text,
  p_bio text,
  p_job_title text,
  p_skills text,
  p_experience text,
  p_previous_projects text,
  p_certifications text,
  p_location text,
  p_portfolio_url text,
  p_linkedin text,
  p_behance text,
  p_instagram text,
  p_facebook text,
  p_twitter text,
  p_personal_website text,
  p_other_social_links jsonb,
  p_avatar_url text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'A profile can only be updated by its owner';
  end if;

  update public.profiles
  set full_name = nullif(trim(p_full_name), ''),
      phone = nullif(trim(p_phone), ''),
      whatsapp = nullif(trim(p_whatsapp), ''),
      bio = nullif(trim(p_bio), ''),
      job_title = nullif(trim(p_job_title), ''),
      skills = nullif(trim(p_skills), ''),
      experience = nullif(trim(p_experience), ''),
      previous_projects = nullif(trim(p_previous_projects), ''),
      certifications = nullif(trim(p_certifications), ''),
      location = nullif(trim(p_location), ''),
      portfolio_url = nullif(trim(p_portfolio_url), ''),
      linkedin = nullif(trim(p_linkedin), ''),
      behance = nullif(trim(p_behance), ''),
      instagram = nullif(trim(p_instagram), ''),
      facebook = nullif(trim(p_facebook), ''),
      twitter = nullif(trim(p_twitter), ''),
      personal_website = nullif(trim(p_personal_website), ''),
      other_social_links = coalesce(p_other_social_links, '{}'::jsonb),
      avatar_url = nullif(trim(p_avatar_url), ''),
      updated_at = now()
  where id = auth.uid()
  returning * into result;

  if result.id is null then
    raise exception 'Profile not found';
  end if;

  return result;
end;
$$;

revoke all on function public.update_own_enhanced_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text
) from public, anon;
grant execute on function public.update_own_enhanced_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text
) to authenticated;

-- The old function was SECURITY DEFINER but trusted a caller-supplied user id.
-- Require ownership so one authenticated user cannot clear another user's flag.
create or replace function public.mark_password_changed(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'A password-change flag can only be updated by its owner';
  end if;

  update public.profiles
  set must_change_password = false,
      updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.mark_password_changed(uuid) from public, anon;
grant execute on function public.mark_password_changed(uuid) to authenticated;

-- ── 3. Auth provisioning copies the complete profile contract ────────────────
-- Team-created accounts receive the temporary-password flag. Bootstrap Admins do
-- not: bootstrap credentials are supplied directly by the trusted operator.
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

    -- Preserve assignments made against an older placeholder flow.
    insert into public.project_members (project_id, user_id, assigned_by, assigned_at)
    select project_id, new.id, assigned_by, assigned_at
    from public.project_members
    where user_id = placeholder.id
    on conflict do nothing;

    delete from public.profiles where id = placeholder.id;
    return new;
  end if;

  -- One-time bootstrap for a brand-new workspace.
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

-- Delete both sides of a permanent team account atomically. Placeholder-only
-- profiles are also supported (the auth.users delete simply affects zero rows).
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

  if existing.role = 'admin'::public.app_role
     and existing.status = 'active'
     and (select count(*) from public.profiles where role = 'admin'::public.app_role and status = 'active') = 1 then
    raise exception 'The workspace must retain at least one active administrator';
  end if;

  delete from public.profiles where id = p_user_id;
  delete from auth.users where id = p_user_id;
  return true;
end;
$$;

revoke all on function public.admin_delete_team_member(uuid) from public, anon;
grant execute on function public.admin_delete_team_member(uuid) to authenticated;

-- Profiles remain RPC-managed. Policies alone never grant table privileges, but
-- restating this closes accidental grants from older/manual installations.
revoke insert, update, delete on public.profiles from anon, authenticated;

-- ── 4. Permission-backed RLS consistency ─────────────────────────────────────
-- `workspace.access` is not the same capability as reading the team directory or
-- the RBAC catalog. Owners can always read their own profile.
drop policy if exists profiles_select_staff_or_self on public.profiles;
create policy profiles_select_staff_or_self on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.has_permission('employee.view')
  or public.has_permission('employee.manage')
  or public.has_permission('admin.manage')
);

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions for select to authenticated
using (
  public.has_permission('permission.view')
  or public.has_permission('permission.manage')
  or public.has_permission('admin.manage')
);

drop policy if exists app_roles_select on public.app_roles;
create policy app_roles_select on public.app_roles for select to authenticated
using (
  public.has_permission('role.view')
  or public.has_permission('role.assign_permissions')
  or public.has_permission('admin.manage')
);

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated
using (
  public.has_permission('role.view')
  or public.has_permission('role.assign_permissions')
  or public.has_permission('admin.manage')
);

-- Legacy intake tables and storage now follow the same submission.view/edit
-- permissions as the dynamic form tables. Owners and legacy client accounts keep
-- their existing access through the other policies.
drop policy if exists intake_attachments_select on public.intake_attachments;
create policy intake_attachments_select on public.intake_attachments for select
using (
  public.has_permission('submission.view')
  or exists (
    select 1 from public.intake_forms f
    where f.id = intake_id
      and (f.created_by = auth.uid() or public.is_manager_or_admin())
  )
);

drop policy if exists intake_attachments_delete on public.intake_attachments;
create policy intake_attachments_delete on public.intake_attachments for delete
using (
  uploaded_by = auth.uid()
  or public.has_permission('submission.edit')
  or public.is_manager_or_admin()
);

drop policy if exists intake_projects_select on public.intake_projects;
create policy intake_projects_select on public.intake_projects for select
using (
  public.has_permission('submission.view')
  or exists (
    select 1 from public.intake_forms f
    where f.id = intake_id
      and (f.created_by = auth.uid() or public.is_manager_or_admin())
  )
);

drop policy if exists intake_files_select on storage.objects;
create policy intake_files_select on storage.objects for select to authenticated, anon
using (
  bucket_id = 'intake-files'
  and (
    owner_id = auth.uid()::text
    or public.has_permission('submission.view')
  )
);

drop policy if exists intake_files_delete on storage.objects;
create policy intake_files_delete on storage.objects for delete to authenticated, anon
using (
  bucket_id = 'intake-files'
  and (
    owner_id = auth.uid()::text
    or public.has_permission('submission.edit')
  )
);

commit;
