-- User & employee architecture:
--   1. 'client' account role — form submitters who later sign up become clients, never employees.
--   2. Admin-managed employee job roles (employee_roles catalog + profiles.employee_role_id).
--   3. Employee status (active/inactive) — inactive users lose all workspace access in RLS.
--   4. Clients are excluded from staff listings, project membership, and staff permissions.
-- The enum addition runs outside the transaction so older databases can adopt it safely.
alter type public.app_role add value if not exists 'client';

begin;

-- ── 1. Employee job roles catalog (fully admin-managed, no hardcoding) ───────
create table if not exists public.employee_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.employee_roles is 'Admin-managed job roles for team members, e.g. Designer, Translator, Copywriter, Developer, Project Manager.';

drop trigger if exists set_employee_roles_updated_at on public.employee_roles;
create trigger set_employee_roles_updated_at before update on public.employee_roles
for each row execute function public.set_updated_at();

-- ── 2. Profile columns: job role, employment status, client linkage ──────────
alter table public.profiles add column if not exists status text not null default 'active';
do $$ begin
  alter table public.profiles add constraint profiles_status_check check (status in ('active', 'inactive'));
exception when duplicate_object then null; end $$;

alter table public.profiles add column if not exists employee_role_id uuid;
do $$ begin
  alter table public.profiles add constraint profiles_employee_role_id_fkey
    foreign key (employee_role_id) references public.employee_roles(id) on delete set null;
exception when duplicate_object then null; end $$;

alter table public.profiles add column if not exists client_id uuid;
do $$ begin
  alter table public.profiles add constraint profiles_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists idx_profiles_employee_role on public.profiles(employee_role_id);
create index if not exists idx_profiles_client on public.profiles(client_id);

-- Bug fix: intake drafts belong to whoever holds the session — usually an
-- anonymous visitor with no profile row — so the FK must reference auth.users
-- (which covers anonymous identities), not public.profiles.
alter table public.intake_forms drop constraint if exists intake_forms_created_by_fkey;
alter table public.intake_forms add constraint intake_forms_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
alter table public.intake_attachments drop constraint if exists intake_attachments_uploaded_by_fkey;
alter table public.intake_attachments add constraint intake_attachments_uploaded_by_fkey
  foreign key (uploaded_by) references auth.users(id) on delete set null;

-- Same issue inside submit_intake_form: it stamps clients/projects with the
-- anonymous submitter's uid, so those FKs must reference auth.users as well.
alter table public.clients drop constraint if exists clients_created_by_fkey;
alter table public.clients add constraint clients_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
alter table public.projects drop constraint if exists projects_created_by_fkey;
alter table public.projects add constraint projects_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- ── 3. Access helpers (status-aware) ─────────────────────────────────────────
create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select status = 'active' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.is_active()
    and public.current_user_role() in ('admin'::public.app_role, 'manager'::public.app_role, 'employee'::public.app_role);
$$;

create or replace function public.current_user_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.profiles where id = auth.uid();
$$;

-- Management access now additionally requires an active account.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.is_active()
    and public.current_user_role() = 'admin'::public.app_role;
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.is_active()
    and public.current_user_role() in ('admin'::public.app_role, 'manager'::public.app_role);
$$;

-- Employees keep project access only while active; clients can never be members,
-- so they can never satisfy the membership branch.
create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_manager_or_admin()
    or (public.is_active() and exists (
      select 1 from public.project_members pm
      where pm.project_id = target_project_id and pm.user_id = auth.uid()
    ))
  );
$$;

create or replace function public.can_access_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_manager_or_admin()
    or (public.is_active() and exists (
      select 1
      from public.projects p
      join public.project_members pm on pm.project_id = p.id
      where p.client_id = target_client_id and pm.user_id = auth.uid()
    ))
  );
$$;

-- The file-owner branch previously ignored account status.
create or replace function public.can_access_entity(target_type text, target_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_manager_or_admin() then return true; end if;
  if not public.is_active() then return false; end if;
  if target_type = 'project' then return public.can_access_project(target_id); end if;
  if target_type = 'client' then return public.can_access_client(target_id); end if;
  if target_type = 'task' then
    return exists (select 1 from public.tasks where id = target_id and public.can_access_project(project_id));
  end if;
  if target_type = 'file' then
    return exists (
      select 1 from public.files
      where id = target_id
        and (uploaded_by = auth.uid() or (project_id is not null and public.can_access_project(project_id)))
    );
  end if;
  return false;
end;
$$;

-- ── 4. Sign-up routing: client claim by e-mail, never implicit employee ───────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  initial_role public.app_role;
  matched_client_id uuid;
begin
  -- Do not create profiles for anonymous users
  if coalesce(new.is_anonymous, false) or coalesce(new.raw_app_meta_data->>'provider', '') = 'anonymous' then
    return new;
  end if;

  -- Serializing this check guarantees exactly one bootstrap administrator.
  perform pg_advisory_xact_lock(hashtext('agency_os_first_admin'));

  if not exists (select 1 from public.profiles) then
    initial_role := 'admin'::public.app_role;
    matched_client_id := null;
  else
    -- A person who previously submitted an intake (matched by e-mail) becomes a
    -- client and is linked to their CRM record — never an implicit employee.
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

  insert into public.profiles (id, email, full_name, role, client_id)
  values (new.id, coalesce(new.email, ''), nullif(trim(new.raw_user_meta_data->>'full_name'), ''), initial_role, matched_client_id)
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$;

-- ── 5. Admin RPCs ────────────────────────────────────────────────────────────
create or replace function public.set_user_status(target_user_id uuid, new_status text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if new_status not in ('active', 'inactive') then raise exception 'Invalid status'; end if;

  if target_user_id = auth.uid() and new_status = 'inactive'
    and (select count(*) from public.profiles where role = 'admin'::public.app_role and status = 'active') = 1 then
    raise exception 'The workspace must retain at least one active administrator';
  end if;

  update public.profiles set status = new_status, updated_at = now()
  where id = target_user_id returning * into result;
  if result.id is null then raise exception 'User not found'; end if;
  return result;
end;
$$;

create or replace function public.set_user_employee_role(target_user_id uuid, new_employee_role_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if not exists (select 1 from public.profiles where id = target_user_id and role <> 'client'::public.app_role) then
    raise exception 'Job roles can only be assigned to team members (or the user does not exist)';
  end if;
  if new_employee_role_id is not null and not exists (select 1 from public.employee_roles where id = new_employee_role_id) then
    raise exception 'Employee role not found';
  end if;

  update public.profiles set employee_role_id = new_employee_role_id, updated_at = now()
  where id = target_user_id returning * into result;
  return result;
end;
$$;

create or replace function public.set_user_client_link(target_user_id uuid, new_client_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if not exists (select 1 from public.profiles where id = target_user_id and role = 'client'::public.app_role) then
    raise exception 'A client record can only be linked to a client account';
  end if;
  if new_client_id is not null and not exists (select 1 from public.clients where id = new_client_id) then
    raise exception 'Client record not found';
  end if;

  update public.profiles set client_id = new_client_id, updated_at = now()
  where id = target_user_id returning * into result;
  return result;
end;
$$;

revoke execute on function public.set_user_status(uuid, text) from public, anon;
revoke execute on function public.set_user_employee_role(uuid, uuid) from public, anon;
revoke execute on function public.set_user_client_link(uuid, uuid) from public, anon;
grant execute on function public.set_user_status(uuid, text) to authenticated;
grant execute on function public.set_user_employee_role(uuid, uuid) to authenticated;
grant execute on function public.set_user_client_link(uuid, uuid) to authenticated;

-- ── 6. Row level security ────────────────────────────────────────────────────
alter table public.employee_roles enable row level security;

create policy employee_roles_select on public.employee_roles for select to authenticated using (true);
create policy employee_roles_insert_admin on public.employee_roles for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());
create policy employee_roles_update_admin on public.employee_roles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy employee_roles_delete_admin on public.employee_roles for delete to authenticated
  using (public.is_admin());

-- Profiles: staff see the directory; non-staff (clients) see only themselves.
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_staff_or_self on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

-- Owner-based write policies must respect account status.
drop policy if exists tasks_update_authorized on public.tasks;
create policy tasks_update_authorized on public.tasks for update to authenticated
  using (public.is_active() and (public.is_manager_or_admin() or assignee_id = auth.uid() or created_by = auth.uid()))
  with check (public.can_access_project(project_id) and (public.is_manager_or_admin() or assignee_id is null or assignee_id = auth.uid()));

drop policy if exists tasks_delete_authorized on public.tasks;
create policy tasks_delete_authorized on public.tasks for delete to authenticated
  using (public.is_active() and (public.is_manager_or_admin() or created_by = auth.uid()));

drop policy if exists files_select_authorized on public.files;
create policy files_select_authorized on public.files for select to authenticated
  using (public.is_active() and (uploaded_by = auth.uid() or (project_id is not null and public.can_access_project(project_id))));

drop policy if exists files_update_authorized on public.files;
create policy files_update_authorized on public.files for update to authenticated
  using (public.is_active() and (uploaded_by = auth.uid() or public.is_manager_or_admin()))
  with check (project_id is not null and public.can_access_project(project_id));

drop policy if exists files_delete_authorized on public.files;
create policy files_delete_authorized on public.files for delete to authenticated
  using (public.is_active() and (uploaded_by = auth.uid() or public.is_manager_or_admin()));

drop policy if exists interactions_update_management on public.interactions;
create policy interactions_update_management on public.interactions for update to authenticated
  using (public.is_active() and (public.is_manager_or_admin() or created_by = auth.uid()))
  with check (public.can_access_client(client_id));

drop policy if exists interactions_delete_management on public.interactions;
create policy interactions_delete_management on public.interactions for delete to authenticated
  using (public.is_active() and (public.is_manager_or_admin() or created_by = auth.uid()));

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments for update to authenticated
  using (public.is_active() and author_id = auth.uid())
  with check (author_id = auth.uid() and public.can_access_entity(entity_type, entity_id));

drop policy if exists comments_delete_own_or_management on public.comments;
create policy comments_delete_own_or_management on public.comments for delete to authenticated
  using (public.is_active() and (author_id = auth.uid() or public.is_manager_or_admin()));

-- Notifications are employee functionality: suspend them while inactive.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (public.is_active() and recipient_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (public.is_active() and recipient_id = auth.uid())
  with check (public.is_active() and recipient_id = auth.uid());
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (public.is_active() and recipient_id = auth.uid());

-- Only active team members can be assigned to projects (clients can never be members).
drop policy if exists project_members_insert_management on public.project_members;
create policy project_members_insert_management on public.project_members for insert to authenticated
  with check (
    public.is_manager_or_admin()
    and assigned_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = project_members.user_id
        and p.role <> 'client'::public.app_role
        and p.status = 'active'
    )
  );

-- Client accounts can read the submissions linked to their CRM record so the
-- portal can show them their own requests. This grants no write access.
create policy intake_forms_select_client on public.intake_forms for select to authenticated
  using (client_id is not null and client_id = public.current_user_client_id());

create policy intake_attachments_select_client on public.intake_attachments for select to authenticated
  using (exists (
    select 1 from public.intake_forms f
    where f.id = intake_id
      and f.client_id is not null
      and f.client_id = public.current_user_client_id()
  ));

commit;
