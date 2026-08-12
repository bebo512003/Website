-- GENERATED FILE — DO NOT EDIT DIRECTLY.
--
-- Authoritative source: supabase/migrations/*.sql (ordered by filename).
-- Regenerate with: npm run db:schema:generate
-- Verify with:     npm run db:schema:check
--
-- This snapshot intentionally contains the complete migration chain so running it
-- on an empty Supabase project produces the same functional schema as applying the
-- migrations in order. It contains no application/business seed records.
-- Included migrations (28):
--   20260808000000_secure_roles_and_projects.sql
--   20260808010000_intake_forms.sql
--   20260808020000_multi_service_public_intake.sql
--   20260808030000_fix_anonymous_profiles.sql
--   20260809000000_user_employee_architecture.sql
--   20260810000000_role_permission_system.sql
--   20260811000000_dynamic_form_builder.sql
--   20260812000000_form_sections_and_conditional.sql
--   20260813000000_team_management.sql
--   20260814000000_public_portfolio.sql
--   20260815000000_admin_only_account_creation.sql
--   20260816000000_force_password_change_and_profile_fields.sql
--   20260817000000_notification_system.sql
--   20260818000000_database_foundation_consistency.sql
--   20260819000000_account_lifecycle_hardening.sql
--   20260820000000_profile_self_service.sql
--   20260821000000_permission_enforcement.sql
--   20260822000000_form_submission_security.sql
--   20260823000000_storage_security_and_orphan_management.sql
--   20260824000000_retire_legacy_intake.sql
--   20260825000000_admin_submission_inbox.sql
--   20260826000000_submission_review_workflow.sql
--   20260827000000_controlled_submission_project_conversion.sql
--   20260828000000_project_ownership_status_lifecycle.sql
--   20260829000000_my_work_task_management.sql
--   20260830000000_project_activity_audit.sql
--   20260831000000_project_delivery_closure.sql
--   20260901000000_public_submission_tracking.sql

-- ── BEGIN MIGRATION: 20260808000000_secure_roles_and_projects.sql ─────────────────────────────────────────────
-- Agency OS production schema
-- Run this file in the Supabase SQL Editor on a new project.
-- It contains no seed users, clients, projects, tasks, files, or notifications.

begin;

create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('admin', 'manager', 'employee');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role public.app_role not null default 'employee',
  agency_name text,
  agency_website text,
  phone text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade the role column created by earlier versions of Agency OS.
alter table public.profiles alter column role drop default;
alter table public.profiles
  alter column role type public.app_role
  using (
    case lower(coalesce(role::text, 'employee'))
      when 'admin' then 'admin'::public.app_role
      when 'manager' then 'manager'::public.app_role
      else 'employee'::public.app_role
    end
  );
alter table public.profiles alter column role set default 'employee'::public.app_role;
alter table public.profiles alter column role set not null;

-- Backfill profiles for real Auth users created before this schema was installed.
insert into public.profiles (id, email, full_name, role, created_at, updated_at)
select u.id, coalesce(u.email, ''), nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
       'employee'::public.app_role, u.created_at, now()
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- An upgraded workspace with no administrator promotes its oldest real account.
update public.profiles
set role = 'admin'::public.app_role
where id = (select id from public.profiles order by created_at asc limit 1)
  and not exists (select 1 from public.profiles where role = 'admin'::public.app_role);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  type text not null default 'smb' check (type in ('enterprise', 'smb', 'individual', 'potential')),
  industry text,
  status text not null default 'active' check (status in ('active', 'inactive', 'potential')),
  contact_person text,
  contact_position text,
  email text,
  phone text,
  location text,
  website text,
  logo_url text,
  notes text,
  total_value numeric not null default 0,
  project_count integer not null default 0,
  first_project_date date,
  last_interaction_date date,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  client_id uuid not null references public.clients(id) on delete restrict,
  type text not null default 'General',
  status text not null default 'active' check (status in ('active', 'review', 'completed', 'on-hold', 'cancelled')),
  phase integer not null default 1 check (phase between 1 and 10),
  phase_name text,
  progress integer not null default 0 check (progress between 0 and 100),
  budget numeric,
  currency text not null default 'USD',
  start_date date,
  due_date date,
  completed_date date,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.projects alter column type set default 'General';
alter table public.projects alter column currency set default 'USD';

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'todo' check (status in ('todo', 'inprogress', 'review', 'done')),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  completed_date date,
  tags text[] not null default '{}',
  comments_count integer not null default 0,
  attachments_count integer not null default 0,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'document' check (type in ('image', 'pdf', 'document', 'spreadsheet', 'archive', 'video', 'other')),
  size bigint not null default 0,
  mime_type text,
  storage_path text,
  project_id uuid references public.projects(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  uploaded_by uuid references public.profiles(id) default auth.uid(),
  starred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'meeting' check (type in ('meeting', 'email', 'call', 'note', 'other')),
  title text not null,
  description text,
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  date date not null default current_date,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  entity_type text not null check (entity_type in ('project', 'task', 'client', 'file')),
  entity_id uuid not null,
  author_id uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  type text not null default 'info' check (type in ('info', 'assignment', 'project_update', 'task_update')),
  title text not null,
  message text not null,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Upgrade defaults and foreign-key behavior from early schema revisions.
alter table public.clients alter column created_by set default auth.uid();
alter table public.projects alter column created_by set default auth.uid();
alter table public.tasks alter column created_by set default auth.uid();
alter table public.files alter column uploaded_by set default auth.uid();
alter table public.interactions alter column created_by set default auth.uid();
alter table public.comments alter column author_id set default auth.uid();
alter table public.projects drop constraint if exists projects_client_id_fkey;
alter table public.projects add constraint projects_client_id_fkey foreign key (client_id) references public.clients(id) on delete restrict;

-- Legacy views were created without security_invoker and could bypass table RLS.
drop view if exists public.project_overview;
drop view if exists public.client_stats;

create index if not exists idx_projects_client on public.projects(client_id);
create index if not exists idx_projects_status on public.projects(status);
create index if not exists idx_project_members_user on public.project_members(user_id);
create index if not exists idx_tasks_project on public.tasks(project_id);
create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_tasks_assignee on public.tasks(assignee_id);
create index if not exists idx_files_project on public.files(project_id);
create index if not exists idx_interactions_client on public.interactions(client_id);
create index if not exists idx_comments_entity on public.comments(entity_type, entity_id);
create index if not exists idx_notifications_recipient on public.notifications(recipient_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications(recipient_id) where read_at is null;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'employee'::public.app_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.current_user_role() = 'admin'::public.app_role;
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.current_user_role() in ('admin'::public.app_role, 'manager'::public.app_role);
$$;

create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_manager_or_admin()
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = target_project_id and pm.user_id = auth.uid()
    )
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
    or exists (
      select 1
      from public.projects p
      join public.project_members pm on pm.project_id = p.id
      where p.client_id = target_client_id and pm.user_id = auth.uid()
    )
  );
$$;

create or replace function public.can_access_entity(target_type text, target_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_manager_or_admin() then return true; end if;
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  initial_role public.app_role;
begin
  -- Serializing this check guarantees exactly one bootstrap administrator.
  perform pg_advisory_xact_lock(hashtext('agency_os_first_admin'));
  initial_role := case when exists (select 1 from public.profiles) then 'employee'::public.app_role else 'admin'::public.app_role end;

  insert into public.profiles (id, email, full_name, role)
  values (new.id, coalesce(new.email, ''), nullif(trim(new.raw_user_meta_data->>'full_name'), ''), initial_role)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.set_user_role(target_user_id uuid, new_role public.app_role)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;

  if target_user_id = auth.uid() and new_role <> 'admin'::public.app_role
    and (select count(*) from public.profiles where role = 'admin'::public.app_role) = 1 then
    raise exception 'The workspace must retain at least one administrator';
  end if;

  update public.profiles set role = new_role, updated_at = now()
  where id = target_user_id returning * into result;
  if result.id is null then raise exception 'User not found'; end if;
  return result;
end;
$$;

create or replace function public.update_own_profile(
  new_full_name text,
  new_avatar_url text,
  new_agency_name text,
  new_agency_website text,
  new_phone text,
  new_bio text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.profiles
  set full_name = nullif(trim(new_full_name), ''),
      avatar_url = nullif(trim(new_avatar_url), ''),
      agency_name = nullif(trim(new_agency_name), ''),
      agency_website = nullif(trim(new_agency_website), ''),
      phone = nullif(trim(new_phone), ''),
      bio = nullif(trim(new_bio), ''),
      updated_at = now()
  where id = auth.uid()
  returning * into result;
  return result;
end;
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists update_profiles_updated_at on public.profiles;
drop trigger if exists update_clients_updated_at on public.clients;
drop trigger if exists update_projects_updated_at on public.projects;
drop trigger if exists update_tasks_updated_at on public.tasks;
drop trigger if exists update_files_updated_at on public.files;
drop trigger if exists update_comments_updated_at on public.comments;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles', 'clients', 'projects', 'tasks', 'files', 'comments'] loop
    execute format('drop trigger if exists %I on public.%I', 'set_' || table_name || '_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'set_' || table_name || '_updated_at', table_name);
  end loop;
end $$;

create or replace function public.notify_project_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare project_name text;
begin
  select name into project_name from public.projects where id = new.project_id;
  insert into public.notifications (recipient_id, actor_id, project_id, type, title, message, action_url)
  values (new.user_id, auth.uid(), new.project_id, 'assignment', 'New project assignment', 'You were assigned to ' || coalesce(project_name, 'a project') || '.', '/projects/' || new.project_id::text);
  return new;
end;
$$;

drop trigger if exists notify_project_assignment on public.project_members;
create trigger notify_project_assignment after insert on public.project_members
for each row execute function public.notify_project_assignment();

create or replace function public.notify_project_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.status, old.progress, old.phase, old.due_date) is distinct from (new.status, new.progress, new.phase, new.due_date) then
    insert into public.notifications (recipient_id, actor_id, project_id, type, title, message, action_url)
    select pm.user_id, auth.uid(), new.id, 'project_update', 'Project updated', new.name || ' has new progress or status information.', '/projects/' || new.id::text
    from public.project_members pm
    where pm.project_id = new.id and pm.user_id is distinct from auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists notify_project_update on public.projects;
create trigger notify_project_update after update on public.projects
for each row execute function public.notify_project_update();

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare project_name text;
begin
  if new.assignee_id is not null
    and new.assignee_id is distinct from auth.uid()
    and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
    and exists (
      select 1 from public.profiles p
      where p.id = new.assignee_id
        and (p.role in ('admin'::public.app_role, 'manager'::public.app_role)
          or exists (select 1 from public.project_members pm where pm.project_id = new.project_id and pm.user_id = new.assignee_id))
    ) then
    select name into project_name from public.projects where id = new.project_id;
    insert into public.notifications (recipient_id, actor_id, project_id, type, title, message, action_url)
    values (new.assignee_id, auth.uid(), new.project_id, 'task_update', 'New task assignment', 'You were assigned “' || new.title || '” in ' || coalesce(project_name, 'a project') || '.', '/projects/' || new.project_id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_task_assignment on public.tasks;
create trigger notify_task_assignment after insert or update of assignee_id on public.tasks
for each row execute function public.notify_task_assignment();

-- Remove every permissive development policy before installing production policies.
do $$
declare row record;
begin
  for row in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' and tablename in ('profiles','clients','projects','project_members','tasks','files','interactions','comments','notifications') loop
    execute format('drop policy if exists %I on %I.%I', row.policyname, row.schemaname, row.tablename);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.files enable row level security;
alter table public.interactions enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select_authenticated on public.profiles for select to authenticated using (auth.uid() is not null);

create policy clients_select_authorized on public.clients for select to authenticated using (public.can_access_client(id));
create policy clients_insert_management on public.clients for insert to authenticated with check (public.is_manager_or_admin() and created_by = auth.uid());
create policy clients_update_management on public.clients for update to authenticated using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());
create policy clients_delete_management on public.clients for delete to authenticated using (public.is_manager_or_admin());

create policy projects_select_authorized on public.projects for select to authenticated using (public.can_access_project(id));
create policy projects_insert_management on public.projects for insert to authenticated with check (public.is_manager_or_admin() and created_by = auth.uid());
create policy projects_update_management on public.projects for update to authenticated using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());
create policy projects_delete_management on public.projects for delete to authenticated using (public.is_manager_or_admin());

create policy project_members_select_authorized on public.project_members for select to authenticated using (public.can_access_project(project_id));
create policy project_members_insert_management on public.project_members for insert to authenticated with check (public.is_manager_or_admin() and assigned_by = auth.uid());
create policy project_members_delete_management on public.project_members for delete to authenticated using (public.is_manager_or_admin());

create policy tasks_select_authorized on public.tasks for select to authenticated using (public.can_access_project(project_id));
create policy tasks_insert_authorized on public.tasks for insert to authenticated with check (public.can_access_project(project_id) and created_by = auth.uid() and (public.is_manager_or_admin() or assignee_id is null or assignee_id = auth.uid()));
create policy tasks_update_authorized on public.tasks for update to authenticated using (public.is_manager_or_admin() or assignee_id = auth.uid() or created_by = auth.uid()) with check (public.can_access_project(project_id) and (public.is_manager_or_admin() or assignee_id is null or assignee_id = auth.uid()));
create policy tasks_delete_authorized on public.tasks for delete to authenticated using (public.is_manager_or_admin() or created_by = auth.uid());

create policy files_select_authorized on public.files for select to authenticated using (uploaded_by = auth.uid() or (project_id is not null and public.can_access_project(project_id)));
create policy files_insert_authorized on public.files for insert to authenticated with check (uploaded_by = auth.uid() and project_id is not null and public.can_access_project(project_id));
create policy files_update_authorized on public.files for update to authenticated using (uploaded_by = auth.uid() or public.is_manager_or_admin()) with check (project_id is not null and public.can_access_project(project_id));
create policy files_delete_authorized on public.files for delete to authenticated using (uploaded_by = auth.uid() or public.is_manager_or_admin());

create policy interactions_select_authorized on public.interactions for select to authenticated using ((project_id is not null and public.can_access_project(project_id)) or public.can_access_client(client_id));
create policy interactions_insert_authorized on public.interactions for insert to authenticated with check (created_by = auth.uid() and ((project_id is not null and public.can_access_project(project_id)) or public.is_manager_or_admin()));
create policy interactions_update_management on public.interactions for update to authenticated using (public.is_manager_or_admin() or created_by = auth.uid()) with check (public.can_access_client(client_id));
create policy interactions_delete_management on public.interactions for delete to authenticated using (public.is_manager_or_admin() or created_by = auth.uid());

create policy comments_select_authorized on public.comments for select to authenticated using (public.can_access_entity(entity_type, entity_id));
create policy comments_insert_authorized on public.comments for insert to authenticated with check (author_id = auth.uid() and public.can_access_entity(entity_type, entity_id));
create policy comments_update_own on public.comments for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid() and public.can_access_entity(entity_type, entity_id));
create policy comments_delete_own_or_management on public.comments for delete to authenticated using (author_id = auth.uid() or public.is_manager_or_admin());

create policy notifications_select_own on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_delete_own on public.notifications for delete to authenticated using (recipient_id = auth.uid());

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
revoke execute on function public.set_user_role(uuid, public.app_role) from public, anon;
revoke execute on function public.update_own_profile(text, text, text, text, text, text) from public, anon;
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.update_own_profile(text, text, text, text, text, text) to authenticated;
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do update set public = false;

drop policy if exists project_files_select on storage.objects;
drop policy if exists project_files_insert on storage.objects;
drop policy if exists project_files_update on storage.objects;
drop policy if exists project_files_delete on storage.objects;
create policy project_files_select on storage.objects for select to authenticated
using (bucket_id = 'project-files' and public.can_access_project(((storage.foldername(name))[1])::uuid));
create policy project_files_insert on storage.objects for insert to authenticated
with check (bucket_id = 'project-files' and owner_id = auth.uid()::text and public.can_access_project(((storage.foldername(name))[1])::uuid));
create policy project_files_update on storage.objects for update to authenticated
using (bucket_id = 'project-files' and (owner_id = auth.uid()::text or public.is_manager_or_admin()));
create policy project_files_delete on storage.objects for delete to authenticated
using (bucket_id = 'project-files' and (owner_id = auth.uid()::text or public.is_manager_or_admin()));

commit;
-- ── END MIGRATION: 20260808000000_secure_roles_and_projects.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260808010000_intake_forms.sql ─────────────────────────────────────────────
-- Structured creative-service intakes: Logo Design, Visual Identity and Company Profile.
begin;

create table if not exists public.intake_forms (
  id uuid primary key default gen_random_uuid(),
  service_type text check (service_type in ('logo_design', 'visual_identity', 'company_profile')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'archived')),
  contact_name text,
  contact_email text,
  company_name text,
  phone text,
  data jsonb not null default '{}'::jsonb,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intake_attachments (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intake_forms(id) on delete cascade,
  name text not null,
  size bigint not null default 0,
  mime_type text,
  storage_path text not null unique,
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_intake_forms_status on public.intake_forms(status, updated_at desc);
create index if not exists idx_intake_forms_contact_email on public.intake_forms(contact_email);
create index if not exists idx_intake_forms_client on public.intake_forms(client_id);
create index if not exists idx_intake_attachments_intake on public.intake_attachments(intake_id);

drop trigger if exists update_intake_forms_updated_at on public.intake_forms;
create trigger update_intake_forms_updated_at before update on public.intake_forms
for each row execute function public.set_updated_at();

alter table public.intake_forms enable row level security;
alter table public.intake_attachments enable row level security;

create policy intake_forms_select on public.intake_forms for select to authenticated
using (created_by = auth.uid() or public.is_manager_or_admin());
create policy intake_forms_insert on public.intake_forms for insert to authenticated
with check (created_by = auth.uid());
create policy intake_forms_update on public.intake_forms for update to authenticated
using (created_by = auth.uid() or public.is_manager_or_admin())
with check (created_by = auth.uid() or public.is_manager_or_admin());
create policy intake_attachments_select on public.intake_attachments for select to authenticated
using (exists (select 1 from public.intake_forms f where f.id = intake_id and (f.created_by = auth.uid() or public.is_manager_or_admin())));
create policy intake_attachments_insert on public.intake_attachments for insert to authenticated
with check (uploaded_by = auth.uid() and exists (select 1 from public.intake_forms f where f.id = intake_id and (f.created_by = auth.uid() or public.is_manager_or_admin())));
create policy intake_attachments_delete on public.intake_attachments for delete to authenticated
using (uploaded_by = auth.uid() or public.is_manager_or_admin());

-- One atomic action links a submitted intake to an existing client (matched by e-mail)
-- or creates the client, then creates the appropriate project exactly once.
create or replace function public.submit_intake_form(target_intake_id uuid)
returns public.intake_forms
language plpgsql security definer set search_path = public
as $$
declare
  form_record public.intake_forms;
  linked_client_id uuid;
  linked_project_id uuid;
  project_title text;
begin
  select * into form_record from public.intake_forms where id = target_intake_id for update;
  if not found then raise exception 'Intake form not found'; end if;
  if form_record.created_by is distinct from auth.uid() and not public.is_manager_or_admin() then
    raise exception 'Not authorized to submit this intake';
  end if;
  if form_record.service_type is null then raise exception 'Choose a service before submitting'; end if;
  if coalesce(trim(form_record.contact_name), '') = '' or coalesce(trim(form_record.company_name), '') = '' then
    raise exception 'Contact name and company name are required';
  end if;

  if form_record.project_id is not null then
    update public.intake_forms set status = 'submitted', submitted_at = coalesce(submitted_at, now()) where id = target_intake_id returning * into form_record;
    return form_record;
  end if;

  select id into linked_client_id from public.clients
  where lower(coalesce(email, '')) = lower(coalesce(form_record.contact_email, ''))
    and coalesce(trim(form_record.contact_email), '') <> ''
  order by created_at asc limit 1;

  if linked_client_id is null then
    insert into public.clients (name, type, status, contact_person, email, phone, website, industry, notes, created_by)
    values (form_record.company_name, 'potential', 'potential', form_record.contact_name, nullif(trim(form_record.contact_email), ''), nullif(trim(form_record.phone), ''), nullif(trim(form_record.data->>'website'), ''), nullif(trim(form_record.data->>'industry'), ''), 'Created automatically from intake #' || left(target_intake_id::text, 8), auth.uid())
    returning id into linked_client_id;
  end if;

  project_title := form_record.company_name || ' — ' || case form_record.service_type
    when 'logo_design' then 'Logo Design'
    when 'visual_identity' then 'Visual Identity'
    else 'Company Profile' end;
  insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
  values (project_title, 'Created automatically from intake #' || left(target_intake_id::text, 8), linked_client_id,
    case form_record.service_type when 'logo_design' then 'Logo Design' when 'visual_identity' then 'Visual Identity' else 'Company Profile' end,
    'active', 1, 'Discovery', 0, auth.uid()) returning id into linked_project_id;

  update public.intake_forms set status = 'submitted', client_id = linked_client_id, project_id = linked_project_id, submitted_at = now()
  where id = target_intake_id returning * into form_record;
  return form_record;
end;
$$;
revoke all on function public.submit_intake_form(uuid) from public, anon;
grant execute on function public.submit_intake_form(uuid) to authenticated;

insert into storage.buckets (id, name, public) values ('intake-files', 'intake-files', false)
on conflict (id) do update set public = false;
drop policy if exists intake_files_select on storage.objects;
drop policy if exists intake_files_insert on storage.objects;
drop policy if exists intake_files_delete on storage.objects;
create policy intake_files_select on storage.objects for select to authenticated using (bucket_id = 'intake-files' and owner_id = auth.uid()::text);
create policy intake_files_insert on storage.objects for insert to authenticated with check (bucket_id = 'intake-files' and owner_id = auth.uid()::text);
create policy intake_files_delete on storage.objects for delete to authenticated using (bucket_id = 'intake-files' and owner_id = auth.uid()::text);
commit;
-- ── END MIGRATION: 20260808010000_intake_forms.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260808020000_multi_service_public_intake.sql ─────────────────────────────────────────────
-- Multi-service public intake: anonymous access, service_types[], intake_projects, branching submit.
begin;

-- 1. Add service_types text[] to intake_forms for multi-service selection.
alter table public.intake_forms
  add column if not exists service_types text[] not null default '{}';

-- Backfill: if service_type is set but service_types is empty, populate it.
update public.intake_forms
  set service_types = array[service_type::text]
  where service_types = '{}' and service_type is not null;

-- 2. intake_projects – links one intake to zero, one, or many projects.
create table if not exists public.intake_projects (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intake_forms(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  service_type text not null check (service_type in ('logo_design', 'visual_identity', 'company_profile')),
  created_at timestamptz not null default now(),
  unique (intake_id, project_id)
);

create index if not exists idx_intake_projects_intake on public.intake_projects(intake_id);
create index if not exists idx_intake_projects_project on public.intake_projects(project_id);

alter table public.intake_projects enable row level security;

-- 3. RLS: allow anon + authenticated to read/write their own intake forms.
-- Drop old authenticated-only policies first.
drop policy if exists intake_forms_select on public.intake_forms;
drop policy if exists intake_forms_insert on public.intake_forms;
drop policy if exists intake_forms_update on public.intake_forms;

-- Anon & authenticated: select own forms (managers/admins see all).
create policy intake_forms_select on public.intake_forms for select
  using (created_by = auth.uid() or public.is_manager_or_admin());

-- Anon & authenticated: insert with created_by = current user.
create policy intake_forms_insert on public.intake_forms for insert
  with check (created_by = auth.uid());

-- Anon & authenticated: update own forms.
create policy intake_forms_update on public.intake_forms for update
  using (created_by = auth.uid() or public.is_manager_or_admin())
  with check (created_by = auth.uid() or public.is_manager_or_admin());

-- 4. RLS for intake_attachments: allow anon too.
drop policy if exists intake_attachments_select on public.intake_attachments;
drop policy if exists intake_attachments_insert on public.intake_attachments;
drop policy if exists intake_attachments_delete on public.intake_attachments;

create policy intake_attachments_select on public.intake_attachments for select
  using (exists (
    select 1 from public.intake_forms f
    where f.id = intake_id and (f.created_by = auth.uid() or public.is_manager_or_admin())
  ));

create policy intake_attachments_insert on public.intake_attachments for insert  to authenticated, anon
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.intake_forms f
      where f.id = intake_id and (f.created_by = auth.uid() or public.is_manager_or_admin())
    )
  );

create policy intake_attachments_delete on public.intake_attachments for delete
  using (uploaded_by = auth.uid() or public.is_manager_or_admin());

-- 5. RLS for intake_projects.
create policy intake_projects_select on public.intake_projects for select
  using (exists (
    select 1 from public.intake_forms f
    where f.id = intake_id and (f.created_by = auth.uid() or public.is_manager_or_admin())
  ));

create policy intake_projects_insert on public.intake_projects for insert
  with check (exists (
    select 1 from public.intake_forms f
    where f.id = intake_id and (f.created_by = auth.uid() or public.is_manager_or_admin())
  ));

-- 6. Storage RLS for anon: grant anon access to intake-files bucket.
drop policy if exists intake_files_select on storage.objects;
drop policy if exists intake_files_insert on storage.objects;
drop policy if exists intake_files_delete on storage.objects;

create policy intake_files_select on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'intake-files' and owner_id = auth.uid()::text);

create policy intake_files_insert on storage.objects for insert
  to authenticated, anon
  with check (bucket_id = 'intake-files' and owner_id = auth.uid()::text);

create policy intake_files_delete on storage.objects for delete
  to authenticated, anon
  using (bucket_id = 'intake-files' and owner_id = auth.uid()::text);

-- 7. Update submit_intake_form: multi-service branching with intake_projects.
drop function if exists public.submit_intake_form(uuid);

create or replace function public.submit_intake_form(target_intake_id uuid)
returns public.intake_forms
language plpgsql security definer set search_path = public
as $$
declare
  form_record public.intake_forms;
  linked_client_id uuid;
  linked_project_id uuid;
  project_title text;
  project_type text;
  services text[];
begin
  select * into form_record from public.intake_forms where id = target_intake_id for update;
  if not found then raise exception 'Intake form not found'; end if;
  if form_record.created_by is distinct from auth.uid() and not public.is_manager_or_admin() then
    raise exception 'Not authorized to submit this intake';
  end if;

  -- Determine effective service list: prefer service_types[], fallback to service_type.
  services := form_record.service_types;
  if services is null or array_length(services, 1) is null or services = '{}' then
    if form_record.service_type is not null then
      services := array[form_record.service_type::text];
    else
      raise exception 'Choose at least one service before submitting';
    end if;
  end if;

  if coalesce(trim(form_record.contact_name), '') = '' or coalesce(trim(form_record.company_name), '') = '' then
    raise exception 'Contact name and company name are required';
  end if;

  -- If already submitted (has project_id), just update status.
  if form_record.project_id is not null and not exists (select 1 from public.intake_projects where intake_id = target_intake_id) then
    update public.intake_forms set status = 'submitted', submitted_at = coalesce(submitted_at, now())
    where id = target_intake_id returning * into form_record;
    return form_record;
  end if;

  -- If intake_projects already exist, this was already processed.
  if exists (select 1 from public.intake_projects where intake_id = target_intake_id) then
    update public.intake_forms set status = 'submitted', submitted_at = coalesce(submitted_at, now())
    where id = target_intake_id returning * into form_record;
    return form_record;
  end if;

  -- Match or create client.
  select id into linked_client_id from public.clients
  where lower(coalesce(email, '')) = lower(coalesce(form_record.contact_email, ''))
    and coalesce(trim(form_record.contact_email), '') <> ''
  order by created_at asc limit 1;

  if linked_client_id is null then
    insert into public.clients (name, type, status, contact_person, email, phone, website, industry, notes, created_by)
    values (
      form_record.company_name,
      'potential',
      'potential',
      form_record.contact_name,
      nullif(trim(form_record.contact_email), ''),
      nullif(trim(form_record.phone), ''),
      nullif(trim(form_record.data->>'website'), ''),
      nullif(trim(form_record.data->>'industry'), ''),
      'Created automatically from intake #' || left(target_intake_id::text, 8),
      auth.uid()
    ) returning id into linked_client_id;
  end if;

  -- Branching logic:
  -- hasLogo = 'logo_design' in services
  -- hasIdentity = 'visual_identity' in services
  -- hasProfile = 'company_profile' in services
  -- Logo only         → 1 project: Logo Design
  -- Visual Identity only → 1 project: Visual Identity
  -- Logo + Visual Identity → 1 project: Logo + Visual Identity (combined)
  -- Company Profile   → 1 project: Company Profile
  -- All three         → 2 projects: Logo + Visual Identity AND Company Profile

  -- Case: Logo + Visual Identity (together or with Profile)
  if array['logo_design', 'visual_identity']::text[] <@ services then
    project_type := 'Logo + Visual Identity';
    project_title := form_record.company_name || ' — ' || project_type;
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      project_title,
      'Created automatically from intake #' || left(target_intake_id::text, 8),
      linked_client_id,
      project_type,
      'active', 1, 'Discovery', 0,
      auth.uid()
    ) returning id into linked_project_id;

    insert into public.intake_projects (intake_id, project_id, service_type)
    values (target_intake_id, linked_project_id, 'logo_design'),
           (target_intake_id, linked_project_id, 'visual_identity');
  end if;

  -- Case: Logo only (without Visual Identity)
  if 'logo_design' = any(services) and not ('visual_identity' = any(services)) then
    project_type := 'Logo Design';
    project_title := form_record.company_name || ' — ' || project_type;
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      project_title,
      'Created automatically from intake #' || left(target_intake_id::text, 8),
      linked_client_id,
      project_type,
      'active', 1, 'Discovery', 0,
      auth.uid()
    ) returning id into linked_project_id;

    insert into public.intake_projects (intake_id, project_id, service_type)
    values (target_intake_id, linked_project_id, 'logo_design');
  end if;

  -- Case: Visual Identity only (without Logo)
  if 'visual_identity' = any(services) and not ('logo_design' = any(services)) then
    project_type := 'Visual Identity';
    project_title := form_record.company_name || ' — ' || project_type;
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      project_title,
      'Created automatically from intake #' || left(target_intake_id::text, 8),
      linked_client_id,
      project_type,
      'active', 1, 'Discovery', 0,
      auth.uid()
    ) returning id into linked_project_id;

    insert into public.intake_projects (intake_id, project_id, service_type)
    values (target_intake_id, linked_project_id, 'visual_identity');
  end if;

  -- Case: Company Profile (always a separate project)
  if 'company_profile' = any(services) then
    project_type := 'Company Profile';
    project_title := form_record.company_name || ' — ' || project_type;
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      project_title,
      'Created automatically from intake #' || left(target_intake_id::text, 8),
      linked_client_id,
      project_type,
      'active', 1, 'Discovery', 0,
      auth.uid()
    ) returning id into linked_project_id;

    insert into public.intake_projects (intake_id, project_id, service_type)
    values (target_intake_id, linked_project_id, 'company_profile');
  end if;

  -- Store the first project_id on intake_forms for backwards compatibility.
  select project_id into linked_project_id
  from public.intake_projects where intake_id = target_intake_id
  order by created_at asc limit 1;

  update public.intake_forms
  set status = 'submitted',
      client_id = linked_client_id,
      project_id = linked_project_id,
      submitted_at = now()
  where id = target_intake_id
  returning * into form_record;

  return form_record;
end;
$$;

revoke all on function public.submit_intake_form(uuid) from public, anon;
grant execute on function public.submit_intake_form(uuid) to authenticated, anon;

commit;
-- ── END MIGRATION: 20260808020000_multi_service_public_intake.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260808030000_fix_anonymous_profiles.sql ─────────────────────────────────────────────
-- Migration: 20260808030000_fix_anonymous_profiles.sql
-- Description: Prevent anonymous users from creating rows in public.profiles,
-- allow trigger to handle converted accounts upon update, and purge orphaned anonymous profiles.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  initial_role public.app_role;
begin
  -- Do not create profiles for anonymous users
  if coalesce(new.is_anonymous, false) or coalesce(new.raw_app_meta_data->>'provider', '') = 'anonymous' then
    return new;
  end if;

  -- Serializing this check guarantees exactly one bootstrap administrator.
  perform pg_advisory_xact_lock(hashtext('agency_os_first_admin'));
  initial_role := case when exists (select 1 from public.profiles) then 'employee'::public.app_role else 'admin'::public.app_role end;

  insert into public.profiles (id, email, full_name, role)
  values (new.id, coalesce(new.email, ''), nullif(trim(new.raw_user_meta_data->>'full_name'), ''), initial_role)
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update on auth.users
for each row execute function public.handle_new_user();

-- Delete any profiles created for anonymous auth users
delete from public.profiles
where id in (
  select id from auth.users where coalesce(is_anonymous, false) or coalesce(raw_app_meta_data->>'provider', '') = 'anonymous'
);

commit;
-- ── END MIGRATION: 20260808030000_fix_anonymous_profiles.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260809000000_user_employee_architecture.sql ─────────────────────────────────────────────
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
-- ── END MIGRATION: 20260809000000_user_employee_architecture.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260810000000_role_permission_system.sql ─────────────────────────────────────────────
-- Role & permission system
--   * Roles and permissions are first-class, metadata-driven catalog rows. A role name
--     grants nothing by itself — only the permissions explicitly assigned to that role.
--   * New permissions can be added later (admin_manage can insert into `permissions`);
--     new roles can be created by an administrator and assigned to team members.
--   * Every authorization check (RLS policies, RPCs, route access) goes through
--     `has_permission(required_permission)` so backend enforcement is data-driven.

begin;

-- ── 1. Permission catalog (extensible) ──────────────────────────────────────
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  category text not null default 'general',
  description text,
  created_at timestamptz not null default now()
);

comment on table public.permissions is 'Catalog of all grantable permissions. Add rows here to introduce new capabilities; no code change is required to reuse them in RLS via has_permission().';

insert into public.permissions (key, name, category, description) values
  ('workspace.access',    'Workspace access',     'general',       'Base access to the staff workspace.'),
  ('dashboard.view',      'View dashboard',       'general',       'See the workspace overview dashboard.'),
  ('project.view',        'View projects',        'projects',      'View projects you can access.'),
  ('project.view_all',    'View all projects',    'projects',      'View every project in the workspace.'),
  ('project.create',      'Create projects',      'projects',      'Create new projects.'),
  ('project.edit',        'Edit projects',        'projects',      'Update project details, status, and progress.'),
  ('project.delete',      'Delete projects',      'projects',      'Delete projects.'),
  ('project.assign',      'Assign projects',      'projects',      'Assign employees to projects.'),
  ('client.view',         'View clients',         'clients',       'View client records you can access.'),
  ('client.view_all',     'View all clients',     'clients',       'View every client record.'),
  ('client.create',       'Create clients',       'clients',       'Create new client records.'),
  ('client.edit',         'Edit clients',         'clients',       'Update client records and interactions.'),
  ('client.delete',       'Delete clients',       'clients',       'Delete client records.'),
  ('task.view',           'View tasks',           'tasks',         'View tasks in projects you can access.'),
  ('task.create',         'Create tasks',         'tasks',         'Create tasks in accessible projects.'),
  ('task.edit',           'Edit tasks',           'tasks',         'Update tasks (status, priority, etc.).'),
  ('task.delete',         'Delete tasks',         'tasks',         'Delete tasks.'),
  ('task.assign',         'Assign tasks',         'tasks',         'Assign tasks to people.'),
  ('file.view',           'View files',           'files',         'View files in projects you can access.'),
  ('file.upload',         'Upload files',         'files',         'Upload files to accessible projects.'),
  ('file.edit',           'Edit files',           'files',         'Update and rename files.'),
  ('file.delete',         'Delete files',         'files',         'Delete files.'),
  ('submission.view',     'View submissions',     'submissions',   'View intake/submission records.'),
  ('submission.edit',     'Edit submissions',     'submissions',   'Update submission records.'),
  ('submission.assign',   'Assign submissions',   'submissions',   'Assign submissions to projects or people.'),
  ('employee.view',       'View employees',       'employees',     'View the team member directory.'),
  ('employee.edit',       'Edit employees',       'employees',     'Edit team member details.'),
  ('employee.delete',     'Delete employees',     'employees',     'Remove team members.'),
  ('employee.manage',     'Manage employees',     'employees',     'Change system roles, status, and job roles.'),
  ('role.view',           'View roles',           'access-control','View the role catalog.'),
  ('role.create',         'Create roles',         'access-control','Create new roles.'),
  ('role.edit',           'Edit roles',           'access-control','Edit roles.'),
  ('role.delete',         'Delete roles',         'access-control','Delete roles.'),
  ('role.assign_permissions', 'Assign permissions to roles', 'access-control', 'Grant or revoke permissions on roles.'),
  ('permission.view',     'View permissions',     'access-control','View the permission catalog.'),
  ('permission.manage',   'Manage permissions',   'access-control','Add or edit permissions in the catalog.'),
  ('settings.view',       'View settings',        'settings',      'Open the settings area.'),
  ('settings.edit',       'Edit system settings', 'settings',      'Change workspace settings.'),
  ('report.view',         'View reports',         'reports',       'Open the reports area.'),
  ('notification.view',   'View notifications',   'notifications', 'View your notifications inbox.'),
  ('admin.manage',        'Manage system',        'admin',         'Full system administration.'),
  ('portal.view',         'View client portal',   'portal',        'Access the client portal.')
on conflict (key) do update set
  name = excluded.name, category = excluded.category, description = excluded.description;

-- ── 2. Role catalog (extensible) ─────────────────────────────────────────────
create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_roles is 'Application roles. Permissions are granted through role_permissions, never inferred from the role name.';

drop trigger if exists set_app_roles_updated_at on public.app_roles;
create trigger set_app_roles_updated_at before update on public.app_roles
for each row execute function public.set_updated_at();

insert into public.app_roles (key, name, description, is_system) values
  ('admin',    'Admin',    'Full access, including managing roles, permissions, employees, and system settings.', true),
  ('manager',  'Manager',  'Manages projects, clients, tasks, files, and submissions. Cannot delete employees, manage admins, or change system settings.', true),
  ('employee', 'Employee', 'Team member with access to assigned projects, tasks, and files.', true),
  ('client',   'Client',   'External client account with portal-only access.', true)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, is_system = true;

-- ── 3. Role ↔ permission junction ────────────────────────────────────────────
create table if not exists public.role_permissions (
  role_id uuid not null references public.app_roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

comment on table public.role_permissions is 'Explicitly grants a permission to a role. Nothing is implied by role name.';

-- Link a profile to the role that carries its permissions.
alter table public.profiles add column if not exists role_id uuid;
do $$ begin
  alter table public.profiles add constraint profiles_role_id_fkey
    foreign key (role_id) references public.app_roles(id) on delete set null;
exception when duplicate_object then null; end $$;
create index if not exists idx_profiles_role on public.profiles(role_id);

-- Backfill existing profiles to the matching system role.
update public.profiles p
set role_id = r.id
from public.app_roles r
where r.key = p.role::text and p.role_id is null;

-- ── 4. Seed the default role → permission matrix ────────────────────────────
do $$
declare
  admin_key text := 'admin';
  manager_key text := 'manager';
  employee_key text := 'employee';
  client_key text := 'client';
  perm_row record;
begin
  -- Admin: every permission in the catalog.
  for perm_row in select p.key from public.permissions p loop
    insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.app_roles r, public.permissions p
    where r.key = admin_key and p.key = perm_row.key
    on conflict do nothing;
  end loop;

  -- Manager: full operational control minus admin/system/role-management powers.
  for perm_row in select p.key from public.permissions p
    where p.key in (
      'workspace.access','dashboard.view',
      'project.view','project.view_all','project.create','project.edit','project.delete','project.assign',
      'client.view','client.view_all','client.create','client.edit',
      'task.view','task.create','task.edit','task.delete','task.assign',
      'file.view','file.upload','file.edit','file.delete',
      'submission.view','submission.edit','submission.assign',
      'employee.view','employee.edit',
      'role.view','permission.view',
      'settings.view','report.view','notification.view'
    ) loop
    insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.app_roles r, public.permissions p
    where r.key = manager_key and p.key = perm_row.key
    on conflict do nothing;
  end loop;

  -- Employee: assigned-project operational access only.
  for perm_row in select p.key from public.permissions p
    where p.key in (
      'workspace.access','dashboard.view',
      'project.view','client.view',
      'task.view','task.edit',
      'file.view','file.upload',
      'submission.view','employee.view',
      'report.view','notification.view'
    ) loop
    insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.app_roles r, public.permissions p
    where r.key = employee_key and p.key = perm_row.key
    on conflict do nothing;
  end loop;

  -- Client: portal only.
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.app_roles r, public.permissions p
  where r.key = client_key and p.key = 'portal.view'
  on conflict do nothing;
end $$;

-- ── 5. Authorization helpers ─────────────────────────────────────────────────
-- Effective role of the current user: the profile's assigned role, or (for
-- legacy/back-compat) the system role matching the profile's role enum.
create or replace function public.user_role_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role_id from public.profiles p where p.id = auth.uid()),
    (select r.id from public.app_roles r where r.key = public.current_user_role()::text and r.is_system)
  );
$$;

create or replace function public.get_user_permissions()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.key order by p.key), array[]::text[])
  from public.app_roles r
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id
  where r.id = public.user_role_id() and r.is_active;
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
    and required_permission = any(public.get_user_permissions());
$$;

-- Staff identity is now itself permission-driven: no permission, no staff access.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.is_active()
    and public.has_permission('workspace.access');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('admin.manage');
$$;

-- Kept for legacy callers (e.g. intake policies): managers/admins see all projects.
create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('admin.manage') or public.has_permission('project.view_all');
$$;

create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.has_permission('project.view')
    and (
      public.has_permission('project.view_all')
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
  select auth.uid() is not null
    and public.has_permission('client.view')
    and (
      public.has_permission('client.view_all')
      or (public.is_active() and exists (
        select 1 from public.projects p
        join public.project_members pm on pm.project_id = p.id
        where p.client_id = target_client_id and pm.user_id = auth.uid()
      ))
    );
$$;

create or replace function public.can_access_entity(target_type text, target_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active() then return false; end if;
  if public.has_permission('admin.manage') then return true; end if;
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

-- Keep profiles.role (legacy enum) and profiles.role_id consistent: system roles
-- map 1:1 onto the enum; custom roles only touch role_id.
create or replace function public.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare role_key text;
begin
  if new.role_id is not null then
    select key into role_key from public.app_roles where id = new.role_id;
    if role_key in ('admin', 'manager', 'employee', 'client') then
      new.role := role_key::public.app_role;
    end if;
  end if;
  if new.role_id is null and new.role is not null then
    select id into new.role_id from public.app_roles where key = new.role::text and is_system;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_profile_role on public.profiles;
create trigger sync_profile_role before insert or update of role, role_id on public.profiles
for each row execute function public.sync_profile_role();

-- ── 6. Sign-up routing sets the assigned role too ────────────────────────────
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
begin
  if coalesce(new.is_anonymous, false) or coalesce(new.raw_app_meta_data->>'provider', '') = 'anonymous' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('agency_os_first_admin'));

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

-- ── 7. Role/permission management RPCs (permission-gated) ────────────────────
create or replace function public.list_permissions()
returns setof public.permissions
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('permission.view') and not public.has_permission('admin.manage') then
    return;
  end if;
  return query select * from public.permissions order by category, name;
end;
$$;

create or replace function public.list_roles()
returns table (id uuid, key text, name text, description text, is_system boolean, is_active boolean, permission_keys text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('role.view') and not public.has_permission('admin.manage') then
    return;
  end if;
  return query
    select r.id, r.key, r.name, r.description, r.is_system, r.is_active,
      coalesce(array_agg(distinct p.key order by p.key) filter (where p.key is not null), array[]::text[])
    from public.app_roles r
    left join public.role_permissions rp on rp.role_id = r.id
    left join public.permissions p on p.id = rp.permission_id
    group by r.id
    order by r.is_system desc, r.name;
end;
$$;

create or replace function public.create_app_role(p_name text, p_description text)
returns public.app_roles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.app_roles;
  p_key text;
begin
  if not public.has_permission('role.create') then raise exception 'Permission denied: role.create'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Role name is required'; end if;
  p_key := lower(regexp_replace(trim(p_name), '[^a-z0-9]+', '_', 'gi'));
  p_key := regexp_replace(p_key, '^_+|_+$', '', 'g') || '_role';
  insert into public.app_roles (key, name, description, created_by)
  values (p_key, trim(p_name), nullif(trim(p_description), ''), auth.uid())
  returning * into result;
  return result;
end;
$$;

create or replace function public.update_app_role(p_role_id uuid, p_name text, p_description text, p_is_active boolean)
returns public.app_roles
language plpgsql
security definer
set search_path = public
as $$
declare result public.app_roles;
begin
  if not public.has_permission('role.edit') then raise exception 'Permission denied: role.edit'; end if;
  if not exists (select 1 from public.app_roles where id = p_role_id) then raise exception 'Role not found'; end if;
  update public.app_roles
  set name = coalesce(nullif(trim(p_name), ''), name),
      description = nullif(trim(p_description), ''),
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
  where id = p_role_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.delete_app_role(p_role_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('role.delete') then raise exception 'Permission denied: role.delete'; end if;
  if (select is_system from public.app_roles where id = p_role_id) then
    raise exception 'System roles cannot be deleted';
  end if;
  delete from public.app_roles where id = p_role_id;
  return found;
end;
$$;

create or replace function public.set_role_permissions(p_role_id uuid, p_permission_keys text[])
returns public.app_roles
language plpgsql
security definer
set search_path = public
as $$
declare result public.app_roles;
begin
  if not public.has_permission('role.assign_permissions') then raise exception 'Permission denied: role.assign_permissions'; end if;
  if not exists (select 1 from public.app_roles where id = p_role_id) then raise exception 'Role not found'; end if;
  delete from public.role_permissions where role_id = p_role_id;
  if p_permission_keys is not null then
    insert into public.role_permissions (role_id, permission_id)
    select p_role_id, p.id from public.permissions p where p.key = any(p_permission_keys)
    on conflict do nothing;
  end if;
  select * into result from public.app_roles where id = p_role_id;
  return result;
end;
$$;

create or replace function public.assign_user_role(p_user_id uuid, p_role_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare result public.profiles;
begin
  if not public.has_permission('employee.manage') then raise exception 'Permission denied: employee.manage'; end if;
  if not exists (select 1 from public.app_roles where id = p_role_id and is_active) then
    raise exception 'Role not found or inactive';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role <> 'client'::public.app_role) then
    raise exception 'Only team members can be assigned a role';
  end if;
  if p_user_id = auth.uid() and p_role_id <> (select id from public.app_roles where key = 'admin')
     and (select count(*) from public.profiles where role_id = (select id from public.app_roles where key = 'admin')) = 1 then
    raise exception 'The workspace must retain at least one administrator';
  end if;
  update public.profiles set role_id = p_role_id, updated_at = now()
  where id = p_user_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.add_permission(p_key text, p_name text, p_category text, p_description text)
returns public.permissions
language plpgsql
security definer
set search_path = public
as $$
declare result public.permissions;
begin
  if not public.has_permission('permission.manage') then raise exception 'Permission denied: permission.manage'; end if;
  if nullif(trim(p_key), '') is null or nullif(trim(p_name), '') is null then
    raise exception 'Permission key and name are required';
  end if;
  insert into public.permissions (key, name, category, description)
  values (lower(trim(p_key)), trim(p_name), coalesce(nullif(trim(p_category), ''), 'general'), nullif(trim(p_description), ''))
  on conflict (key) do update set
    name = excluded.name, category = excluded.category, description = excluded.description
  returning * into result;
  return result;
end;
$$;

-- ── 8. Existing admin RPCs now require permissions (not role names) ──────────
create or replace function public.set_user_role(target_user_id uuid, new_role public.app_role)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
  target_role_id uuid;
begin
  if not public.has_permission('employee.manage') then raise exception 'Administrator access required'; end if;

  if target_user_id = auth.uid() and new_role <> 'admin'::public.app_role
    and (select count(*) from public.profiles where role = 'admin'::public.app_role) = 1 then
    raise exception 'The workspace must retain at least one administrator';
  end if;

  select id into target_role_id from public.app_roles where key = new_role::text and is_system;

  update public.profiles set role = new_role, role_id = target_role_id, updated_at = now()
  where id = target_user_id returning * into result;
  if result.id is null then raise exception 'User not found'; end if;
  return result;
end;
$$;

create or replace function public.set_user_status(target_user_id uuid, new_status text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare result public.profiles;
begin
  if not public.has_permission('employee.manage') then raise exception 'Administrator access required'; end if;
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
declare result public.profiles;
begin
  if not public.has_permission('employee.manage') then raise exception 'Administrator access required'; end if;
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
declare result public.profiles;
begin
  if not public.has_permission('employee.manage') then raise exception 'Administrator access required'; end if;
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

revoke all on function public.list_permissions() from public, anon;
revoke all on function public.list_roles() from public, anon;
revoke all on function public.create_app_role(text, text) from public, anon;
revoke all on function public.update_app_role(uuid, text, text, boolean) from public, anon;
revoke all on function public.delete_app_role(uuid) from public, anon;
revoke all on function public.set_role_permissions(uuid, text[]) from public, anon;
revoke all on function public.assign_user_role(uuid, uuid) from public, anon;
revoke all on function public.add_permission(text, text, text, text) from public, anon;
revoke all on function public.set_user_role(uuid, public.app_role) from public, anon;
revoke all on function public.set_user_status(uuid, text) from public, anon;
revoke all on function public.set_user_employee_role(uuid, uuid) from public, anon;
revoke all on function public.set_user_client_link(uuid, uuid) from public, anon;

grant execute on function public.list_permissions() to authenticated;
grant execute on function public.list_roles() to authenticated;
grant execute on function public.create_app_role(text, text) to authenticated;
grant execute on function public.update_app_role(uuid, text, text, boolean) to authenticated;
grant execute on function public.delete_app_role(uuid) to authenticated;
grant execute on function public.set_role_permissions(uuid, text[]) to authenticated;
grant execute on function public.assign_user_role(uuid, uuid) to authenticated;
grant execute on function public.add_permission(text, text, text, text) to authenticated;
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.set_user_status(uuid, text) to authenticated;
grant execute on function public.set_user_employee_role(uuid, uuid) to authenticated;
grant execute on function public.set_user_client_link(uuid, uuid) to authenticated;

grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.get_user_permissions() to authenticated;
grant execute on function public.user_role_id() to authenticated;

-- ── 9. Row level security ────────────────────────────────────────────────────
alter table public.permissions enable row level security;
alter table public.app_roles enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions for select to authenticated
  using (public.is_active() and public.is_staff());
drop policy if exists permissions_manage on public.permissions;
create policy permissions_manage on public.permissions for all to authenticated
  using (public.has_permission('permission.manage'))
  with check (public.has_permission('permission.manage'));

drop policy if exists app_roles_select on public.app_roles;
create policy app_roles_select on public.app_roles for select to authenticated
  using (public.is_active() and public.is_staff());
drop policy if exists app_roles_insert on public.app_roles;
create policy app_roles_insert on public.app_roles for insert to authenticated
  with check (public.has_permission('role.create') and created_by = auth.uid());
drop policy if exists app_roles_update on public.app_roles;
create policy app_roles_update on public.app_roles for update to authenticated
  using (public.has_permission('role.edit')) with check (public.has_permission('role.edit'));
drop policy if exists app_roles_delete on public.app_roles;
create policy app_roles_delete on public.app_roles for delete to authenticated
  using (public.has_permission('role.delete'));

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (public.is_active() and public.is_staff());
drop policy if exists role_permissions_insert on public.role_permissions;
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check (public.has_permission('role.assign_permissions'));
drop policy if exists role_permissions_delete on public.role_permissions;
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using (public.has_permission('role.assign_permissions'));

-- Profiles: staff see the directory; non-staff see themselves.
drop policy if exists profiles_select_staff_or_self on public.profiles;
create policy profiles_select_staff_or_self on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

-- Job roles (employee_roles) are a job-title catalog managed by admins.
drop policy if exists employee_roles_select on public.employee_roles;
create policy employee_roles_select on public.employee_roles for select to authenticated
  using (public.is_active() and public.is_staff());
drop policy if exists employee_roles_insert_admin on public.employee_roles;
create policy employee_roles_insert_admin on public.employee_roles for insert to authenticated
  with check (public.has_permission('employee.manage') and created_by = auth.uid());
drop policy if exists employee_roles_update_admin on public.employee_roles;
create policy employee_roles_update_admin on public.employee_roles for update to authenticated
  using (public.has_permission('employee.manage')) with check (public.has_permission('employee.manage'));
drop policy if exists employee_roles_delete_admin on public.employee_roles;
create policy employee_roles_delete_admin on public.employee_roles for delete to authenticated
  using (public.has_permission('employee.manage'));

-- Clients
drop policy if exists clients_insert_management on public.clients;
create policy clients_insert_management on public.clients for insert to authenticated
  with check (public.has_permission('client.create') and created_by = auth.uid());
drop policy if exists clients_update_management on public.clients;
create policy clients_update_management on public.clients for update to authenticated
  using (public.has_permission('client.edit')) with check (public.has_permission('client.edit'));
drop policy if exists clients_delete_management on public.clients;
create policy clients_delete_management on public.clients for delete to authenticated
  using (public.has_permission('client.delete'));

-- Projects
drop policy if exists projects_insert_management on public.projects;
create policy projects_insert_management on public.projects for insert to authenticated
  with check (public.has_permission('project.create') and created_by = auth.uid());
drop policy if exists projects_update_management on public.projects;
create policy projects_update_management on public.projects for update to authenticated
  using (public.has_permission('project.edit')) with check (public.has_permission('project.edit'));
drop policy if exists projects_delete_management on public.projects;
create policy projects_delete_management on public.projects for delete to authenticated
  using (public.has_permission('project.delete'));

-- Project members
drop policy if exists project_members_insert_management on public.project_members;
create policy project_members_insert_management on public.project_members for insert to authenticated
  with check (
    public.has_permission('project.assign')
    and assigned_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = project_members.user_id
        and p.role <> 'client'::public.app_role
        and p.status = 'active'
    )
  );
drop policy if exists project_members_delete_management on public.project_members;
create policy project_members_delete_management on public.project_members for delete to authenticated
  using (public.has_permission('project.assign'));

-- Tasks
drop policy if exists tasks_insert_authorized on public.tasks;
create policy tasks_insert_authorized on public.tasks for insert to authenticated
  with check (
    public.has_permission('task.create')
    and public.can_access_project(project_id)
    and created_by = auth.uid()
    and (public.has_permission('task.assign') or assignee_id is null or assignee_id = auth.uid())
  );
drop policy if exists tasks_update_authorized on public.tasks;
create policy tasks_update_authorized on public.tasks for update to authenticated
  using (public.is_active() and (public.has_permission('task.edit') or assignee_id = auth.uid() or created_by = auth.uid()))
  with check (
    public.can_access_project(project_id)
    and (public.has_permission('task.edit') or assignee_id = auth.uid() or (assignee_id is null and created_by = auth.uid()))
  );
drop policy if exists tasks_delete_authorized on public.tasks;
create policy tasks_delete_authorized on public.tasks for delete to authenticated
  using (public.is_active() and public.has_permission('task.delete'));

-- Files
drop policy if exists files_select_authorized on public.files;
create policy files_select_authorized on public.files for select to authenticated
  using (public.is_active() and public.has_permission('file.view') and (uploaded_by = auth.uid() or (project_id is not null and public.can_access_project(project_id))));
drop policy if exists files_insert_authorized on public.files;
create policy files_insert_authorized on public.files for insert to authenticated
  with check (public.has_permission('file.upload') and uploaded_by = auth.uid() and project_id is not null and public.can_access_project(project_id));
drop policy if exists files_update_authorized on public.files;
create policy files_update_authorized on public.files for update to authenticated
  using (public.is_active() and public.has_permission('file.edit'))
  with check (project_id is not null and public.can_access_project(project_id));
drop policy if exists files_delete_authorized on public.files;
create policy files_delete_authorized on public.files for delete to authenticated
  using (public.is_active() and public.has_permission('file.delete'));

-- Interactions
drop policy if exists interactions_update_management on public.interactions;
create policy interactions_update_management on public.interactions for update to authenticated
  using (public.is_active() and (public.has_permission('client.edit') or created_by = auth.uid()))
  with check (public.can_access_client(client_id));
drop policy if exists interactions_delete_management on public.interactions;
create policy interactions_delete_management on public.interactions for delete to authenticated
  using (public.is_active() and (public.has_permission('client.edit') or created_by = auth.uid()));

-- Comments
drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments for update to authenticated
  using (public.is_active() and author_id = auth.uid())
  with check (author_id = auth.uid() and public.can_access_entity(entity_type, entity_id));
drop policy if exists comments_delete_own_or_management on public.comments;
create policy comments_delete_own_or_management on public.comments for delete to authenticated
  using (public.is_active() and (author_id = auth.uid() or public.is_admin()));

-- Notifications
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (public.is_active() and public.has_permission('notification.view') and recipient_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (public.is_active() and public.has_permission('notification.view') and recipient_id = auth.uid())
  with check (public.is_active() and public.has_permission('notification.view') and recipient_id = auth.uid());
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (public.is_active() and public.has_permission('notification.view') and recipient_id = auth.uid());

-- Intake submissions: staff who can view/edit submissions see them in addition to
-- the anonymous/own rules already defined by earlier migrations.
drop policy if exists intake_forms_select_staff on public.intake_forms;
create policy intake_forms_select_staff on public.intake_forms for select to authenticated
  using (public.has_permission('submission.view'));
drop policy if exists intake_forms_update_staff on public.intake_forms;
create policy intake_forms_update_staff on public.intake_forms for update to authenticated
  using (public.has_permission('submission.edit')) with check (public.has_permission('submission.edit'));

-- Storage: project files
drop policy if exists project_files_select on storage.objects;
create policy project_files_select on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.has_permission('file.view') and public.can_access_project(((storage.foldername(name))[1])::uuid));
drop policy if exists project_files_insert on storage.objects;
create policy project_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and owner_id = auth.uid()::text and public.has_permission('file.upload') and public.can_access_project(((storage.foldername(name))[1])::uuid));
drop policy if exists project_files_update on storage.objects;
create policy project_files_update on storage.objects for update to authenticated
  using (bucket_id = 'project-files' and (owner_id = auth.uid()::text or public.has_permission('file.edit')));
drop policy if exists project_files_delete on storage.objects;
create policy project_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and (owner_id = auth.uid()::text or public.has_permission('file.delete')));

commit;
-- ── END MIGRATION: 20260810000000_role_permission_system.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260811000000_dynamic_form_builder.sql ─────────────────────────────────────────────
-- Dynamic form builder (Phase D of docs/architecture-review-and-plan.md)
--   * Admins design forms (templates + questions) from the website — no code changes.
--   * Published forms render publicly at /f/<slug> and are answered by anyone.
--   * Answers are stored with a full per-question snapshot, so later edits to a
--     question never rewrite history.
--   * Authorization follows the metadata model: a new `form.manage` permission
--     (granted to Admin by default, grantable to any role from the admin UI).
begin;

-- ── 1. Permission key (extensible catalog — grant admin like every other key) ─
insert into public.permissions (key, name, category, description) values
  ('form.manage', 'Manage forms', 'forms', 'Create, edit, publish, duplicate, archive and delete dynamic forms and their questions.')
on conflict (key) do update set
  name = excluded.name, category = excluded.category, description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r, public.permissions p
where r.key = 'admin' and p.key = 'form.manage'
on conflict do nothing;

-- ── 2. Tables ────────────────────────────────────────────────────────────────
create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  -- draft: being built · published: live at /f/<slug> · disabled: paused · archived: soft-deleted
  status text not null default 'draft' check (status in ('draft', 'published', 'disabled', 'archived')),
  version integer not null default 1,
  -- Free-form per-form behaviour flags (e.g. {"create_project_on_submit": true}).
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.form_templates is 'Admin-designed dynamic forms. The frontend renders questions from form_questions; nothing is hardcoded per form.';

-- To add a new question type later: extend this CHECK list, register the type in
-- lib/forms/question-types.ts, and add a render/validation branch — that is all.
create table if not exists public.form_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.form_templates(id) on delete cascade,
  question_type text not null check (question_type in (
    'short_text', 'long_text', 'single_choice', 'multiple_choice', 'yes_no',
    'dropdown', 'number', 'date', 'file_upload', 'rating'
  )),
  label text not null,
  help_text text,
  placeholder text,
  required boolean not null default false,
  -- Choice options: jsonb array of strings, e.g. ["Option A", "Option B"].
  options jsonb not null default '[]'::jsonb,
  -- Type-specific knobs, e.g. {"rating_max": 10}. Validated in submit_dynamic_form.
  config jsonb not null default '{}'::jsonb,
  -- Optional mapping of an answer onto the respondent/contact columns so the
  -- automation can match or create the CRM client record.
  map_to text check (map_to in ('name', 'email', 'phone', 'company')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_form_questions_form on public.form_questions(form_id, position);
create index if not exists idx_form_templates_status on public.form_templates(status, updated_at desc);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.form_templates(id) on delete cascade,
  form_version integer not null default 1,
  status text not null default 'submitted' check (status in ('submitted', 'archived')),
  respondent_name text,
  respondent_email text,
  respondent_phone text,
  company_name text,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_form_submissions_form on public.form_submissions(form_id, submitted_at desc);
create index if not exists idx_form_submissions_email on public.form_submissions(respondent_email);

create table if not exists public.form_submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  question_id uuid references public.form_questions(id) on delete set null,
  -- Full copy of the question (label/type/options/required/position/version) as it
  -- was when answered — editing or deleting the question later keeps history intact.
  question_snapshot jsonb not null,
  value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_form_answers_submission on public.form_submission_answers(submission_id);

create table if not exists public.form_submission_attachments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  question_id uuid references public.form_questions(id) on delete set null,
  name text not null,
  size bigint not null default 0,
  mime_type text,
  storage_path text not null unique,
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_form_attachments_submission on public.form_submission_attachments(submission_id);

drop trigger if exists form_templates_updated_at on public.form_templates;
create trigger form_templates_updated_at before update on public.form_templates
for each row execute function public.set_updated_at();
drop trigger if exists form_questions_updated_at on public.form_questions;
create trigger form_questions_updated_at before update on public.form_questions
for each row execute function public.set_updated_at();
drop trigger if exists form_submissions_updated_at on public.form_submissions;
create trigger form_submissions_updated_at before update on public.form_submissions
for each row execute function public.set_updated_at();

-- Any structural question change bumps the parent form version, so each
-- submission's form_version genuinely identifies the question set it answered.
create or replace function public.bump_form_template_version()
returns trigger
language plpgsql
as $$
begin
  update public.form_templates
  set version = version + 1
  where id = coalesce(new.form_id, old.form_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists form_questions_bump_version on public.form_questions;
create trigger form_questions_bump_version after insert or update or delete on public.form_questions
for each row execute function public.bump_form_template_version();

-- A form with collected answers cannot be hard-deleted; archive it instead.
create or replace function public.guard_form_template_delete()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.form_submissions where form_id = old.id) then
    raise exception 'This form has submissions and cannot be deleted. Archive it instead.';
  end if;
  return old;
end;
$$;

drop trigger if exists form_templates_guard_delete on public.form_templates;
create trigger form_templates_guard_delete before delete on public.form_templates
for each row execute function public.guard_form_template_delete();

-- ── 3. Row level security ────────────────────────────────────────────────────
alter table public.form_templates enable row level security;
alter table public.form_questions enable row level security;
alter table public.form_submissions enable row level security;
alter table public.form_submission_answers enable row level security;
alter table public.form_submission_attachments enable row level security;

-- Templates: published forms are publicly readable (the renderer needs them);
-- every status is readable/writable by permission holders.
drop policy if exists form_templates_select_public on public.form_templates;
create policy form_templates_select_public on public.form_templates for select to anon, authenticated
using (status = 'published');
drop policy if exists form_templates_select_manage on public.form_templates;
create policy form_templates_select_manage on public.form_templates for select to authenticated
using (public.has_permission('form.manage'));
drop policy if exists form_templates_insert_manage on public.form_templates;
create policy form_templates_insert_manage on public.form_templates for insert to authenticated
with check (public.has_permission('form.manage'));
drop policy if exists form_templates_update_manage on public.form_templates;
create policy form_templates_update_manage on public.form_templates for update to authenticated
using (public.has_permission('form.manage')) with check (public.has_permission('form.manage'));
drop policy if exists form_templates_delete_manage on public.form_templates;
create policy form_templates_delete_manage on public.form_templates for delete to authenticated
using (public.has_permission('form.manage'));

-- Questions follow their parent form's visibility.
drop policy if exists form_questions_select_public on public.form_questions;
create policy form_questions_select_public on public.form_questions for select to anon, authenticated
using (exists (select 1 from public.form_templates t where t.id = form_questions.form_id and t.status = 'published'));
drop policy if exists form_questions_select_manage on public.form_questions;
create policy form_questions_select_manage on public.form_questions for select to authenticated
using (public.has_permission('form.manage'));
drop policy if exists form_questions_insert_manage on public.form_questions;
create policy form_questions_insert_manage on public.form_questions for insert to authenticated
with check (public.has_permission('form.manage'));
drop policy if exists form_questions_update_manage on public.form_questions;
create policy form_questions_update_manage on public.form_questions for update to authenticated
using (public.has_permission('form.manage')) with check (public.has_permission('form.manage'));
drop policy if exists form_questions_delete_manage on public.form_questions;
create policy form_questions_delete_manage on public.form_questions for delete to authenticated
using (public.has_permission('form.manage'));

-- Submissions: inserts happen only inside submit_dynamic_form (security definer).
-- Staff with submission.view read all; the original submitter can re-read their own.
drop policy if exists form_submissions_select_staff on public.form_submissions;
create policy form_submissions_select_staff on public.form_submissions for select to authenticated
using (public.has_permission('submission.view'));
drop policy if exists form_submissions_select_owner on public.form_submissions;
create policy form_submissions_select_owner on public.form_submissions for select to anon, authenticated
using (created_by is not null and created_by = auth.uid());
drop policy if exists form_submissions_update_staff on public.form_submissions;
create policy form_submissions_update_staff on public.form_submissions for update to authenticated
using (public.has_permission('submission.edit')) with check (public.has_permission('submission.edit'));
drop policy if exists form_submissions_delete_staff on public.form_submissions;
create policy form_submissions_delete_staff on public.form_submissions for delete to authenticated
using (public.has_permission('submission.edit'));

-- Answers & attachments are readable exactly when their parent submission is.
drop policy if exists form_answers_select on public.form_submission_answers;
create policy form_answers_select on public.form_submission_answers for select to anon, authenticated
using (exists (
  select 1 from public.form_submissions s
  where s.id = submission_id
    and (public.has_permission('submission.view') or (s.created_by is not null and s.created_by = auth.uid()))
));
drop policy if exists form_attachments_select on public.form_submission_attachments;
create policy form_attachments_select on public.form_submission_attachments for select to anon, authenticated
using (exists (
  select 1 from public.form_submissions s
  where s.id = submission_id
    and (public.has_permission('submission.view') or (s.created_by is not null and s.created_by = auth.uid()))
));

-- ── 4. Admin RPCs (permission-gated, security definer like the rest) ─────────
-- Duplicate a form together with its questions. The copy starts as a draft.
create or replace function public.duplicate_form_template(p_form_id uuid)
returns public.form_templates
language plpgsql security definer set search_path = public
as $$
declare
  source public.form_templates;
  new_form public.form_templates;
begin
  if not public.has_permission('form.manage') then
    raise exception 'Not authorized to manage forms';
  end if;
  select * into source from public.form_templates where id = p_form_id;
  if not found then raise exception 'Form not found'; end if;

  insert into public.form_templates (slug, title, description, status, settings, created_by)
  values (
    source.slug || '-copy-' || left(replace(gen_random_uuid()::text, '-', ''), 8),
    source.title || ' (Copy)',
    source.description,
    'draft',
    source.settings,
    auth.uid()
  )
  returning * into new_form;

  insert into public.form_questions
    (form_id, question_type, label, help_text, placeholder, required, options, config, map_to, position)
  select new_form.id, question_type, label, help_text, placeholder, required, options, config, map_to, position
  from public.form_questions
  where form_id = source.id
  order by position;

  return new_form;
end;
$$;
revoke all on function public.duplicate_form_template(uuid) from public, anon;
grant execute on function public.duplicate_form_template(uuid) to authenticated;

-- Atomically persist the builder's drag order.
create or replace function public.reorder_form_questions(p_form_id uuid, p_question_ids uuid[])
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  expected integer;
  idx integer;
begin
  if not public.has_permission('form.manage') then
    raise exception 'Not authorized to manage forms';
  end if;
  select count(*) into expected from public.form_questions where form_id = p_form_id;
  if expected <> coalesce(array_length(p_question_ids, 1), 0)
     or exists (select 1 from unnest(p_question_ids) qid where not exists (
       select 1 from public.form_questions q where q.id = qid and q.form_id = p_form_id)) then
    raise exception 'Question list does not match this form';
  end if;
  for idx in 1..coalesce(array_length(p_question_ids, 1), 0) loop
    update public.form_questions set position = idx where id = p_question_ids[idx];
  end loop;
  return expected;
end;
$$;
revoke all on function public.reorder_form_questions(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_form_questions(uuid, uuid[]) to authenticated;

-- ── 5. Public submit RPC ─────────────────────────────────────────────────────
-- Validates the answers against the live question set, snapshots each question,
-- matches or creates the CRM client record, and (optionally) opens a project.
-- p_answers shape: { "<question_id>": value } where value is a JSON string for
-- text/date/number/choice/rating/yes_no, a JSON array of strings for
-- multiple_choice, or a JSON array of {storage_path,name,size,mime_type} for
-- file_upload questions.
create or replace function public.submit_dynamic_form(p_form_id uuid, p_answers jsonb)
returns public.form_submissions
language plpgsql security definer set search_path = public
as $$
declare
  form_rec public.form_templates;
  q public.form_questions;
  val jsonb;
  txt text;
  is_empty boolean;
  missing text[];
  submission_rec public.form_submissions;
  linked_client_id uuid;
  linked_project_id uuid;
  file_item jsonb;
  file_path text;
  rating_max integer;
begin
  select * into form_rec from public.form_templates where id = p_form_id;
  if not found then raise exception 'Form not found'; end if;
  if form_rec.status <> 'published' then
    raise exception 'This form is not accepting submissions';
  end if;

  for q in
    select * from public.form_questions where form_id = p_form_id order by position, created_at
  loop
    val := p_answers -> q.id::text;
    is_empty := val is null
      or val = 'null'::jsonb
      or (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') = '')
      or (jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 0);

    if q.required and is_empty then
      missing := coalesce(missing, '{}') || q.label;
      continue;
    end if;

    if not is_empty then
      -- Server-side validation guards against tampered clients.
      if q.question_type in ('single_choice', 'dropdown') then
        if jsonb_typeof(val) <> 'string'
           or not exists (select 1 from jsonb_array_elements_text(q.options) o where o = val #>> '{}') then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'multiple_choice' then
        if jsonb_typeof(val) <> 'array'
           or exists (select 1 from jsonb_array_elements_text(val) v where not exists (
                select 1 from jsonb_array_elements_text(q.options) o where o = v)) then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'yes_no' then
        if jsonb_typeof(val) <> 'string' or (val #>> '{}') not in ('yes', 'no') then
          raise exception 'Invalid answer for "%"', q.label;
        end if;
      elsif q.question_type = 'number' then
        if jsonb_typeof(val) <> 'number' and (jsonb_typeof(val) <> 'string' or (val #>> '{}') !~ '^-?\d+(\.\d+)?$') then
          raise exception 'Invalid number for "%"', q.label;
        end if;
      elsif q.question_type = 'rating' then
        rating_max := greatest(1, least(10, coalesce(nullif(q.config ->> 'rating_max', '')::integer, 5)));
        if (val #>> '{}') !~ '^\d+$'
           or (val #>> '{}')::integer < 1
           or (val #>> '{}')::integer > rating_max then
          raise exception 'Invalid rating for "%"', q.label;
        end if;
      elsif q.question_type = 'file_upload' then
        if jsonb_typeof(val) <> 'array' then
          raise exception 'Invalid file answer for "%"', q.label;
        end if;
      end if;

      -- Contact mapping feeds the client automation below.
      txt := case when jsonb_typeof(val) = 'string' then btrim(val #>> '{}') else null end;
      if nullif(txt, '') is not null then
        if q.map_to = 'name' then submission_rec.respondent_name := txt; end if;
        if q.map_to = 'email' then submission_rec.respondent_email := lower(txt); end if;
        if q.map_to = 'phone' then submission_rec.respondent_phone := txt; end if;
        if q.map_to = 'company' then submission_rec.company_name := txt; end if;
      end if;
    end if;
  end loop;

  if missing is not null then
    raise exception 'Required questions are missing: %', array_to_string(missing, ', ');
  end if;

  -- Match an existing CRM client by e-mail, otherwise create a potential one
  -- (same automation the legacy intake uses).
  if submission_rec.respondent_email is not null then
    select id into linked_client_id
    from public.clients
    where lower(coalesce(email, '')) = submission_rec.respondent_email
    order by created_at asc
    limit 1;

    if linked_client_id is null then
      insert into public.clients (name, type, status, contact_person, email, phone, notes, created_by)
      values (
        coalesce(nullif(submission_rec.company_name, ''), nullif(submission_rec.respondent_name, ''), submission_rec.respondent_email),
        'potential',
        'potential',
        nullif(submission_rec.respondent_name, ''),
        submission_rec.respondent_email,
        nullif(submission_rec.respondent_phone, ''),
        'Created automatically from form "' || form_rec.title || '"',
        auth.uid()
      )
      returning id into linked_client_id;
    end if;
  end if;

  -- Optional per-form automation: open a project for the new request.
  if coalesce(form_rec.settings ->> 'create_project_on_submit', 'false') = 'true' and linked_client_id is not null then
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      coalesce(nullif(submission_rec.company_name, '') || ' — ', '') || form_rec.title,
      'Created automatically from a submission to form "' || form_rec.title || '"',
      linked_client_id,
      form_rec.title,
      'active', 1, 'Discovery', 0, auth.uid()
    )
    returning id into linked_project_id;
  end if;

  insert into public.form_submissions
    (form_id, form_version, status, respondent_name, respondent_email, respondent_phone, company_name, client_id, project_id, created_by)
  values (
    p_form_id, form_rec.version, 'submitted',
    submission_rec.respondent_name, submission_rec.respondent_email,
    submission_rec.respondent_phone, submission_rec.company_name,
    linked_client_id, linked_project_id, auth.uid()
  )
  returning * into submission_rec;

  -- Freeze each answer together with the question it answered.
  insert into public.form_submission_answers (submission_id, question_id, question_snapshot, value)
  select submission_rec.id, fq.id, to_jsonb(fq), p_answers -> fq.id::text
  from public.form_questions fq
  where fq.form_id = p_form_id
  order by fq.position, fq.created_at;

  -- Attach uploaded files. A path is only accepted when it lives inside the
  -- caller's own storage folder (or the caller is staff), so submissions can
  -- never point at someone else's files.
  for q in select * from public.form_questions where form_id = p_form_id and question_type = 'file_upload' loop
    val := p_answers -> q.id::text;
    if jsonb_typeof(val) = 'array' then
      for file_item in select * from jsonb_array_elements(val) loop
        file_path := file_item ->> 'storage_path';
        if file_path is not null and (
          (auth.uid() is not null and split_part(file_path, '/', 1) = auth.uid()::text)
          or public.has_permission('submission.edit')
        ) then
          insert into public.form_submission_attachments
            (submission_id, question_id, name, size, mime_type, storage_path, uploaded_by)
          values (
            submission_rec.id, q.id,
            coalesce(nullif(file_item ->> 'name', ''), 'file'),
            coalesce(nullif(file_item ->> 'size', '')::bigint, 0),
            nullif(file_item ->> 'mime_type', ''),
            file_path,
            auth.uid()
          )
          on conflict (storage_path) do nothing;
        end if;
      end loop;
    end if;
  end loop;

  return submission_rec;
end;
$$;
revoke all on function public.submit_dynamic_form(uuid, jsonb) from public, anon;
grant execute on function public.submit_dynamic_form(uuid, jsonb) to authenticated, anon;

-- ── 6. Storage: private bucket for form uploads ──────────────────────────────
insert into storage.buckets (id, name, public) values ('form-files', 'form-files', false)
on conflict (id) do update set public = false;

drop policy if exists form_files_insert on storage.objects;
create policy form_files_insert on storage.objects for insert to authenticated, anon
with check (
  bucket_id = 'form-files'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists form_files_select on storage.objects;
create policy form_files_select on storage.objects for select to authenticated, anon
using (
  bucket_id = 'form-files'
  and (owner_id = auth.uid()::text or public.has_permission('submission.view'))
);
drop policy if exists form_files_delete on storage.objects;
create policy form_files_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'form-files'
  and (owner_id = auth.uid()::text or public.has_permission('submission.edit'))
);

commit;
-- ── END MIGRATION: 20260811000000_dynamic_form_builder.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260812000000_form_sections_and_conditional.sql ─────────────────────────────────────────────
-- Form sections + conditional logic
--   * Sections are stored per-question in `form_questions.config` as `section`
--     (a plain heading string). No schema column changes are required.
--   * Conditional show/hide is stored per-question in `config` as
--     `{"show_if": {"question_id": "<uuid>", "value": "Some option"}}`.
--     A question is rendered only when the trigger question's answer equals the
--     value (single_choice / dropdown / yes_no) or, for multiple_choice, when the
--     value is among the selected options (e.g. "Other").
--   * This migration adds a visibility helper and teaches `submit_dynamic_form`
--     to skip hidden questions entirely: they are not required, not validated,
--     not snapshotted, and no file is attached for them. Forms without any
--     show_if rules behave exactly as before.
begin;

-- ── 1. Visibility helper ─────────────────────────────────────────────────────
-- Returns whether a question should be part of the current submission given the
-- answers supplied. Questions without a show_if rule are always visible.
create or replace function public.is_form_question_visible(
  p_q public.form_questions,
  p_answers jsonb
)
returns boolean
language plpgsql stable
as $$
declare
  rule jsonb;
  tid uuid;
  tval text;
  trigger_q public.form_questions;
  trigger_ans jsonb;
begin
  rule := p_q.config -> 'show_if';
  if rule is null or jsonb_typeof(rule) <> 'object' then
    return true;
  end if;
  tid := (rule ->> 'question_id')::uuid;
  tval := rule ->> 'value';
  if tid is null or tval is null then
    return true;
  end if;
  select * into trigger_q from public.form_questions where id = tid;
  if not found then
    return true;
  end if;
  trigger_ans := p_answers -> tid::text;
  if trigger_q.question_type = 'multiple_choice' then
    return exists (select 1 from jsonb_array_elements_text(trigger_ans) el where el = tval);
  end if;
  return trigger_ans is not null
     and jsonb_typeof(trigger_ans) = 'string'
     and (trigger_ans #>> '{}') = tval;
end;
$$;

-- ── 2. Updated submit RPC (skips hidden questions) ───────────────────────────
create or replace function public.submit_dynamic_form(p_form_id uuid, p_answers jsonb)
returns public.form_submissions
language plpgsql security definer set search_path = public
as $$
declare
  form_rec public.form_templates;
  q public.form_questions;
  val jsonb;
  txt text;
  is_empty boolean;
  missing text[];
  submission_rec public.form_submissions;
  linked_client_id uuid;
  linked_project_id uuid;
  file_item jsonb;
  file_path text;
  rating_max integer;
begin
  select * into form_rec from public.form_templates where id = p_form_id;
  if not found then raise exception 'Form not found'; end if;
  if form_rec.status <> 'published' then
    raise exception 'This form is not accepting submissions';
  end if;

  for q in
    select * from public.form_questions where form_id = p_form_id order by position, created_at
  loop
    -- Hidden by an unmet show-if rule: skip entirely (not required, not stored).
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    is_empty := val is null
      or val = 'null'::jsonb
      or (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') = '')
      or (jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 0);

    if q.required and is_empty then
      missing := coalesce(missing, '{}') || q.label;
      continue;
    end if;

    if not is_empty then
      -- Server-side validation guards against tampered clients.
      if q.question_type in ('single_choice', 'dropdown') then
        if jsonb_typeof(val) <> 'string'
           or not exists (select 1 from jsonb_array_elements_text(q.options) o where o = val #>> '{}') then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'multiple_choice' then
        if jsonb_typeof(val) <> 'array'
           or exists (select 1 from jsonb_array_elements_text(val) v where not exists (
                select 1 from jsonb_array_elements_text(q.options) o where o = v)) then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'yes_no' then
        if jsonb_typeof(val) <> 'string' or (val #>> '{}') not in ('yes', 'no') then
          raise exception 'Invalid answer for "%"', q.label;
        end if;
      elsif q.question_type = 'number' then
        if jsonb_typeof(val) <> 'number' and (jsonb_typeof(val) <> 'string' or (val #>> '{}') !~ '^-?\d+(\.\d+)?$') then
          raise exception 'Invalid number for "%"', q.label;
        end if;
      elsif q.question_type = 'rating' then
        rating_max := greatest(1, least(10, coalesce(nullif(q.config ->> 'rating_max', '')::integer, 5)));
        if (val #>> '{}') !~ '^\d+$'
           or (val #>> '{}')::integer < 1
           or (val #>> '{}')::integer > rating_max then
          raise exception 'Invalid rating for "%"', q.label;
        end if;
      elsif q.question_type = 'file_upload' then
        if jsonb_typeof(val) <> 'array' then
          raise exception 'Invalid file answer for "%"', q.label;
        end if;
      end if;

      -- Contact mapping feeds the client automation below.
      txt := case when jsonb_typeof(val) = 'string' then btrim(val #>> '{}') else null end;
      if nullif(txt, '') is not null then
        if q.map_to = 'name' then submission_rec.respondent_name := txt; end if;
        if q.map_to = 'email' then submission_rec.respondent_email := lower(txt); end if;
        if q.map_to = 'phone' then submission_rec.respondent_phone := txt; end if;
        if q.map_to = 'company' then submission_rec.company_name := txt; end if;
      end if;
    end if;
  end loop;

  if missing is not null then
    raise exception 'Required questions are missing: %', array_to_string(missing, ', ');
  end if;

  -- Match an existing CRM client by e-mail, otherwise create a potential one
  -- (same automation the legacy intake uses).
  if submission_rec.respondent_email is not null then
    select id into linked_client_id
    from public.clients
    where lower(coalesce(email, '')) = submission_rec.respondent_email
    order by created_at asc
    limit 1;

    if linked_client_id is null then
      insert into public.clients (name, type, status, contact_person, email, phone, notes, created_by)
      values (
        coalesce(nullif(submission_rec.company_name, ''), nullif(submission_rec.respondent_name, ''), submission_rec.respondent_email),
        'potential',
        'potential',
        nullif(submission_rec.respondent_name, ''),
        submission_rec.respondent_email,
        nullif(submission_rec.respondent_phone, ''),
        'Created automatically from form "' || form_rec.title || '"',
        auth.uid()
      )
      returning id into linked_client_id;
    end if;
  end if;

  -- Optional per-form automation: open a project for the new request.
  if coalesce(form_rec.settings ->> 'create_project_on_submit', 'false') = 'true' and linked_client_id is not null then
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      coalesce(nullif(submission_rec.company_name, '') || ' — ', '') || form_rec.title,
      'Created automatically from a submission to form "' || form_rec.title || '"',
      linked_client_id,
      form_rec.title,
      'active', 1, 'Discovery', 0, auth.uid()
    )
    returning id into linked_project_id;
  end if;

  insert into public.form_submissions
    (form_id, form_version, status, respondent_name, respondent_email, respondent_phone, company_name, client_id, project_id, created_by)
  values (
    p_form_id, form_rec.version, 'submitted',
    submission_rec.respondent_name, submission_rec.respondent_email,
    submission_rec.respondent_phone, submission_rec.company_name,
    linked_client_id, linked_project_id, auth.uid()
  )
  returning * into submission_rec;

  -- Freeze each answer together with the question it answered. Hidden
  -- questions are excluded so an unmet conditional never appears as answered.
  insert into public.form_submission_answers (submission_id, question_id, question_snapshot, value)
  select submission_rec.id, fq.id, to_jsonb(fq), p_answers -> fq.id::text
  from public.form_questions fq
  where fq.form_id = p_form_id
    and public.is_form_question_visible(fq, p_answers)
  order by fq.position, fq.created_at;

  -- Attach uploaded files. A path is only accepted when it lives inside the
  -- caller's own storage folder (or the caller is staff), so submissions can
  -- never point at someone else's files.
  for q in select * from public.form_questions where form_id = p_form_id and question_type = 'file_upload' loop
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    if jsonb_typeof(val) = 'array' then
      for file_item in select * from jsonb_array_elements(val) loop
        file_path := file_item ->> 'storage_path';
        if file_path is not null and (
          (auth.uid() is not null and split_part(file_path, '/', 1) = auth.uid()::text)
          or public.has_permission('submission.edit')
        ) then
          insert into public.form_submission_attachments
            (submission_id, question_id, name, size, mime_type, storage_path, uploaded_by)
          values (
            submission_rec.id, q.id,
            coalesce(nullif(file_item ->> 'name', ''), 'file'),
            coalesce(nullif(file_item ->> 'size', '')::bigint, 0),
            nullif(file_item ->> 'mime_type', ''),
            file_path,
            auth.uid()
          )
          on conflict (storage_path) do nothing;
        end if;
      end loop;
    end if;
  end loop;

  return submission_rec;
end;
$$;
revoke all on function public.submit_dynamic_form(uuid, jsonb) from public, anon;
grant execute on function public.submit_dynamic_form(uuid, jsonb) to authenticated, anon;

commit;
-- ── END MIGRATION: 20260812000000_form_sections_and_conditional.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260813000000_team_management.sql ─────────────────────────────────────────────
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
-- ── END MIGRATION: 20260813000000_team_management.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260814000000_public_portfolio.sql ─────────────────────────────────────────────
-- Public Company Portfolio
--
-- The portfolio is intentionally separate from the internal `projects` table.
-- Visitors can read only published, non-archived records. Portfolio management
-- remains protected by the metadata-driven `portfolio.manage` permission.

begin;

-- ── Permission ───────────────────────────────────────────────────────────────
insert into public.permissions (key, name, category, description)
values (
  'portfolio.manage',
  'Manage portfolio',
  'portfolio',
  'Create, edit, reorder, publish, archive, and delete public portfolio projects and images.'
)
on conflict (key) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description;

-- Existing administrators receive the new capability without granting it to
-- managers or employees. Future administrators get it from the same explicit
-- role-permission row.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
cross join public.permissions p
where r.key = 'admin' and p.key = 'portfolio.manage'
on conflict do nothing;

-- ── Categories ───────────────────────────────────────────────────────────────
create table if not exists public.portfolio_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portfolio_categories_order
  on public.portfolio_categories(is_active, display_order, name);

drop trigger if exists set_portfolio_categories_updated_at on public.portfolio_categories;
create trigger set_portfolio_categories_updated_at
before update on public.portfolio_categories
for each row execute function public.set_updated_at();

insert into public.portfolio_categories (name, slug, display_order)
values
  ('Branding', 'branding', 10),
  ('Visual Identity', 'visual-identity', 20),
  ('Logo Design', 'logo-design', 30),
  ('Company Profile', 'company-profile', 40),
  ('Presentation Design', 'presentation-design', 50),
  ('Social Media', 'social-media', 60),
  ('Other', 'other', 70)
on conflict (slug) do nothing;

-- ── Projects ─────────────────────────────────────────────────────────────────
create table if not exists public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  cover_image_path text,
  description text,
  client_name text,
  category_id uuid references public.portfolio_categories(id) on delete set null,
  services text[] not null default '{}',
  project_date date,
  external_url text,
  featured boolean not null default false,
  published boolean not null default false,
  archived boolean not null default false,
  display_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portfolio_projects_public
  on public.portfolio_projects(published, archived, featured, display_order);
create index if not exists idx_portfolio_projects_category
  on public.portfolio_projects(category_id);

drop trigger if exists set_portfolio_projects_updated_at on public.portfolio_projects;
create trigger set_portfolio_projects_updated_at
before update on public.portfolio_projects
for each row execute function public.set_updated_at();

-- ── Images ───────────────────────────────────────────────────────────────────
create table if not exists public.portfolio_project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portfolio_projects(id) on delete cascade,
  storage_path text not null unique,
  alt_text text,
  display_order integer not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_portfolio_project_images_project
  on public.portfolio_project_images(project_id, display_order);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.portfolio_categories enable row level security;
alter table public.portfolio_projects enable row level security;
alter table public.portfolio_project_images enable row level security;

-- Categories are safe to use as public filter labels when active. Admins can
-- still see inactive categories so an existing project can be repaired.
drop policy if exists portfolio_categories_public_select on public.portfolio_categories;
create policy portfolio_categories_public_select
on public.portfolio_categories for select to anon, authenticated
using (is_active = true);

drop policy if exists portfolio_categories_admin_select on public.portfolio_categories;
create policy portfolio_categories_admin_select
on public.portfolio_categories for select to authenticated
using (public.has_permission('portfolio.manage'));

drop policy if exists portfolio_categories_admin_insert on public.portfolio_categories;
create policy portfolio_categories_admin_insert
on public.portfolio_categories for insert to authenticated
with check (public.has_permission('portfolio.manage') and created_by = auth.uid());

drop policy if exists portfolio_categories_admin_update on public.portfolio_categories;
create policy portfolio_categories_admin_update
on public.portfolio_categories for update to authenticated
using (public.has_permission('portfolio.manage'))
with check (public.has_permission('portfolio.manage'));

drop policy if exists portfolio_categories_admin_delete on public.portfolio_categories;
create policy portfolio_categories_admin_delete
on public.portfolio_categories for delete to authenticated
using (public.has_permission('portfolio.manage'));

-- This is the only public project read policy. `archived` is separate from
-- `published` so a project can be kept privately without destroying its data.
drop policy if exists portfolio_projects_public_select on public.portfolio_projects;
create policy portfolio_projects_public_select
on public.portfolio_projects for select to anon, authenticated
using (published = true and archived = false);

drop policy if exists portfolio_projects_admin_select on public.portfolio_projects;
create policy portfolio_projects_admin_select
on public.portfolio_projects for select to authenticated
using (public.has_permission('portfolio.manage'));

drop policy if exists portfolio_projects_admin_insert on public.portfolio_projects;
create policy portfolio_projects_admin_insert
on public.portfolio_projects for insert to authenticated
with check (public.has_permission('portfolio.manage') and created_by = auth.uid());

drop policy if exists portfolio_projects_admin_update on public.portfolio_projects;
create policy portfolio_projects_admin_update
on public.portfolio_projects for update to authenticated
using (public.has_permission('portfolio.manage'))
with check (public.has_permission('portfolio.manage'));

drop policy if exists portfolio_projects_admin_delete on public.portfolio_projects;
create policy portfolio_projects_admin_delete
on public.portfolio_projects for delete to authenticated
using (public.has_permission('portfolio.manage'));

-- Images inherit a project's public visibility. This prevents a draft image
-- from being fetched even if somebody guesses a storage object path.
drop policy if exists portfolio_project_images_public_select on public.portfolio_project_images;
create policy portfolio_project_images_public_select
on public.portfolio_project_images for select to anon, authenticated
using (
  exists (
    select 1
    from public.portfolio_projects project
    where project.id = project_id
      and project.published = true
      and project.archived = false
  )
);

drop policy if exists portfolio_project_images_admin_select on public.portfolio_project_images;
create policy portfolio_project_images_admin_select
on public.portfolio_project_images for select to authenticated
using (public.has_permission('portfolio.manage'));

drop policy if exists portfolio_project_images_admin_insert on public.portfolio_project_images;
create policy portfolio_project_images_admin_insert
on public.portfolio_project_images for insert to authenticated
with check (
  public.has_permission('portfolio.manage')
  and uploaded_by = auth.uid()
  and exists (select 1 from public.portfolio_projects project where project.id = project_id)
);

drop policy if exists portfolio_project_images_admin_update on public.portfolio_project_images;
create policy portfolio_project_images_admin_update
on public.portfolio_project_images for update to authenticated
using (public.has_permission('portfolio.manage'))
with check (public.has_permission('portfolio.manage'));

drop policy if exists portfolio_project_images_admin_delete on public.portfolio_project_images;
create policy portfolio_project_images_admin_delete
on public.portfolio_project_images for delete to authenticated
using (public.has_permission('portfolio.manage'));

-- ── Narrow public read API ───────────────────────────────────────────────────
-- PostgreSQL RLS protects rows, while this function protects columns. The
-- browser never receives created_by, audit timestamps, archive state, or
-- uploader metadata. It receives only the public project contract and image
-- paths needed to request signed URLs.
create or replace function public.get_public_portfolio_projects()
returns table (
  id uuid,
  title text,
  slug text,
  cover_image_path text,
  description text,
  client_name text,
  category_id uuid,
  category_name text,
  category_slug text,
  services text[],
  project_date date,
  external_url text,
  featured boolean,
  display_order integer,
  images jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    project.id,
    project.title,
    project.slug,
    project.cover_image_path,
    project.description,
    project.client_name,
    project.category_id,
    category.name,
    category.slug,
    project.services,
    project.project_date,
    project.external_url,
    project.featured,
    project.display_order,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', image.id,
          'project_id', image.project_id,
          'storage_path', image.storage_path,
          'alt_text', image.alt_text,
          'display_order', image.display_order
        ) order by image.display_order, image.id
      ) filter (where image.id is not null),
      '[]'::jsonb
    )
  from public.portfolio_projects project
  left join public.portfolio_categories category
    on category.id = project.category_id and category.is_active = true
  left join public.portfolio_project_images image on image.project_id = project.id
  where project.published = true and project.archived = false
  group by project.id, category.id
  order by project.display_order, project.created_at desc;
$$;

create or replace function public.get_public_portfolio_project(p_slug text)
returns table (
  id uuid,
  title text,
  slug text,
  cover_image_path text,
  description text,
  client_name text,
  category_id uuid,
  category_name text,
  category_slug text,
  services text[],
  project_date date,
  external_url text,
  featured boolean,
  display_order integer,
  images jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select project.*
  from public.get_public_portfolio_projects() project
  where project.slug = p_slug;
$$;

revoke all on function public.get_public_portfolio_projects() from public;
revoke all on function public.get_public_portfolio_project(text) from public;
grant execute on function public.get_public_portfolio_projects() to anon, authenticated;
grant execute on function public.get_public_portfolio_project(text) to anon, authenticated;

-- ── Private storage with published-only signed reads ─────────────────────────
insert into storage.buckets (id, name, public)
values ('portfolio-images', 'portfolio-images', false)
on conflict (id) do update set public = false;

-- Storage policies cannot safely rely on a client-side filter. This definer
-- function checks the image table and is used by the anon signed-URL policy.
create or replace function public.is_public_portfolio_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portfolio_project_images image
    join public.portfolio_projects project on project.id = image.project_id
    where image.storage_path = object_name
      and project.published = true
      and project.archived = false
  );
$$;

revoke all on function public.is_public_portfolio_image(text) from public;
grant execute on function public.is_public_portfolio_image(text) to anon, authenticated;

drop policy if exists portfolio_images_public_select on storage.objects;
create policy portfolio_images_public_select
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'portfolio-images'
  and public.is_public_portfolio_image(name)
);

drop policy if exists portfolio_images_admin_select on storage.objects;
create policy portfolio_images_admin_select
on storage.objects for select to authenticated
using (bucket_id = 'portfolio-images' and public.has_permission('portfolio.manage'));

drop policy if exists portfolio_images_admin_insert on storage.objects;
create policy portfolio_images_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'portfolio-images'
  and owner_id = auth.uid()::text
  and public.has_permission('portfolio.manage')
);

drop policy if exists portfolio_images_admin_update on storage.objects;
create policy portfolio_images_admin_update
on storage.objects for update to authenticated
using (bucket_id = 'portfolio-images' and public.has_permission('portfolio.manage'))
with check (bucket_id = 'portfolio-images' and public.has_permission('portfolio.manage'));

drop policy if exists portfolio_images_admin_delete on storage.objects;
create policy portfolio_images_admin_delete
on storage.objects for delete to authenticated
using (bucket_id = 'portfolio-images' and public.has_permission('portfolio.manage'));

-- Admin management uses the base tables. Anonymous browsers use the narrow
-- RPC above instead of receiving table columns through PostgREST.
revoke select on public.portfolio_categories, public.portfolio_projects, public.portfolio_project_images from anon;
grant select on public.portfolio_categories, public.portfolio_projects, public.portfolio_project_images to authenticated;
grant insert, update, delete on public.portfolio_categories, public.portfolio_projects, public.portfolio_project_images to authenticated;

commit;
-- ── END MIGRATION: 20260814000000_public_portfolio.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260815000000_admin_only_account_creation.sql ─────────────────────────────────────────────
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
-- ── END MIGRATION: 20260815000000_admin_only_account_creation.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260816000000_force_password_change_and_profile_fields.sql ─────────────────────────────────────────────
-- Force password change on first login and enhanced profile fields
-- Adds must_change_password flag and additional professional profile fields

begin;

-- 1. Add must_change_password flag
alter table public.profiles add column if not exists must_change_password boolean not null default false;
comment on column public.profiles.must_change_password is 'When true, user must change password on next login';

-- 2. Add enhanced professional profile fields
alter table public.profiles add column if not exists skills text;
comment on column public.profiles.skills is 'Comma-separated skills list';

alter table public.profiles add column if not exists experience text;
comment on column public.profiles.experience is 'Work experience summary';

alter table public.profiles add column if not exists certifications text;
comment on column public.profiles.certifications is 'Certifications list';

alter table public.profiles add column if not exists previous_projects text;
comment on column public.profiles.previous_projects is 'Previous projects summary';

alter table public.profiles add column if not exists linkedin text;
comment on column public.profiles.linkedin is 'LinkedIn profile URL';

alter table public.profiles add column if not exists behance text;
comment on column public.profiles.behance is 'Behance profile URL';

alter table public.profiles add column if not exists instagram text;
comment on column public.profiles.instagram is 'Instagram profile URL';

alter table public.profiles add column if not exists facebook text;
comment on column public.profiles.facebook is 'Facebook profile URL';

alter table public.profiles add column if not exists twitter text;
comment on column public.profiles.twitter is 'X/Twitter profile URL';

alter table public.profiles add column if not exists personal_website text;
comment on column public.profiles.personal_website is 'Personal website URL';

alter table public.profiles add column if not exists other_social_links jsonb not null default '{}'::jsonb;
comment on column public.profiles.other_social_links is 'Additional custom social links as JSON object';


-- 3. RPC to mark password as changed
create or replace function public.mark_password_changed(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  update public.profiles
  set must_change_password = false,
      updated_at = now()
  where id = p_user_id;
end;
$body$;

revoke all on function public.mark_password_changed(uuid) from public, anon;
grant execute on function public.mark_password_changed(uuid) to authenticated;

commit;
-- ── END MIGRATION: 20260816000000_force_password_change_and_profile_fields.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260817000000_notification_system.sql ─────────────────────────────────────────────
-- Notification System: Form submissions, project assignments, task assignments, and persistence
-- Enables automatic notifications for Admins on form submission and Employees on project/task assignment.

begin;

-- 1. Ensure columns and constraints on public.notifications
alter table public.notifications add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.notifications add column if not exists submission_id uuid references public.form_submissions(id) on delete cascade;
alter table public.notifications add column if not exists task_id uuid references public.tasks(id) on delete cascade;

comment on column public.notifications.metadata is 'Rich structured metadata (submission details, assigner info, form name, client name, etc.)';
comment on column public.notifications.submission_id is 'Direct foreign key link to form_submissions when applicable';
comment on column public.notifications.task_id is 'Direct foreign key link to tasks when applicable';

-- Widen type check constraint to include all supported notification types
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in ('info', 'assignment', 'project_update', 'task_update', 'task_assignment', 'form_submission', 'submission')
);

create index if not exists idx_notifications_recipient on public.notifications(recipient_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications(recipient_id) where read_at is null;
create index if not exists idx_notifications_submission on public.notifications(submission_id);
create index if not exists idx_notifications_task on public.notifications(task_id);


-- 2. Trigger: Notify Admins when a Dynamic Form is submitted
create or replace function public.notify_form_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  form_rec public.form_templates;
  client_display_name text;
  notif_title text;
  notif_message text;
begin
  select * into form_rec from public.form_templates where id = new.form_id;

  client_display_name := coalesce(
    nullif(trim(new.respondent_name), ''),
    nullif(trim(new.company_name), ''),
    nullif(trim(new.respondent_email), ''),
    'Anonymous client'
  );

  notif_title := 'New ' || coalesce(form_rec.title, 'Form') || ' submission';
  notif_message := 'New submission #' || substring(new.id::text, 1, 8) || ' received from ' || client_display_name || ' for ' || coalesce(form_rec.title, 'Form') || '.';

  insert into public.notifications (
    recipient_id,
    actor_id,
    project_id,
    submission_id,
    type,
    title,
    message,
    action_url,
    metadata
  )
  select
    p.id,
    (select id from public.profiles where id = auth.uid()),
    new.project_id,
    new.id,
    'form_submission',
    notif_title,
    notif_message,
    '/admin/forms/' || new.form_id::text || '?tab=submissions&submission=' || new.id::text,
    jsonb_build_object(
      'submission_id', new.id,
      'form_id', new.form_id,
      'form_name', coalesce(form_rec.title, 'Form'),
      'client_name', client_display_name,
      'respondent_name', new.respondent_name,
      'respondent_email', new.respondent_email,
      'respondent_phone', new.respondent_phone,
      'company_name', new.company_name,
      'project_id', new.project_id,
      'submitted_at', new.submitted_at
    )
  from public.profiles p
  where p.status = 'active'
    and (
      p.role = 'admin'::public.app_role
      or exists (
        select 1 from public.role_permissions rp
        join public.permissions perm on perm.id = rp.permission_id
        where rp.role_id = p.role_id and perm.key = 'admin.manage'
      )
    );

  return new;
end;
$$;

drop trigger if exists notify_form_submission on public.form_submissions;
create trigger notify_form_submission after insert on public.form_submissions
for each row execute function public.notify_form_submission();


-- 3. Trigger: Notify Admins when an Intake Form is submitted
create or replace function public.notify_intake_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_display_name text;
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    client_display_name := coalesce(
      nullif(trim(new.contact_name), ''),
      nullif(trim(new.company_name), ''),
      nullif(trim(new.contact_email), ''),
      'Anonymous client'
    );

    insert into public.notifications (
      recipient_id,
      actor_id,
      project_id,
      type,
      title,
      message,
      action_url,
      metadata
    )
    select
      p.id,
      (select id from public.profiles where id = auth.uid()),
      new.project_id,
      'submission',
      'New intake form submission',
      'New intake #' || substring(new.id::text, 1, 8) || ' submitted by ' || client_display_name || '.',
      '/intake?id=' || new.id::text,
      jsonb_build_object(
        'intake_id', new.id,
        'client_name', client_display_name,
        'contact_email', new.contact_email,
        'contact_phone', new.phone,
        'company_name', new.company_name,
        'services', new.service_types,
        'submitted_at', coalesce(new.submitted_at, now())
      )
    from public.profiles p
    where p.status = 'active'
      and (
        p.role = 'admin'::public.app_role
        or exists (
          select 1 from public.role_permissions rp
          join public.permissions perm on perm.id = rp.permission_id
          where rp.role_id = p.role_id and perm.key = 'admin.manage'
        )
      );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_intake_submission on public.intake_forms;
create trigger notify_intake_submission after insert or update of status on public.intake_forms
for each row execute function public.notify_intake_submission();


-- 4. Trigger: Notify Employee on Project Assignment
create or replace function public.notify_project_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_rec public.projects;
  assigner_name text;
begin
  select * into proj_rec from public.projects where id = new.project_id;

  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'An administrator')
  into assigner_name
  from public.profiles
  where id = coalesce(new.assigned_by, auth.uid());

  if assigner_name is null then
    assigner_name := 'An administrator';
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    project_id,
    type,
    title,
    message,
    action_url,
    metadata
  )
  values (
    new.user_id,
    coalesce(new.assigned_by, (select id from public.profiles where id = auth.uid())),
    new.project_id,
    'assignment',
    'You have been assigned to a new project',
    'You were assigned to project “' || coalesce(proj_rec.name, 'a project') || '” (Status: ' || coalesce(proj_rec.status::text, 'active') || ') by ' || assigner_name || '.',
    '/projects/' || new.project_id::text,
    jsonb_build_object(
      'project_id', new.project_id,
      'project_name', coalesce(proj_rec.name, 'Project'),
      'assigned_by', assigner_name,
      'status', coalesce(proj_rec.status::text, 'active'),
      'assigned_at', now()
    )
  );
  return new;
end;
$$;

drop trigger if exists notify_project_assignment on public.project_members;
create trigger notify_project_assignment after insert on public.project_members
for each row execute function public.notify_project_assignment();


-- 5. Trigger: Notify Employee on Task Assignment
create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_rec public.projects;
  assigner_name text;
begin
  if new.assignee_id is not null
    and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
    and exists (
      select 1 from public.profiles p
      where p.id = new.assignee_id
        and p.status = 'active'
        and p.role <> 'client'::public.app_role
    ) then

    select * into proj_rec from public.projects where id = new.project_id;

    select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'A team member')
    into assigner_name
    from public.profiles
    where id = coalesce(new.created_by, auth.uid());

    if assigner_name is null then
      assigner_name := 'A team member';
    end if;

    insert into public.notifications (
      recipient_id,
      actor_id,
      project_id,
      task_id,
      type,
      title,
      message,
      action_url,
      metadata
    )
    values (
      new.assignee_id,
      coalesce(new.created_by, (select id from public.profiles where id = auth.uid())),
      new.project_id,
      new.id,
      'task_assignment',
      'New task assignment: ' || new.title,
      'You were assigned “' || new.title || '” in project “' || coalesce(proj_rec.name, 'a project') || '” by ' || assigner_name || case when new.due_date is not null then ' (Due: ' || to_char(new.due_date, 'YYYY-MM-DD') || ')' else '' end || '.',
      '/projects/' || new.project_id::text || '?task=' || new.id::text,
      jsonb_build_object(
        'task_id', new.id,
        'task_title', new.title,
        'project_id', new.project_id,
        'project_name', coalesce(proj_rec.name, 'Project'),
        'assigned_by', assigner_name,
        'due_date', new.due_date,
        'priority', new.priority,
        'status', new.status,
        'assigned_at', now()
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_task_assignment on public.tasks;
create trigger notify_task_assignment after insert or update of assignee_id on public.tasks
for each row execute function public.notify_task_assignment();


-- 6. Ensure strict RLS on notifications table
alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (public.is_active() and public.has_permission('notification.view') and recipient_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (public.is_active() and public.has_permission('notification.view') and recipient_id = auth.uid())
  with check (public.is_active() and public.has_permission('notification.view') and recipient_id = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (public.is_active() and public.has_permission('notification.view') and recipient_id = auth.uid());

revoke all on public.notifications from anon;
grant select, update (read_at), delete on public.notifications to authenticated;

commit;
-- ── END MIGRATION: 20260817000000_notification_system.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260818000000_database_foundation_consistency.sql ─────────────────────────────────────────────
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
-- ── END MIGRATION: 20260818000000_database_foundation_consistency.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260819000000_account_lifecycle_hardening.sql ─────────────────────────────────────────────
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
-- ── END MIGRATION: 20260819000000_account_lifecycle_hardening.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260820000000_profile_self_service.sql ─────────────────────────────────────────────
-- Profile self-service hardening (Session 03).
--
-- Users own their avatar folder. When an Administrator uploads an avatar for a
-- team member through Team Management, the storage object's owner_id is the
-- Administrator, so the member could previously neither update nor delete that
-- object. The avatar path always starts with the member's user id, so allow
-- folder-based ownership on the update/delete policies in addition to the
-- explicit owner. This keeps avatars safe: a user can only ever touch objects
-- inside their own folder (or those they explicitly uploaded), while Admins
-- keep their employee.manage override.

begin;

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (
    public.has_permission('employee.manage')
    or owner_id = auth.uid()::text
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (
    public.has_permission('employee.manage')
    or owner_id = auth.uid()::text
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

commit;
-- ── END MIGRATION: 20260820000000_profile_self_service.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260821000000_permission_enforcement.sql ─────────────────────────────────────────────
-- Session 04 — Roles, custom roles & permission enforcement.
--
-- Closes the gap where a granted capability (e.g. form.manage) was useless
-- because the corresponding UI lived behind an unrelated admin.manage route.
-- Also tightens the default Employee matrix: submissions and client records
-- are no longer granted by role name; they must be checked explicitly.
--
-- Capabilities remain checkbox-driven. This migration only:
--   * adds form.view to the catalog
--   * reseeds the four system-role defaults
--   * lets form.view read the form inventory (drafts included)
--   * adds has_any_permission() for route-equivalent checks

begin;

-- ── 1. Catalog ───────────────────────────────────────────────────────────────
insert into public.permissions (key, name, category, description) values
  ('form.view', 'View forms', 'forms', 'Open the form inventory, including drafts that are not public.')
on conflict (key) do update set
  name = excluded.name, category = excluded.category, description = excluded.description;

-- Admin always receives every catalog row, including newly added keys.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
cross join public.permissions p
where r.key = 'admin' and r.is_system
on conflict do nothing;

-- ── 2. System-role defaults (explicit, never implied by the role name) ───────
-- Manager keeps operational access. Employee loses submissions + clients.
-- Custom roles are left untouched.
delete from public.role_permissions rp
using public.app_roles r
where rp.role_id = r.id
  and r.is_system
  and r.key in ('manager', 'employee', 'client');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
join public.permissions p on p.key = any(array[
  'workspace.access','dashboard.view',
  'project.view','project.view_all','project.create','project.edit','project.delete','project.assign',
  'client.view','client.view_all','client.create','client.edit',
  'task.view','task.create','task.edit','task.delete','task.assign',
  'file.view','file.upload','file.edit','file.delete',
  'submission.view','submission.edit','submission.assign',
  'employee.view','employee.edit',
  'role.view','permission.view',
  'settings.view','report.view','notification.view'
])
where r.key = 'manager' and r.is_system
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
join public.permissions p on p.key = any(array[
  'workspace.access','dashboard.view',
  'project.view',
  'task.view','task.edit',
  'file.view','file.upload',
  'employee.view',
  'report.view','notification.view'
])
where r.key = 'employee' and r.is_system
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
join public.permissions p on p.key = 'portal.view'
where r.key = 'client' and r.is_system
on conflict do nothing;

update public.app_roles
set description = 'Full access, including managing roles, permissions, employees, and system settings.'
where key = 'admin' and is_system;

update public.app_roles
set description = 'Manages projects, clients, tasks, files, and submissions. Cannot delete employees, manage admins, or change system settings.'
where key = 'manager' and is_system;

update public.app_roles
set description = 'Team member with access to assigned projects, tasks, and files. Submissions and client records require an explicit grant.'
where key = 'employee' and is_system;

update public.app_roles
set description = 'External client account with portal-only access.'
where key = 'client' and is_system;

-- ── 3. form.view can read the inventory (manage still owns writes) ───────────
drop policy if exists form_templates_select_view on public.form_templates;
create policy form_templates_select_view on public.form_templates for select to authenticated
using (public.has_permission('form.view'));

drop policy if exists form_questions_select_view on public.form_questions;
create policy form_questions_select_view on public.form_questions for select to authenticated
using (public.has_permission('form.view'));

-- ── 4. Route-equivalent helper ───────────────────────────────────────────────
create or replace function public.has_any_permission(required_permissions text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.is_active()
    and not public.must_change_password_pending()
    and exists (
      select 1
      from unnest(coalesce(required_permissions, array[]::text[])) required(key)
      where public.has_permission(required.key)
    );
$$;

revoke all on function public.has_any_permission(text[]) from public, anon;
grant execute on function public.has_any_permission(text[]) to authenticated;

comment on function public.has_any_permission(text[]) is
  'True when the caller holds at least one of the listed permission keys. Used by route-equivalent checks so form.manage is not blocked by an unrelated admin.manage requirement.';

commit;
-- ── END MIGRATION: 20260821000000_permission_enforcement.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260822000000_form_submission_security.sql ─────────────────────────────────────────────
-- Session 05 — Public form submission security & abuse protection.
--
-- Adds server-side defences against spam, bots, and duplicate submissions:
--   * form_rate_limits table — per-session + per-form rate limiting
--   * form_submission_fingerprints table — duplicate submission detection
--   * Payload size and text length validation in submit_dynamic_form
--   * Enforces published-only submission at the DB level (already existed,
--     but now also validates the form record exists and is not disabled/archived)
--   * Shortens the error messages returned to public users so they do not
--     leak internal schema details
--
-- IP-based rate limiting is handled separately in the Next.js API route
-- (POST /api/forms/submit) because the database cannot see the caller's IP.
-- Cloudflare Turnstile verification is also done in that API route.
--
-- The existing UX, form builder, and question types are untouched.

begin;

-- ── 1. Rate-limit tracking table ─────────────────────────────────────────────
-- Records each submission by session (auth.uid) and form. The cleanup
-- function prunes rows older than the enforcement window so the table stays
-- small.
create table if not exists public.form_rate_limits (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null default auth.uid(),
  form_id uuid not null references public.form_templates(id) on delete cascade,
  submitted_at timestamptz not null default now()
);

create index if not exists idx_form_rate_limits_session_form
  on public.form_rate_limits(session_id, form_id, submitted_at desc);

alter table public.form_rate_limits enable row level security;

-- No public access — only the security definer function reads/writes.
drop policy if exists form_rate_limits_no_public on public.form_rate_limits;
create policy form_rate_limits_no_public on public.form_rate_limits
  for all to anon, authenticated using (false) with check (false);

-- Cleanup: remove entries older than 2 hours.
create or replace function public.cleanup_form_rate_limits()
returns void
language sql security definer set search_path = public
as $$
  delete from public.form_rate_limits where submitted_at < now() - interval '2 hours';
$$;

comment on table public.form_rate_limits is
  'Per-session, per-form submission timestamps for rate limiting. Pruned by cleanup_form_rate_limits().';

-- ── 2. Duplicate-submission fingerprint table ────────────────────────────────
-- When a respondent email is mapped, we store a hash of (form_id, email) so
-- repeated submissions within the cooldown window are rejected.
create table if not exists public.form_submission_fingerprints (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.form_templates(id) on delete cascade,
  fingerprint text not null, -- sha256(lower(email) || form_id)
  submitted_at timestamptz not null default now()
);

create unique index if not exists idx_form_fingerprints_dedup
  on public.form_submission_fingerprints(form_id, fingerprint, submitted_at);

create index if not exists idx_form_fingerprints_recent
  on public.form_submission_fingerprints(form_id, fingerprint, submitted_at desc);

alter table public.form_submission_fingerprints enable row level security;

drop policy if exists form_fingerprints_no_public on public.form_submission_fingerprints;
create policy form_fingerprints_no_public on public.form_submission_fingerprints
  for all to anon, authenticated using (false) with check (false);

-- Cleanup: remove entries older than 24 hours.
create or replace function public.cleanup_form_submission_fingerprints()
returns void
language sql security definer set search_path = public
as $$
  delete from public.form_submission_fingerprints where submitted_at < now() - interval '24 hours';
$$;

comment on table public.form_submission_fingerprints is
  'Tracks (form, email) pairs to prevent duplicate submissions within a cooldown window.';

-- ── 3. Hardened submit_dynamic_form ──────────────────────────────────────────
-- Adds: rate limiting (5/min per session), duplicate detection (same email
-- within 5 min to same form), payload size validation (100 KB max answers,
-- 10 000 chars per text value), published-only enforcement.
create or replace function public.submit_dynamic_form(
  p_form_id uuid,
  p_answers jsonb
)
returns public.form_submissions
language plpgsql security definer set search_path = public
as $$
declare
  form_rec public.form_templates;
  q public.form_questions;
  val jsonb;
  txt text;
  is_empty boolean;
  missing text[];
  submission_rec public.form_submissions;
  linked_client_id uuid;
  linked_project_id uuid;
  file_item jsonb;
  file_path text;
  rating_max_val integer;
  -- Rate limiting
  recent_count integer;
  -- Duplicate detection
  respondent_email_val text;
  fp text;
  dup_count integer;
  -- Payload validation
  answer_key text;
  answer_val text;
begin
  -- ── Form existence and status ──────────────────────────────────────────
  select * into form_rec from public.form_templates where id = p_form_id;
  if not found then
    raise exception 'Form not found';
  end if;
  if form_rec.status <> 'published' then
    raise exception 'This form is not accepting submissions';
  end if;

  -- ── Payload size guard ─────────────────────────────────────────────────
  -- The entire answers JSON must be under 100 KB.
  if length(p_answers::text) > 102400 then
    raise exception 'Your submission is too large. Please shorten your answers.';
  end if;

  -- Each individual text value must be under 10 000 characters.
  for answer_key, answer_val in select * from jsonb_each_text(p_answers)
  loop
    if length(answer_val) > 10000 then
      raise exception 'One of your answers exceeds the maximum allowed length.';
    end if;
  end loop;

  -- ── Rate limiting: max 5 submissions per minute per session+form ───────
  select count(*) into recent_count
  from public.form_rate_limits
  where session_id = auth.uid()
    and form_id = p_form_id
    and submitted_at > now() - interval '1 minute';

  if recent_count >= 5 then
    raise exception 'You are submitting too frequently. Please wait a moment and try again.';
  end if;

  -- ── Per-session cooldown: minimum 3 seconds between submissions ────────
  if exists (
    select 1 from public.form_rate_limits
    where session_id = auth.uid()
      and form_id = p_form_id
      and submitted_at > now() - interval '3 seconds'
  ) then
    raise exception 'Please wait a few seconds before submitting again.';
  end if;

  -- ── Validate answers ───────────────────────────────────────────────────
  for q in
    select * from public.form_questions where form_id = p_form_id order by position, created_at
  loop
    -- Hidden by an unmet show-if rule: skip entirely.
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    is_empty := val is null
      or val = 'null'::jsonb
      or (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') = '')
      or (jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 0);

    if q.required and is_empty then
      missing := coalesce(missing, '{}') || q.label;
      continue;
    end if;

    if not is_empty then
      -- Server-side validation guards against tampered clients.
      if q.question_type in ('single_choice', 'dropdown') then
        if jsonb_typeof(val) <> 'string'
           or not exists (select 1 from jsonb_array_elements_text(q.options) o where o = val #>> '{}') then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'multiple_choice' then
        if jsonb_typeof(val) <> 'array'
           or exists (select 1 from jsonb_array_elements_text(val) v where not exists (
                select 1 from jsonb_array_elements_text(q.options) o where o = v)) then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'yes_no' then
        if jsonb_typeof(val) <> 'string' or (val #>> '{}') not in ('yes', 'no') then
          raise exception 'Invalid answer for "%"', q.label;
        end if;
      elsif q.question_type = 'number' then
        if jsonb_typeof(val) <> 'number' and (jsonb_typeof(val) <> 'string' or (val #>> '{}') !~ '^-?\d+(\.\d+)?$') then
          raise exception 'Invalid number for "%"', q.label;
        end if;
      elsif q.question_type = 'rating' then
        rating_max_val := greatest(1, least(10, coalesce(nullif(q.config ->> 'rating_max', '')::integer, 5)));
        if (val #>> '{}') !~ '^\d+$'
           or (val #>> '{}')::integer < 1
           or (val #>> '{}')::integer > rating_max_val then
          raise exception 'Invalid rating for "%"', q.label;
        end if;
      elsif q.question_type = 'file_upload' then
        if jsonb_typeof(val) <> 'array' then
          raise exception 'Invalid file answer for "%"', q.label;
        end if;
        -- Limit to 10 files per question.
        if jsonb_array_length(val) > 10 then
          raise exception 'Too many files uploaded for "%". Maximum is 10.', q.label;
        end if;
      end if;

      -- Contact mapping feeds the client automation below.
      txt := case when jsonb_typeof(val) = 'string' then btrim(val #>> '{}') else null end;
      if nullif(txt, '') is not null then
        if q.map_to = 'name' then submission_rec.respondent_name := txt; end if;
        if q.map_to = 'email' then respondent_email_val := lower(txt); end if;
        if q.map_to = 'phone' then submission_rec.respondent_phone := txt; end if;
        if q.map_to = 'company' then submission_rec.company_name := txt; end if;
      end if;
    end if;
  end loop;

  submission_rec.respondent_email := respondent_email_val;

  if missing is not null then
    raise exception 'Required questions are missing: %', array_to_string(missing, ', ');
  end if;

  -- ── Duplicate submission detection (same email, same form, within 5 min) ──
  if respondent_email_val is not null then
    fp := encode(digest(respondent_email_val || p_form_id::text, 'sha256'), 'hex');
    select count(*) into dup_count
    from public.form_submission_fingerprints
    where form_id = p_form_id
      and fingerprint = fp
      and submitted_at > now() - interval '5 minutes';

    if dup_count > 0 then
      raise exception 'You have already submitted a response recently. Please wait a few minutes before submitting again.';
    end if;

    -- Record this submission fingerprint.
    insert into public.form_submission_fingerprints (form_id, fingerprint)
    values (p_form_id, fp);
  end if;

  -- ── Record rate-limit entry ────────────────────────────────────────────
  insert into public.form_rate_limits (session_id, form_id)
  values (auth.uid(), p_form_id);

  -- ── Match or create CRM client ─────────────────────────────────────────
  if respondent_email_val is not null then
    select id into linked_client_id
    from public.clients
    where lower(coalesce(email, '')) = respondent_email_val
    order by created_at asc
    limit 1;

    if linked_client_id is null then
      insert into public.clients (name, type, status, contact_person, email, phone, notes, created_by)
      values (
        coalesce(nullif(submission_rec.company_name, ''), nullif(submission_rec.respondent_name, ''), respondent_email_val),
        'potential',
        'potential',
        nullif(submission_rec.respondent_name, ''),
        respondent_email_val,
        nullif(submission_rec.respondent_phone, ''),
        'Created automatically from form "' || form_rec.title || '"',
        auth.uid()
      )
      returning id into linked_client_id;
    end if;
  end if;

  -- ── Optional: open a project ───────────────────────────────────────────
  if coalesce(form_rec.settings ->> 'create_project_on_submit', 'false') = 'true' and linked_client_id is not null then
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      coalesce(nullif(submission_rec.company_name, '') || ' — ', '') || form_rec.title,
      'Created automatically from a submission to form "' || form_rec.title || '"',
      linked_client_id,
      form_rec.title,
      'active', 1, 'Discovery', 0, auth.uid()
    )
    returning id into linked_project_id;
  end if;

  -- ── Store submission ───────────────────────────────────────────────────
  insert into public.form_submissions
    (form_id, form_version, status, respondent_name, respondent_email, respondent_phone, company_name, client_id, project_id, created_by)
  values (
    p_form_id, form_rec.version, 'submitted',
    submission_rec.respondent_name, submission_rec.respondent_email,
    submission_rec.respondent_phone, submission_rec.company_name,
    linked_client_id, linked_project_id, auth.uid()
  )
  returning * into submission_rec;

  -- Freeze each answer together with the question it answered. Hidden
  -- questions are excluded so an unmet conditional never appears as answered.
  insert into public.form_submission_answers (submission_id, question_id, question_snapshot, value)
  select submission_rec.id, fq.id, to_jsonb(fq), p_answers -> fq.id::text
  from public.form_questions fq
  where fq.form_id = p_form_id
    and public.is_form_question_visible(fq, p_answers)
  order by fq.position, fq.created_at;

  -- Attach uploaded files.
  for q in select * from public.form_questions where form_id = p_form_id and question_type = 'file_upload' loop
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    if jsonb_typeof(val) = 'array' then
      for file_item in select * from jsonb_array_elements(val) loop
        file_path := file_item ->> 'storage_path';
        if file_path is not null and (
          (auth.uid() is not null and split_part(file_path, '/', 1) = auth.uid()::text)
          or public.has_permission('submission.edit')
        ) then
          insert into public.form_submission_attachments
            (submission_id, question_id, name, size, mime_type, storage_path, uploaded_by)
          values (
            submission_rec.id, q.id,
            coalesce(nullif(file_item ->> 'name', ''), 'file'),
            coalesce(nullif(file_item ->> 'size', '')::bigint, 0),
            nullif(file_item ->> 'mime_type', ''),
            file_path,
            auth.uid()
          )
          on conflict (storage_path) do nothing;
        end if;
      end loop;
    end if;
  end loop;

  return submission_rec;
end;
$$;

-- Revoke + re-grant with the same permissions as before.
revoke all on function public.submit_dynamic_form(uuid, jsonb) from public, anon;
grant execute on function public.submit_dynamic_form(uuid, jsonb) to authenticated, anon;

commit;
-- ── END MIGRATION: 20260822000000_form_submission_security.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260823000000_storage_security_and_orphan_management.sql ─────────────────────────────────────────────
-- ── Storage security, bucket boundaries, centralized policies & orphan review ──
--
-- Session 06 — File Upload & Storage Security
--
-- 1. Updates storage buckets with strict limits and MIME types:
--    - avatars: public=true, 5 MB limit, image/* only
--    - portfolio-images: public=false (signed URLs only), 10 MB limit, image/* only
--    - project-files: public=false, 50 MB limit, safe project files only
--    - form-files: public=false, 20 MB limit, safe form attachments only
--    - intake-files: public=false, 20 MB limit, safe legacy intake attachments only
--
-- 2. Hardens storage.objects RLS policies across all buckets:
--    - project-files: isolated by project membership (can_access_project) + file permissions
--    - portfolio-images: public signed reads verified against published status; admin manage
--    - avatars: public reads, update/delete locked to owner folder or employee.manage
--    - form-files: uploader folder isolation for anon/auth; staff require submission.view
--    - intake-files: uploader folder isolation; staff require submission.view
--
-- 3. Hardens submit_dynamic_form RPC:
--    - Rejects dangerous executable attachments (.exe, .bat, .php, .sh, .js, etc.)
--    - Enforces 20 MB size limit per attachment at database level
--    - Retains caller folder isolation
--
-- 4. Introduces storage audit & orphan review function:
--    - get_storage_audit_summary() for workspace storage health and unreferenced object detection

begin;

-- ── 1. Storage bucket configuration ──────────────────────────────────────────
alter table storage.buckets add column if not exists file_size_limit bigint;
alter table storage.buckets add column if not exists allowed_mime_types text[];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('portfolio-images', 'portfolio-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
  ('project-files', 'project-files', false, 52428800, null),
  ('form-files', 'form-files', false, 20971520, null),
  ('intake-files', 'intake-files', false, 20971520, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. Storage RLS policies ──────────────────────────────────────────────────

-- Project files: strictly private, isolated to project members with proper permissions
drop policy if exists project_files_select on storage.objects;
create policy project_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'project-files'
    and public.has_permission('file.view')
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists project_files_insert on storage.objects;
create policy project_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and owner_id = auth.uid()::text
    and public.has_permission('file.upload')
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists project_files_update on storage.objects;
create policy project_files_update on storage.objects for update to authenticated
  using (
    bucket_id = 'project-files'
    and (owner_id = auth.uid()::text or public.has_permission('file.edit'))
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists project_files_delete on storage.objects;
create policy project_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-files'
    and (owner_id = auth.uid()::text or public.has_permission('file.delete'))
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

-- Portfolio images: private bucket, signed URLs for published items, admin manage
drop policy if exists portfolio_images_public_select on storage.objects;
create policy portfolio_images_public_select on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'portfolio-images'
    and public.is_public_portfolio_image(name)
  );

drop policy if exists portfolio_images_admin_select on storage.objects;
create policy portfolio_images_admin_select on storage.objects for select to authenticated
  using (
    bucket_id = 'portfolio-images'
    and public.has_permission('portfolio.manage')
  );

drop policy if exists portfolio_images_admin_insert on storage.objects;
create policy portfolio_images_admin_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'portfolio-images'
    and owner_id = auth.uid()::text
    and public.has_permission('portfolio.manage')
  );

drop policy if exists portfolio_images_admin_update on storage.objects;
create policy portfolio_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'portfolio-images' and public.has_permission('portfolio.manage'))
  with check (bucket_id = 'portfolio-images' and public.has_permission('portfolio.manage'));

drop policy if exists portfolio_images_admin_delete on storage.objects;
create policy portfolio_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'portfolio-images' and public.has_permission('portfolio.manage'));

-- Avatars: public bucket, write/delete locked to own folder or employee.manage
drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      public.has_permission('employee.manage')
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
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.has_permission('employee.manage')
      or owner_id = auth.uid()::text
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- Form files: private bucket, uploads go into caller folder, staff view gated by submission.view
drop policy if exists form_files_insert on storage.objects;
create policy form_files_insert on storage.objects for insert to authenticated, anon
  with check (
    bucket_id = 'form-files'
    and (owner_id = auth.uid()::text or auth.uid() is null)
    and (storage.foldername(name))[1] = coalesce(auth.uid()::text, 'anon')
  );

drop policy if exists form_files_select on storage.objects;
create policy form_files_select on storage.objects for select to authenticated, anon
  using (
    bucket_id = 'form-files'
    and (
      (auth.uid() is not null and owner_id = auth.uid()::text)
      or (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
      or public.has_permission('submission.view')
    )
  );

drop policy if exists form_files_delete on storage.objects;
create policy form_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'form-files'
    and (
      (auth.uid() is not null and owner_id = auth.uid()::text)
      or (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
      or public.has_permission('submission.edit')
    )
  );

-- Intake files: private bucket, legacy intake attachments
drop policy if exists intake_files_select on storage.objects;
create policy intake_files_select on storage.objects for select to authenticated, anon
  using (
    bucket_id = 'intake-files'
    and (
      (auth.uid() is not null and owner_id = auth.uid()::text)
      or (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
      or public.has_permission('submission.view')
    )
  );

drop policy if exists intake_files_delete on storage.objects;
create policy intake_files_delete on storage.objects for delete to authenticated, anon
  using (
    bucket_id = 'intake-files'
    and (
      (auth.uid() is not null and owner_id = auth.uid()::text)
      or (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
      or public.has_permission('submission.edit')
    )
  );

-- ── 3. Hardened submit_dynamic_form RPC ──────────────────────────────────────
create or replace function public.submit_dynamic_form(
  p_form_id uuid,
  p_answers jsonb
)
returns public.form_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  form_rec public.form_templates;
  q public.form_questions;
  val jsonb;
  txt text;
  is_empty boolean;
  missing text[];
  submission_rec public.form_submissions;
  linked_client_id uuid;
  linked_project_id uuid;
  file_item jsonb;
  file_path text;
  file_name text;
  file_size bigint;
  file_ext text;
  rating_max_val integer;
  -- Rate limiting
  recent_count integer;
  -- Duplicate detection
  respondent_email_val text;
  fp text;
  dup_count integer;
  -- Payload validation
  answer_key text;
  answer_val text;
begin
  -- ── Form existence and status ──────────────────────────────────────────
  select * into form_rec from public.form_templates where id = p_form_id;
  if not found then
    raise exception 'Form not found';
  end if;
  if form_rec.status <> 'published' then
    raise exception 'This form is not accepting submissions';
  end if;

  -- ── Payload size guard ─────────────────────────────────────────────────
  -- The entire answers JSON must be under 100 KB.
  if length(p_answers::text) > 102400 then
    raise exception 'Your submission is too large. Please shorten your answers.';
  end if;

  -- Each individual text value must be under 10 000 characters.
  for answer_key, answer_val in select * from jsonb_each_text(p_answers)
  loop
    if length(answer_val) > 10000 then
      raise exception 'One of your answers exceeds the maximum allowed length.';
    end if;
  end loop;

  -- ── Rate limiting: max 5 submissions per minute per session+form ───────
  select count(*) into recent_count
  from public.form_rate_limits
  where session_id = auth.uid()
    and form_id = p_form_id
    and submitted_at > now() - interval '1 minute';

  if recent_count >= 5 then
    raise exception 'You are submitting too frequently. Please wait a moment and try again.';
  end if;

  -- ── Per-session cooldown: minimum 3 seconds between submissions ────────
  if exists (
    select 1 from public.form_rate_limits
    where session_id = auth.uid()
      and form_id = p_form_id
      and submitted_at > now() - interval '3 seconds'
  ) then
    raise exception 'Please wait a few seconds before submitting again.';
  end if;

  -- ── Validate answers ───────────────────────────────────────────────────
  for q in
    select * from public.form_questions where form_id = p_form_id order by position, created_at
  loop
    -- Hidden by an unmet show-if rule: skip entirely.
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    is_empty := val is null
      or val = 'null'::jsonb
      or (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') = '')
      or (jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 0);

    if q.required and is_empty then
      missing := coalesce(missing, '{}') || q.label;
      continue;
    end if;

    if not is_empty then
      -- Server-side validation guards against tampered clients.
      if q.question_type in ('single_choice', 'dropdown') then
        if jsonb_typeof(val) <> 'string'
           or not exists (select 1 from jsonb_array_elements_text(q.options) o where o = val #>> '{}') then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'multiple_choice' then
        if jsonb_typeof(val) <> 'array'
           or exists (select 1 from jsonb_array_elements_text(val) v where not exists (
                select 1 from jsonb_array_elements_text(q.options) o where o = v)) then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'yes_no' then
        if jsonb_typeof(val) <> 'string' or (val #>> '{}') not in ('yes', 'no') then
          raise exception 'Invalid answer for "%"', q.label;
        end if;
      elsif q.question_type = 'number' then
        if jsonb_typeof(val) <> 'number' and (jsonb_typeof(val) <> 'string' or (val #>> '{}') !~ '^-?\d+(\.\d+)?$') then
          raise exception 'Invalid number for "%"', q.label;
        end if;
      elsif q.question_type = 'rating' then
        rating_max_val := greatest(1, least(10, coalesce(nullif(q.config ->> 'rating_max', '')::integer, 5)));
        if (val #>> '{}') !~ '^\d+$'
           or (val #>> '{}')::integer < 1
           or (val #>> '{}')::integer > rating_max_val then
          raise exception 'Invalid rating for "%"', q.label;
        end if;
      elsif q.question_type = 'file_upload' then
        if jsonb_typeof(val) <> 'array' then
          raise exception 'Invalid file answer for "%"', q.label;
        end if;
        -- Limit to 10 files per question.
        if jsonb_array_length(val) > 10 then
          raise exception 'Too many files uploaded for "%". Maximum is 10.', q.label;
        end if;

        -- Validate each file item (size <= 20 MB, no blocked executable extension)
        for file_item in select * from jsonb_array_elements(val) loop
          file_name := coalesce(file_item ->> 'name', '');
          file_size := coalesce(nullif(file_item ->> 'size', '')::bigint, 0);

          if file_size > 20971520 then
            raise exception 'Uploaded file "%" exceeds maximum allowed size of 20 MB.', file_name;
          end if;

          -- Check for unsafe executable extensions (.exe, .bat, .cmd, .sh, .php, .js, etc.)
          file_ext := lower(substring(file_name from '\.([a-zA-Z0-9]+)$'));
          if file_ext in ('exe', 'bat', 'cmd', 'sh', 'php', 'phtml', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'js', 'vbs', 'msi', 'jar', 'scr', 'hta', 'ps1') then
            raise exception 'Uploaded file "%" has an unsafe file extension and is rejected.', file_name;
          end if;
        end loop;
      end if;

      -- Contact mapping feeds the client automation below.
      txt := case when jsonb_typeof(val) = 'string' then btrim(val #>> '{}') else null end;
      if nullif(txt, '') is not null then
        if q.map_to = 'name' then submission_rec.respondent_name := txt; end if;
        if q.map_to = 'email' then respondent_email_val := lower(txt); end if;
        if q.map_to = 'phone' then submission_rec.respondent_phone := txt; end if;
        if q.map_to = 'company' then submission_rec.company_name := txt; end if;
      end if;
    end if;
  end loop;

  submission_rec.respondent_email := respondent_email_val;

  if missing is not null then
    raise exception 'Required questions are missing: %', array_to_string(missing, ', ');
  end if;

  -- ── Duplicate submission detection (same email, same form, within 5 min) ──
  if respondent_email_val is not null then
    fp := encode(digest(respondent_email_val || p_form_id::text, 'sha256'), 'hex');
    select count(*) into dup_count
    from public.form_submission_fingerprints
    where form_id = p_form_id
      and fingerprint = fp
      and submitted_at > now() - interval '5 minutes';

    if dup_count > 0 then
      raise exception 'You have already submitted a response recently. Please wait a few minutes before submitting again.';
    end if;

    -- Record this submission fingerprint.
    insert into public.form_submission_fingerprints (form_id, fingerprint)
    values (p_form_id, fp);
  end if;

  -- ── Record rate-limit entry ────────────────────────────────────────────
  insert into public.form_rate_limits (session_id, form_id)
  values (auth.uid(), p_form_id);

  -- ── Match or create CRM client ─────────────────────────────────────────
  if respondent_email_val is not null then
    select id into linked_client_id
    from public.clients
    where lower(coalesce(email, '')) = respondent_email_val
    order by created_at asc
    limit 1;

    if linked_client_id is null then
      insert into public.clients (name, type, status, contact_person, email, phone, notes, created_by)
      values (
        coalesce(nullif(submission_rec.company_name, ''), nullif(submission_rec.respondent_name, ''), respondent_email_val),
        'potential',
        'potential',
        nullif(submission_rec.respondent_name, ''),
        respondent_email_val,
        nullif(submission_rec.respondent_phone, ''),
        'Created automatically from form "' || form_rec.title || '"',
        auth.uid()
      )
      returning id into linked_client_id;
    end if;
  end if;

  -- ── Optional: open a project ───────────────────────────────────────────
  if coalesce(form_rec.settings ->> 'create_project_on_submit', 'false') = 'true' and linked_client_id is not null then
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      coalesce(nullif(submission_rec.company_name, '') || ' — ', '') || form_rec.title,
      'Created automatically from a submission to form "' || form_rec.title || '"',
      linked_client_id,
      form_rec.title,
      'active', 1, 'Discovery', 0, auth.uid()
    )
    returning id into linked_project_id;
  end if;

  -- ── Store submission ───────────────────────────────────────────────────
  insert into public.form_submissions
    (form_id, form_version, status, respondent_name, respondent_email, respondent_phone, company_name, client_id, project_id, created_by)
  values (
    p_form_id, form_rec.version, 'submitted',
    submission_rec.respondent_name, submission_rec.respondent_email,
    submission_rec.respondent_phone, submission_rec.company_name,
    linked_client_id, linked_project_id, auth.uid()
  )
  returning * into submission_rec;

  -- Freeze each answer together with the question it answered. Hidden
  -- questions are excluded so an unmet conditional never appears as answered.
  insert into public.form_submission_answers (submission_id, question_id, question_snapshot, value)
  select submission_rec.id, fq.id, to_jsonb(fq), p_answers -> fq.id::text
  from public.form_questions fq
  where fq.form_id = p_form_id
    and public.is_form_question_visible(fq, p_answers)
  order by fq.position, fq.created_at;

  -- Attach uploaded files.
  for q in select * from public.form_questions where form_id = p_form_id and question_type = 'file_upload' loop
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    if jsonb_typeof(val) = 'array' then
      for file_item in select * from jsonb_array_elements(val) loop
        file_path := file_item ->> 'storage_path';
        if file_path is not null and (
          (auth.uid() is not null and split_part(file_path, '/', 1) = auth.uid()::text)
          or public.has_permission('submission.edit')
        ) then
          insert into public.form_submission_attachments
            (submission_id, question_id, name, size, mime_type, storage_path, uploaded_by)
          values (
            submission_rec.id, q.id,
            coalesce(nullif(file_item ->> 'name', ''), 'file'),
            coalesce(nullif(file_item ->> 'size', '')::bigint, 0),
            nullif(file_item ->> 'mime_type', ''),
            file_path,
            auth.uid()
          )
          on conflict (storage_path) do nothing;
        end if;
      end loop;
    end if;
  end loop;

  return submission_rec;
end;
$$;

revoke all on function public.submit_dynamic_form(uuid, jsonb) from public, anon;
grant execute on function public.submit_dynamic_form(uuid, jsonb) to authenticated, anon;

-- ── 4. Storage audit & orphan review function ─────────────────────────────────
create or replace function public.get_storage_audit_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  files_count bigint;
  form_attach_count bigint;
  intake_attach_count bigint;
  portfolio_img_count bigint;
  avatars_count bigint;
  storage_obj_count bigint := 0;
  unreferenced_count bigint := 0;
begin
  if not (public.has_permission('admin.manage') or public.has_permission('workspace.access') or public.is_admin()) then
    raise exception 'Unauthorized to view storage audit summary';
  end if;

  select count(*) into files_count from public.files where storage_path is not null;
  select count(*) into form_attach_count from public.form_submission_attachments;
  select count(*) into intake_attach_count from public.intake_attachments;
  select count(*) into portfolio_img_count from public.portfolio_project_images;
  select count(*) into avatars_count from public.profiles where avatar_url is not null and avatar_url <> '';

  -- If storage.objects exists and is queryable, count objects and detect unreferenced ones
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    select count(*) into storage_obj_count from storage.objects;

    select count(*) into unreferenced_count
    from storage.objects o
    where
      (o.bucket_id = 'project-files' and not exists (select 1 from public.files f where f.storage_path = o.name))
      or (o.bucket_id = 'form-files' and not exists (select 1 from public.form_submission_attachments a where a.storage_path = o.name))
      or (o.bucket_id = 'intake-files' and not exists (select 1 from public.intake_attachments ia where ia.storage_path = o.name))
      or (o.bucket_id = 'portfolio-images' and not exists (select 1 from public.portfolio_project_images pi where pi.storage_path = o.name));
  end if;

  return jsonb_build_object(
    'project_files_count', files_count,
    'form_attachments_count', form_attach_count,
    'intake_attachments_count', intake_attach_count,
    'portfolio_images_count', portfolio_img_count,
    'profiles_with_avatar_count', avatars_count,
    'storage_objects_total', storage_obj_count,
    'unreferenced_storage_objects_count', unreferenced_count,
    'audited_at', now()
  );
end;
$$;

revoke all on function public.get_storage_audit_summary() from public, anon;
grant execute on function public.get_storage_audit_summary() to authenticated;

commit;
-- ── END MIGRATION: 20260823000000_storage_security_and_orphan_management.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260824000000_retire_legacy_intake.sql ─────────────────────────────────────────────
-- Retire the legacy /intake system.
--
-- Dynamic Forms (`form_templates` / `form_submissions` / `submit_dynamic_form`)
-- is the only live request path. This migration:
--   * removes the write path (RPC, insert/update policies, intake notification trigger)
--   * retargets leftover notifications that still pointed at /intake
--   * lets legacy client accounts read Dynamic Form submissions linked to their CRM record
--
-- Historical `intake_*` tables and the `intake-files` bucket are NOT dropped.
-- Production may still hold older rows/files. They stay readable for staff
-- (`submission.view`) and linked client accounts, and leftover files can still
-- be cleaned up (`submission.edit`). New writes are impossible.

begin;

-- ── 1. Kill the live write path ──────────────────────────────────────────────
drop function if exists public.submit_intake_form(uuid);

drop trigger if exists notify_intake_submission on public.intake_forms;
drop function if exists public.notify_intake_submission();

drop policy if exists intake_forms_insert on public.intake_forms;
drop policy if exists intake_forms_update on public.intake_forms;
drop policy if exists intake_forms_update_staff on public.intake_forms;
drop policy if exists intake_attachments_insert on public.intake_attachments;
drop policy if exists intake_projects_insert on public.intake_projects;
drop policy if exists intake_files_insert on storage.objects;

-- Select policies stay so historical rows remain readable.
-- Delete policies stay so authorized staff can clean leftover files/rows.

comment on table public.intake_forms is
  'ARCHIVED. Legacy /intake submissions. Read-only. New requests go through form_submissions / submit_dynamic_form.';
comment on table public.intake_projects is
  'ARCHIVED. Legacy intake-to-project links. Read-only.';
comment on table public.intake_attachments is
  'ARCHIVED. Legacy intake file metadata. Read-only. New uploads use form_submission_attachments / form-files.';

-- ── 2. Retarget historical notifications that linked to the dead /intake UI ──
update public.notifications
set action_url = '/submissions'
where action_url is not null
  and action_url like '/intake%';

-- ── 3. Client portal now reads Dynamic Form submissions ──────────────────────
-- Legacy client-role accounts used to see intake_forms linked to their CRM
-- record. Mirror that on form_submissions so the portal does not depend on
-- the retired tables.
drop policy if exists form_submissions_select_client on public.form_submissions;
create policy form_submissions_select_client on public.form_submissions for select to authenticated
  using (client_id is not null and client_id = public.current_user_client_id());

drop policy if exists form_answers_select_client on public.form_submission_answers;
create policy form_answers_select_client on public.form_submission_answers for select to authenticated
  using (exists (
    select 1 from public.form_submissions s
    where s.id = submission_id
      and s.client_id is not null
      and s.client_id = public.current_user_client_id()
  ));

drop policy if exists form_attachments_select_client on public.form_submission_attachments;
create policy form_attachments_select_client on public.form_submission_attachments for select to authenticated
  using (exists (
    select 1 from public.form_submissions s
    where s.id = submission_id
      and s.client_id is not null
      and s.client_id = public.current_user_client_id()
  ));

update public.permissions
set description = 'View Dynamic Form submission records.'
where key = 'submission.view';

-- So the portal can join form_templates(title, slug) even after a form is
-- disabled or archived (public select only covers published templates).
drop policy if exists form_templates_select_client_linked on public.form_templates;
create policy form_templates_select_client_linked on public.form_templates for select to authenticated
  using (exists (
    select 1 from public.form_submissions s
    where s.form_id = form_templates.id
      and s.client_id is not null
      and s.client_id = public.current_user_client_id()
  ));

commit;
-- ── END MIGRATION: 20260824000000_retire_legacy_intake.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260825000000_admin_submission_inbox.sql ─────────────────────────────────────────────
-- Admin Submission Inbox (Session 09)
--
-- Turns the per-form "Responses" tab into a full operational inbox:
--   * A real status workflow on form_submissions.status (New → Reviewing →
--     Need Information → Qualified / Approved / Converted / Rejected / Archived).
--   * A reviewer/owner attribution so each submission has a human owner.
--   * Two permission-gated RPCs so the workflow is enforced server-side
--     (submission.edit for status, submission.assign for ownership).
-- The existing answer/question-snapshot storage is untouched — every answer
-- already keeps its frozen per-question snapshot and file attachments, so the
-- inbox only reads those rows; nothing here rebuilds storage.
begin;

-- ── 1. Status workflow ───────────────────────────────────────────────────────
-- Legacy rows used 'submitted'; the workflow starts every new submission at
-- 'new'. Migrate existing 'submitted' rows into 'new' and widen the constraint
-- to the full workflow set (the column default also becomes 'new').
alter table public.form_submissions
  drop constraint if exists form_submissions_status_check;

update public.form_submissions
   set status = 'new'
 where status = 'submitted';

alter table public.form_submissions
  add constraint form_submissions_status_check
  check (status in (
    'new', 'reviewing', 'need_information',
    'qualified', 'rejected', 'approved', 'converted', 'archived'
  ));

alter table public.form_submissions
  alter column status set default 'new';

-- Fast status-filtered reads for the inbox.
drop index if exists idx_form_submissions_status;
create index if not exists idx_form_submissions_status on public.form_submissions(status, submitted_at desc);

-- ── 2. Reviewer / owner attribution ──────────────────────────────────────────
-- reviewer_id points at an internal Auth account (the person owning this item);
-- it is nullable so a submission can be unassigned. reviewed_at records when the
-- current owner was last assigned, purely informational.
alter table public.form_submissions
  add column if not exists reviewer_id uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_form_submissions_reviewer on public.form_submissions(reviewer_id) where reviewer_id is not null;

-- ── 3. New submissions start as "New" ────────────────────────────────────────
-- The submit RPC hard-coded the status in its INSERT; recreate the current (security-
-- hardened) function so a fresh response lands in the "New" bucket. Only the literal
-- changes — rate limiting, payload guards, duplicate detection, client matching,
-- project automation and answer snapshots are unchanged.
create or replace function public.submit_dynamic_form(
  p_form_id uuid,
  p_answers jsonb
)
returns public.form_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  form_rec public.form_templates;
  q public.form_questions;
  val jsonb;
  txt text;
  is_empty boolean;
  missing text[];
  submission_rec public.form_submissions;
  linked_client_id uuid;
  linked_project_id uuid;
  file_item jsonb;
  file_path text;
  file_name text;
  file_size bigint;
  file_ext text;
  rating_max_val integer;
  -- Rate limiting
  recent_count integer;
  -- Duplicate detection
  respondent_email_val text;
  fp text;
  dup_count integer;
  -- Payload validation
  answer_key text;
  answer_val text;
begin
  -- ── Form existence and status ──────────────────────────────────────────
  select * into form_rec from public.form_templates where id = p_form_id;
  if not found then
    raise exception 'Form not found';
  end if;
  if form_rec.status <> 'published' then
    raise exception 'This form is not accepting submissions';
  end if;

  -- ── Payload size guard ─────────────────────────────────────────────────
  -- The entire answers JSON must be under 100 KB.
  if length(p_answers::text) > 102400 then
    raise exception 'Your submission is too large. Please shorten your answers.';
  end if;

  -- Each individual text value must be under 10 000 characters.
  for answer_key, answer_val in select * from jsonb_each_text(p_answers)
  loop
    if length(answer_val) > 10000 then
      raise exception 'One of your answers exceeds the maximum allowed length.';
    end if;
  end loop;

  -- ── Rate limiting: max 5 submissions per minute per session+form ───────
  select count(*) into recent_count
  from public.form_rate_limits
  where session_id = auth.uid()
    and form_id = p_form_id
    and submitted_at > now() - interval '1 minute';

  if recent_count >= 5 then
    raise exception 'You are submitting too frequently. Please wait a moment and try again.';
  end if;

  -- ── Per-session cooldown: minimum 3 seconds between submissions ────────
  if exists (
    select 1 from public.form_rate_limits
    where session_id = auth.uid()
      and form_id = p_form_id
      and submitted_at > now() - interval '3 seconds'
  ) then
    raise exception 'Please wait a few seconds before submitting again.';
  end if;

  -- ── Validate answers ───────────────────────────────────────────────────
  for q in
    select * from public.form_questions where form_id = p_form_id order by position, created_at
  loop
    -- Hidden by an unmet show-if rule: skip entirely.
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    is_empty := val is null
      or val = 'null'::jsonb
      or (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') = '')
      or (jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 0);

    if q.required and is_empty then
      missing := coalesce(missing, '{}') || q.label;
      continue;
    end if;

    if not is_empty then
      -- Server-side validation guards against tampered clients.
      if q.question_type in ('single_choice', 'dropdown') then
        if jsonb_typeof(val) <> 'string'
           or not exists (select 1 from jsonb_array_elements_text(q.options) o where o = val #>> '{}') then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'multiple_choice' then
        if jsonb_typeof(val) <> 'array'
           or exists (select 1 from jsonb_array_elements_text(val) v where not exists (
                select 1 from jsonb_array_elements_text(q.options) o where o = v)) then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'yes_no' then
        if jsonb_typeof(val) <> 'string' or (val #>> '{}') not in ('yes', 'no') then
          raise exception 'Invalid answer for "%"', q.label;
        end if;
      elsif q.question_type = 'number' then
        if jsonb_typeof(val) <> 'number' and (jsonb_typeof(val) <> 'string' or (val #>> '{}') !~ '^-?\d+(\.\d+)?$') then
          raise exception 'Invalid number for "%"', q.label;
        end if;
      elsif q.question_type = 'rating' then
        rating_max_val := greatest(1, least(10, coalesce(nullif(q.config ->> 'rating_max', '')::integer, 5)));
        if (val #>> '{}') !~ '^\d+$'
           or (val #>> '{}')::integer < 1
           or (val #>> '{}')::integer > rating_max_val then
          raise exception 'Invalid rating for "%"', q.label;
        end if;
      elsif q.question_type = 'file_upload' then
        if jsonb_typeof(val) <> 'array' then
          raise exception 'Invalid file answer for "%"', q.label;
        end if;
        -- Limit to 10 files per question.
        if jsonb_array_length(val) > 10 then
          raise exception 'Too many files uploaded for "%". Maximum is 10.', q.label;
        end if;

        -- Validate each file item (size <= 20 MB, no blocked executable extension)
        for file_item in select * from jsonb_array_elements(val) loop
          file_name := coalesce(file_item ->> 'name', '');
          file_size := coalesce(nullif(file_item ->> 'size', '')::bigint, 0);

          if file_size > 20971520 then
            raise exception 'Uploaded file "%" exceeds maximum allowed size of 20 MB.', file_name;
          end if;

          -- Check for unsafe executable extensions (.exe, .bat, .cmd, .sh, .php, .js, etc.)
          file_ext := lower(substring(file_name from '\.([a-zA-Z0-9]+)$'));
          if file_ext in ('exe', 'bat', 'cmd', 'sh', 'php', 'phtml', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'js', 'vbs', 'msi', 'jar', 'scr', 'hta', 'ps1') then
            raise exception 'Uploaded file "%" has an unsafe file extension and is rejected.', file_name;
          end if;
        end loop;
      end if;

      -- Contact mapping feeds the client automation below.
      txt := case when jsonb_typeof(val) = 'string' then btrim(val #>> '{}') else null end;
      if nullif(txt, '') is not null then
        if q.map_to = 'name' then submission_rec.respondent_name := txt; end if;
        if q.map_to = 'email' then respondent_email_val := lower(txt); end if;
        if q.map_to = 'phone' then submission_rec.respondent_phone := txt; end if;
        if q.map_to = 'company' then submission_rec.company_name := txt; end if;
      end if;
    end if;
  end loop;

  submission_rec.respondent_email := respondent_email_val;

  if missing is not null then
    raise exception 'Required questions are missing: %', array_to_string(missing, ', ');
  end if;

  -- ── Duplicate submission detection (same email, same form, within 5 min) ──
  if respondent_email_val is not null then
    fp := encode(digest(respondent_email_val || p_form_id::text, 'sha256'), 'hex');
    select count(*) into dup_count
    from public.form_submission_fingerprints
    where form_id = p_form_id
      and fingerprint = fp
      and submitted_at > now() - interval '5 minutes';

    if dup_count > 0 then
      raise exception 'You have already submitted a response recently. Please wait a few minutes before submitting again.';
    end if;

    -- Record this submission fingerprint.
    insert into public.form_submission_fingerprints (form_id, fingerprint)
    values (p_form_id, fp);
  end if;

  -- ── Record rate-limit entry ────────────────────────────────────────────
  insert into public.form_rate_limits (session_id, form_id)
  values (auth.uid(), p_form_id);

  -- ── Match or create CRM client ─────────────────────────────────────────
  if respondent_email_val is not null then
    select id into linked_client_id
    from public.clients
    where lower(coalesce(email, '')) = respondent_email_val
    order by created_at asc
    limit 1;

    if linked_client_id is null then
      insert into public.clients (name, type, status, contact_person, email, phone, notes, created_by)
      values (
        coalesce(nullif(submission_rec.company_name, ''), nullif(submission_rec.respondent_name, ''), respondent_email_val),
        'potential',
        'potential',
        nullif(submission_rec.respondent_name, ''),
        respondent_email_val,
        nullif(submission_rec.respondent_phone, ''),
        'Created automatically from form "' || form_rec.title || '"',
        auth.uid()
      )
      returning id into linked_client_id;
    end if;
  end if;

  -- ── Optional: open a project ───────────────────────────────────────────
  if coalesce(form_rec.settings ->> 'create_project_on_submit', 'false') = 'true' and linked_client_id is not null then
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      coalesce(nullif(submission_rec.company_name, '') || ' — ', '') || form_rec.title,
      'Created automatically from a submission to form "' || form_rec.title || '"',
      linked_client_id,
      form_rec.title,
      'active', 1, 'Discovery', 0, auth.uid()
    )
    returning id into linked_project_id;
  end if;

  -- ── Store submission ───────────────────────────────────────────────────
  insert into public.form_submissions
    (form_id, form_version, status, respondent_name, respondent_email, respondent_phone, company_name, client_id, project_id, created_by)
  values (
    p_form_id, form_rec.version, 'new',
    submission_rec.respondent_name, submission_rec.respondent_email,
    submission_rec.respondent_phone, submission_rec.company_name,
    linked_client_id, linked_project_id, auth.uid()
  )
  returning * into submission_rec;

  -- Freeze each answer together with the question it answered. Hidden
  -- questions are excluded so an unmet conditional never appears as answered.
  insert into public.form_submission_answers (submission_id, question_id, question_snapshot, value)
  select submission_rec.id, fq.id, to_jsonb(fq), p_answers -> fq.id::text
  from public.form_questions fq
  where fq.form_id = p_form_id
    and public.is_form_question_visible(fq, p_answers)
  order by fq.position, fq.created_at;

  -- Attach uploaded files.
  for q in select * from public.form_questions where form_id = p_form_id and question_type = 'file_upload' loop
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    if jsonb_typeof(val) = 'array' then
      for file_item in select * from jsonb_array_elements(val) loop
        file_path := file_item ->> 'storage_path';
        if file_path is not null and (
          (auth.uid() is not null and split_part(file_path, '/', 1) = auth.uid()::text)
          or public.has_permission('submission.edit')
        ) then
          insert into public.form_submission_attachments
            (submission_id, question_id, name, size, mime_type, storage_path, uploaded_by)
          values (
            submission_rec.id, q.id,
            coalesce(nullif(file_item ->> 'name', ''), 'file'),
            coalesce(nullif(file_item ->> 'size', '')::bigint, 0),
            nullif(file_item ->> 'mime_type', ''),
            file_path,
            auth.uid()
          )
          on conflict (storage_path) do nothing;
        end if;
      end loop;
    end if;
  end loop;

  return submission_rec;
end;
$$;
revoke all on function public.submit_dynamic_form(uuid, jsonb) from public, anon;
grant execute on function public.submit_dynamic_form(uuid, jsonb) to authenticated, anon;


-- ── 4. Workflow RPCs ─────────────────────────────────────────────────────────
-- Move a submission through the workflow. Only the status changes; every answer,
-- snapshot and attachment stays untouched. Gated on submission.edit.
create or replace function public.update_form_submission_status(p_submission_id uuid, p_status text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_permission('submission.edit') then
    raise exception 'Not authorized to update submissions';
  end if;
  if p_status not in ('new', 'reviewing', 'need_information', 'qualified', 'rejected', 'approved', 'converted', 'archived') then
    raise exception 'Invalid submission status';
  end if;
  update public.form_submissions
     set status = p_status
   where id = p_submission_id;
  if not found then
    raise exception 'Submission not found';
  end if;
  return true;
end;
$$;
revoke all on function public.update_form_submission_status(uuid, text) from public, anon;
grant execute on function public.update_form_submission_status(uuid, text) to authenticated;

-- Claim / reassign / clear the reviewer (owner) of a submission. Gated on
-- submission.assign; a null p_reviewer_id unassigns and clears the timestamp.
create or replace function public.assign_form_submission_reviewer(p_submission_id uuid, p_reviewer_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  now_ts timestamptz := now();
begin
  if not public.has_permission('submission.assign') then
    raise exception 'Not authorized to assign submissions';
  end if;
  update public.form_submissions
     set reviewer_id = p_reviewer_id,
         reviewed_at = case when p_reviewer_id is null then null else now_ts end
   where id = p_submission_id;
  if not found then
    raise exception 'Submission not found';
  end if;
  return true;
end;
$$;
revoke all on function public.assign_form_submission_reviewer(uuid, uuid) from public, anon;
grant execute on function public.assign_form_submission_reviewer(uuid, uuid) to authenticated;

commit;
-- ── END MIGRATION: 20260825000000_admin_submission_inbox.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260826000000_submission_review_workflow.sql ─────────────────────────────────────────────
-- Session 10 — Submission Review Workflow
--
-- Extends the Submission Inbox into a full review and qualification workflow:
--   * Dedicated internal review notes table (form_submission_notes).
--   * Full audit event log table (form_submission_events) tracking actor, action,
--     old/new values, and exact timestamps.
--   * Reviewer assignment with validation (authorized internal team members only).
--   * Notification generation for the assigned reviewer.
--   * Status updates with optional review notes and audit history.
--   * Strict RLS preventing unauthorized access by clients, inactive users,
--     and employees without submission.view / submission.edit / submission.assign.
--   * Admin and authorized reviewers can seamlessly review, qualify, and reassign.

begin;

-- ── 1. Internal Review Notes Table ──────────────────────────────────────────
create table if not exists public.form_submission_notes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  note text not null check (length(btrim(note)) > 0 and length(note) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_form_submission_notes_submission
  on public.form_submission_notes(submission_id, created_at desc);

create index if not exists idx_form_submission_notes_author
  on public.form_submission_notes(author_id);

drop trigger if exists form_submission_notes_updated_at on public.form_submission_notes;
create trigger form_submission_notes_updated_at
  before update on public.form_submission_notes
  for each row execute function public.set_updated_at();

alter table public.form_submission_notes enable row level security;

-- Only active staff with submission.view can read internal notes.
drop policy if exists form_submission_notes_select on public.form_submission_notes;
create policy form_submission_notes_select on public.form_submission_notes
  for select to authenticated
  using (
    public.is_active()
    and not public.must_change_password_pending()
    and public.has_permission('submission.view')
  );

-- Only active staff with submission.edit can insert notes.
drop policy if exists form_submission_notes_insert on public.form_submission_notes;
create policy form_submission_notes_insert on public.form_submission_notes
  for insert to authenticated
  with check (
    public.is_active()
    and not public.must_change_password_pending()
    and public.has_permission('submission.edit')
    and author_id = auth.uid()
  );

-- Author or Admin can update notes.
drop policy if exists form_submission_notes_update on public.form_submission_notes;
create policy form_submission_notes_update on public.form_submission_notes
  for update to authenticated
  using (
    public.is_active()
    and not public.must_change_password_pending()
    and (
      public.has_permission('admin.manage')
      or (public.has_permission('submission.edit') and author_id = auth.uid())
    )
  )
  with check (
    public.is_active()
    and not public.must_change_password_pending()
    and (
      public.has_permission('admin.manage')
      or (public.has_permission('submission.edit') and author_id = auth.uid())
    )
  );

-- Author or Admin can delete notes.
drop policy if exists form_submission_notes_delete on public.form_submission_notes;
create policy form_submission_notes_delete on public.form_submission_notes
  for delete to authenticated
  using (
    public.is_active()
    and not public.must_change_password_pending()
    and (
      public.has_permission('admin.manage')
      or (public.has_permission('submission.edit') and author_id = auth.uid())
    )
  );

-- ── 2. Audit Trail / Events Table ───────────────────────────────────────────
create table if not exists public.form_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (
    event_type in (
      'created', 'status_changed',
      'reviewer_assigned', 'reviewer_unassigned', 'reviewer_reassigned',
      'note_added', 'note_deleted', 'archived', 'restored'
    )
  ),
  old_value text,
  new_value text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_form_submission_events_submission
  on public.form_submission_events(submission_id, created_at desc);

create index if not exists idx_form_submission_events_actor
  on public.form_submission_events(actor_id);

alter table public.form_submission_events enable row level security;

-- Only active staff with submission.view can read events.
drop policy if exists form_submission_events_select on public.form_submission_events;
create policy form_submission_events_select on public.form_submission_events
  for select to authenticated
  using (
    public.is_active()
    and not public.must_change_password_pending()
    and public.has_permission('submission.view')
  );

-- Insert allowed by authorized staff or security-definer RPCs.
drop policy if exists form_submission_events_insert on public.form_submission_events;
create policy form_submission_events_insert on public.form_submission_events
  for insert to authenticated
  with check (
    public.is_active()
    and not public.must_change_password_pending()
    and (
      public.has_permission('submission.edit')
      or public.has_permission('submission.assign')
      or public.has_permission('admin.manage')
    )
  );

-- No direct update or delete on audit events (tamper-evident log).
drop policy if exists form_submission_events_no_update on public.form_submission_events;
create policy form_submission_events_no_update on public.form_submission_events
  for update to authenticated using (false);

drop policy if exists form_submission_events_no_delete on public.form_submission_events;
create policy form_submission_events_no_delete on public.form_submission_events
  for delete to authenticated using (false);

-- ── 3. RPC: Add Review Note ──────────────────────────────────────────────────
create or replace function public.add_form_submission_note(
  p_submission_id uuid,
  p_note text
)
returns public.form_submission_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  note_rec public.form_submission_notes;
  clean_note text := btrim(coalesce(p_note, ''));
  sub_rec public.form_submissions;
  caller_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_permission('submission.edit') then
    raise exception 'Not authorized to add review notes';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active' then
    raise exception 'User is not active';
  end if;

  select * into sub_rec from public.form_submissions where id = p_submission_id;
  if sub_rec.id is null then
    raise exception 'Submission not found';
  end if;

  if length(clean_note) = 0 then
    raise exception 'Note cannot be empty';
  end if;
  if length(clean_note) > 10000 then
    raise exception 'Note exceeds maximum length of 10,000 characters';
  end if;

  insert into public.form_submission_notes (submission_id, author_id, note)
  values (p_submission_id, auth.uid(), clean_note)
  returning * into note_rec;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, note, metadata
  ) values (
    p_submission_id,
    auth.uid(),
    'note_added',
    case when length(clean_note) > 140 then substring(clean_note from 1 for 137) || '...' else clean_note end,
    jsonb_build_object('note_id', note_rec.id, 'author_name', coalesce(caller_profile.full_name, caller_profile.email))
  );

  update public.form_submissions
     set updated_at = now()
   where id = p_submission_id;

  return note_rec;
end;
$$;
revoke all on function public.add_form_submission_note(uuid, text) from public, anon;
grant execute on function public.add_form_submission_note(uuid, text) to authenticated;

-- ── 4. RPC: Delete Review Note ───────────────────────────────────────────────
create or replace function public.delete_form_submission_note(
  p_note_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  note_rec public.form_submission_notes;
  caller_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active' then
    raise exception 'User is not active';
  end if;

  select * into note_rec from public.form_submission_notes where id = p_note_id;
  if note_rec.id is null then
    raise exception 'Note not found';
  end if;

  if not (
    note_rec.author_id = auth.uid()
    or public.has_permission('admin.manage')
  ) then
    raise exception 'Not authorized to delete this review note';
  end if;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, note, metadata
  ) values (
    note_rec.submission_id,
    auth.uid(),
    'note_deleted',
    'Review note deleted',
    jsonb_build_object('deleted_note_id', p_note_id, 'author_id', note_rec.author_id)
  );

  delete from public.form_submission_notes where id = p_note_id;

  update public.form_submissions
     set updated_at = now()
   where id = note_rec.submission_id;

  return true;
end;
$$;
revoke all on function public.delete_form_submission_note(uuid) from public, anon;
grant execute on function public.delete_form_submission_note(uuid) to authenticated;

-- ── 5. Enhanced Status Update RPC with Audit & Optional Note ─────────────────
drop function if exists public.update_form_submission_status(uuid, text);
drop function if exists public.update_form_submission_status(uuid, text, text);

create or replace function public.update_form_submission_status(
  p_submission_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  sub_rec public.form_submissions;
  old_status text;
  caller_profile public.profiles;
  clean_note text := btrim(coalesce(p_note, ''));
  action_event_type text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_permission('submission.edit') then
    raise exception 'Not authorized to update submissions';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active' then
    raise exception 'User is not active';
  end if;

  select * into sub_rec from public.form_submissions where id = p_submission_id;
  if sub_rec.id is null then
    raise exception 'Submission not found';
  end if;

  if p_status not in (
    'new', 'reviewing', 'need_information',
    'qualified', 'rejected', 'approved', 'converted', 'archived'
  ) then
    raise exception 'Invalid submission status';
  end if;

  old_status := sub_rec.status;

  update public.form_submissions
     set status = p_status,
         updated_at = now()
   where id = p_submission_id;

  action_event_type := case
    when p_status = 'archived' then 'archived'
    when old_status = 'archived' then 'restored'
    else 'status_changed'
  end;

  if length(clean_note) > 0 then
    insert into public.form_submission_notes (submission_id, author_id, note)
    values (p_submission_id, auth.uid(), clean_note);
  end if;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, old_value, new_value, note, metadata
  ) values (
    p_submission_id,
    auth.uid(),
    action_event_type,
    old_status,
    p_status,
    case when length(clean_note) > 0 then clean_note else null end,
    jsonb_build_object(
      'previous_status', old_status,
      'new_status', p_status,
      'actor_name', coalesce(caller_profile.full_name, caller_profile.email)
    )
  );

  return true;
end;
$$;
revoke all on function public.update_form_submission_status(uuid, text, text) from public, anon;
grant execute on function public.update_form_submission_status(uuid, text, text) to authenticated;

-- ── 6. Enhanced Reviewer Assignment RPC with Validation & Notification ───────
drop function if exists public.assign_form_submission_reviewer(uuid, uuid);
drop function if exists public.assign_form_submission_reviewer(uuid, uuid, text);

create or replace function public.assign_form_submission_reviewer(
  p_submission_id uuid,
  p_reviewer_id uuid,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  sub_rec public.form_submissions;
  old_reviewer_id uuid;
  old_reviewer_name text;
  new_reviewer_name text;
  caller_profile public.profiles;
  target_reviewer public.profiles;
  form_rec public.form_templates;
  client_display text;
  actor_name text;
  clean_note text := btrim(coalesce(p_note, ''));
  action_event_type text;
  now_ts timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_permission('submission.assign') then
    raise exception 'Not authorized to assign submissions';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active' then
    raise exception 'User is not active';
  end if;

  select * into sub_rec from public.form_submissions where id = p_submission_id;
  if sub_rec.id is null then
    raise exception 'Submission not found';
  end if;

  old_reviewer_id := sub_rec.reviewer_id;
  if old_reviewer_id is not null then
    select coalesce(nullif(full_name, ''), email) into old_reviewer_name
    from public.profiles where id = old_reviewer_id;
  end if;

  actor_name := coalesce(nullif(caller_profile.full_name, ''), caller_profile.email, 'An administrator');

  if p_reviewer_id is not null then
    -- Validate authorized reviewer: active team member, not a client
    select * into target_reviewer from public.profiles where id = p_reviewer_id;
    if target_reviewer.id is null or target_reviewer.status <> 'active' or target_reviewer.role = 'client'::public.app_role then
      raise exception 'Selected reviewer is not an authorized team member';
    end if;

    new_reviewer_name := coalesce(nullif(target_reviewer.full_name, ''), target_reviewer.email);

    update public.form_submissions
       set reviewer_id = p_reviewer_id,
           reviewed_at = now_ts,
           updated_at = now_ts
     where id = p_submission_id;

    action_event_type := case
      when old_reviewer_id is null then 'reviewer_assigned'
      else 'reviewer_reassigned'
    end;

    if length(clean_note) > 0 then
      insert into public.form_submission_notes (submission_id, author_id, note)
      values (p_submission_id, auth.uid(), clean_note);
    end if;

    insert into public.form_submission_events (
      submission_id, actor_id, event_type, old_value, new_value, note, metadata
    ) values (
      p_submission_id,
      auth.uid(),
      action_event_type,
      old_reviewer_name,
      new_reviewer_name,
      case when length(clean_note) > 0 then clean_note else null end,
      jsonb_build_object(
        'reviewer_id', p_reviewer_id,
        'reviewer_name', new_reviewer_name,
        'previous_reviewer_id', old_reviewer_id,
        'actor_name', actor_name
      )
    );

    -- Notify the assigned reviewer (only when assigned to someone else)
    if p_reviewer_id <> auth.uid() then
      select * into form_rec from public.form_templates where id = sub_rec.form_id;

      client_display := coalesce(
        nullif(btrim(sub_rec.company_name), ''),
        nullif(btrim(sub_rec.respondent_name), ''),
        nullif(btrim(sub_rec.respondent_email), ''),
        'a client'
      );

      insert into public.notifications (
        recipient_id,
        actor_id,
        submission_id,
        type,
        title,
        message,
        action_url,
        metadata
      ) values (
        p_reviewer_id,
        auth.uid(),
        p_submission_id,
        'assignment',
        'You were assigned to review a submission',
        'You were assigned to review the submission from ' || client_display || ' for form “' || coalesce(form_rec.title, 'Form') || '” by ' || actor_name || '.',
        '/submissions?submission=' || p_submission_id::text,
        jsonb_build_object(
          'submission_id', p_submission_id,
          'form_id', sub_rec.form_id,
          'form_name', coalesce(form_rec.title, 'Form'),
          'client_name', client_display,
          'respondent_name', sub_rec.respondent_name,
          'respondent_email', sub_rec.respondent_email,
          'company_name', sub_rec.company_name,
          'assigned_by', actor_name,
          'assigned_at', now_ts
        )
      );
    end if;

  else
    -- Unassign reviewer
    update public.form_submissions
       set reviewer_id = null,
           reviewed_at = null,
           updated_at = now_ts
     where id = p_submission_id;

    if length(clean_note) > 0 then
      insert into public.form_submission_notes (submission_id, author_id, note)
      values (p_submission_id, auth.uid(), clean_note);
    end if;

    insert into public.form_submission_events (
      submission_id, actor_id, event_type, old_value, new_value, note, metadata
    ) values (
      p_submission_id,
      auth.uid(),
      'reviewer_unassigned',
      old_reviewer_name,
      null,
      case when length(clean_note) > 0 then clean_note else null end,
      jsonb_build_object(
        'previous_reviewer_id', old_reviewer_id,
        'previous_reviewer_name', old_reviewer_name,
        'actor_name', actor_name
      )
    );
  end if;

  return true;
end;
$$;
revoke all on function public.assign_form_submission_reviewer(uuid, uuid, text) from public, anon;
grant execute on function public.assign_form_submission_reviewer(uuid, uuid, text) to authenticated;

-- ── 7. Update submit_dynamic_form to record creation event ───────────────────
create or replace function public.submit_dynamic_form(
  p_form_id uuid,
  p_answers jsonb
)
returns public.form_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  form_rec public.form_templates;
  q public.form_questions;
  val jsonb;
  txt text;
  is_empty boolean;
  missing text[];
  submission_rec public.form_submissions;
  linked_client_id uuid;
  linked_project_id uuid;
  file_item jsonb;
  file_path text;
  file_name text;
  file_size bigint;
  file_ext text;
  rating_max_val integer;
  -- Rate limiting
  recent_count integer;
  -- Duplicate detection
  respondent_email_val text;
  fp text;
  dup_count integer;
  -- Payload validation
  answer_key text;
  answer_val text;
begin
  -- ── Form existence and status ──────────────────────────────────────────
  select * into form_rec from public.form_templates where id = p_form_id;
  if not found then
    raise exception 'Form not found';
  end if;
  if form_rec.status <> 'published' then
    raise exception 'This form is not accepting submissions';
  end if;

  -- ── Payload size guard ─────────────────────────────────────────────────
  if length(p_answers::text) > 102400 then
    raise exception 'Your submission is too large. Please shorten your answers.';
  end if;

  for answer_key, answer_val in select * from jsonb_each_text(p_answers)
  loop
    if length(answer_val) > 10000 then
      raise exception 'One of your answers exceeds the maximum allowed length.';
    end if;
  end loop;

  -- ── Rate limiting: max 5 submissions per minute per session+form ───────
  select count(*) into recent_count
  from public.form_rate_limits
  where session_id = auth.uid()
    and form_id = p_form_id
    and submitted_at > now() - interval '1 minute';

  if recent_count >= 5 then
    raise exception 'You are submitting too frequently. Please wait a moment and try again.';
  end if;

  -- ── Per-session cooldown: minimum 3 seconds between submissions ────────
  if exists (
    select 1 from public.form_rate_limits
    where session_id = auth.uid()
      and form_id = p_form_id
      and submitted_at > now() - interval '3 seconds'
  ) then
    raise exception 'Please wait a few seconds before submitting again.';
  end if;

  -- ── Validate answers ───────────────────────────────────────────────────
  for q in
    select * from public.form_questions where form_id = p_form_id order by position, created_at
  loop
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    is_empty := val is null
      or val = 'null'::jsonb
      or (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') = '')
      or (jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 0);

    if q.required and is_empty then
      missing := coalesce(missing, '{}') || q.label;
      continue;
    end if;

    if not is_empty then
      if q.question_type in ('single_choice', 'dropdown') then
        if jsonb_typeof(val) <> 'string'
           or not exists (select 1 from jsonb_array_elements_text(q.options) o where o = val #>> '{}') then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'multiple_choice' then
        if jsonb_typeof(val) <> 'array'
           or exists (select 1 from jsonb_array_elements_text(val) v where not exists (
                select 1 from jsonb_array_elements_text(q.options) o where o = v)) then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'yes_no' then
        if jsonb_typeof(val) <> 'string' or (val #>> '{}') not in ('yes', 'no') then
          raise exception 'Invalid answer for "%"', q.label;
        end if;
      elsif q.question_type = 'number' then
        if jsonb_typeof(val) <> 'number' and (jsonb_typeof(val) <> 'string' or (val #>> '{}') !~ '^-?\d+(\.\d+)?$') then
          raise exception 'Invalid number for "%"', q.label;
        end if;
      elsif q.question_type = 'rating' then
        rating_max_val := greatest(1, least(10, coalesce(nullif(q.config ->> 'rating_max', '')::integer, 5)));
        if (val #>> '{}') !~ '^\d+$'
           or (val #>> '{}')::integer < 1
           or (val #>> '{}')::integer > rating_max_val then
          raise exception 'Invalid rating for "%"', q.label;
        end if;
      elsif q.question_type = 'file_upload' then
        if jsonb_typeof(val) <> 'array' then
          raise exception 'Invalid file answer for "%"', q.label;
        end if;
        if jsonb_array_length(val) > 10 then
          raise exception 'Too many files uploaded for "%". Maximum is 10.', q.label;
        end if;

        for file_item in select * from jsonb_array_elements(val) loop
          file_name := coalesce(file_item ->> 'name', '');
          file_size := coalesce(nullif(file_item ->> 'size', '')::bigint, 0);

          if file_size > 20971520 then
            raise exception 'Uploaded file "%" exceeds maximum allowed size of 20 MB.', file_name;
          end if;

          file_ext := lower(substring(file_name from '\.([a-zA-Z0-9]+)$'));
          if file_ext in ('exe', 'bat', 'cmd', 'sh', 'php', 'phtml', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'js', 'vbs', 'msi', 'jar', 'scr', 'hta', 'ps1') then
            raise exception 'Uploaded file "%" has an unsafe file extension and is rejected.', file_name;
          end if;
        end loop;
      end if;

      txt := case when jsonb_typeof(val) = 'string' then btrim(val #>> '{}') else null end;
      if nullif(txt, '') is not null then
        if q.map_to = 'name' then submission_rec.respondent_name := txt; end if;
        if q.map_to = 'email' then respondent_email_val := lower(txt); end if;
        if q.map_to = 'phone' then submission_rec.respondent_phone := txt; end if;
        if q.map_to = 'company' then submission_rec.company_name := txt; end if;
      end if;
    end if;
  end loop;

  submission_rec.respondent_email := respondent_email_val;

  if missing is not null then
    raise exception 'Required questions are missing: %', array_to_string(missing, ', ');
  end if;

  -- ── Duplicate submission detection ─────────────────────────────────────
  if respondent_email_val is not null then
    fp := encode(digest(respondent_email_val || p_form_id::text, 'sha256'), 'hex');
    select count(*) into dup_count
    from public.form_submission_fingerprints
    where form_id = p_form_id
      and fingerprint = fp
      and submitted_at > now() - interval '5 minutes';

    if dup_count > 0 then
      raise exception 'You have already submitted a response recently. Please wait a few minutes before submitting again.';
    end if;

    insert into public.form_submission_fingerprints (form_id, fingerprint)
    values (p_form_id, fp);
  end if;

  -- ── Record rate-limit entry ────────────────────────────────────────────
  insert into public.form_rate_limits (session_id, form_id)
  values (auth.uid(), p_form_id);

  -- ── Match or create CRM client ─────────────────────────────────────────
  if respondent_email_val is not null then
    select id into linked_client_id
    from public.clients
    where lower(coalesce(email, '')) = respondent_email_val
    order by created_at asc
    limit 1;

    if linked_client_id is null then
      insert into public.clients (name, type, status, contact_person, email, phone, notes, created_by)
      values (
        coalesce(nullif(submission_rec.company_name, ''), nullif(submission_rec.respondent_name, ''), respondent_email_val),
        'potential',
        'potential',
        nullif(submission_rec.respondent_name, ''),
        respondent_email_val,
        nullif(submission_rec.respondent_phone, ''),
        'Created automatically from form "' || form_rec.title || '"',
        auth.uid()
      )
      returning id into linked_client_id;
    end if;
  end if;

  -- ── Optional: open a project ───────────────────────────────────────────
  if coalesce(form_rec.settings ->> 'create_project_on_submit', 'false') = 'true' and linked_client_id is not null then
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      coalesce(nullif(submission_rec.company_name, '') || ' — ', '') || form_rec.title,
      'Created automatically from a submission to form "' || form_rec.title || '"',
      linked_client_id,
      form_rec.title,
      'active', 1, 'Discovery', 0, auth.uid()
    )
    returning id into linked_project_id;
  end if;

  -- ── Store submission ───────────────────────────────────────────────────
  insert into public.form_submissions
    (form_id, form_version, status, respondent_name, respondent_email, respondent_phone, company_name, client_id, project_id, created_by)
  values (
    p_form_id, form_rec.version, 'new',
    submission_rec.respondent_name, submission_rec.respondent_email,
    submission_rec.respondent_phone, submission_rec.company_name,
    linked_client_id, linked_project_id, auth.uid()
  )
  returning * into submission_rec;

  -- Freeze each answer together with the question it answered
  insert into public.form_submission_answers (submission_id, question_id, question_snapshot, value)
  select submission_rec.id, fq.id, to_jsonb(fq), p_answers -> fq.id::text
  from public.form_questions fq
  where fq.form_id = p_form_id
    and public.is_form_question_visible(fq, p_answers)
  order by fq.position, fq.created_at;

  -- Record submission creation event in audit trail
  insert into public.form_submission_events (
    submission_id, actor_id, event_type, new_value, note, metadata
  ) values (
    submission_rec.id,
    (select id from public.profiles where id = auth.uid()),
    'created',
    'new',
    'Submission received',
    jsonb_build_object(
      'form_version', form_rec.version,
      'form_title', form_rec.title,
      'respondent_email', submission_rec.respondent_email
    )
  );

  -- Attach uploaded files
  for q in select * from public.form_questions where form_id = p_form_id and question_type = 'file_upload' loop
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    if jsonb_typeof(val) = 'array' then
      for file_item in select * from jsonb_array_elements(val) loop
        file_path := file_item ->> 'storage_path';
        if file_path is not null and (
          (auth.uid() is not null and split_part(file_path, '/', 1) = auth.uid()::text)
          or public.has_permission('submission.edit')
        ) then
          insert into public.form_submission_attachments
            (submission_id, question_id, name, size, mime_type, storage_path, uploaded_by)
          values (
            submission_rec.id, q.id,
            coalesce(nullif(file_item ->> 'name', ''), 'file'),
            coalesce(nullif(file_item ->> 'size', '')::bigint, 0),
            nullif(file_item ->> 'mime_type', ''),
            file_path,
            auth.uid()
          )
          on conflict (storage_path) do nothing;
        end if;
      end loop;
    end if;
  end loop;

  return submission_rec;
end;
$$;
revoke all on function public.submit_dynamic_form(uuid, jsonb) from public, anon;
grant execute on function public.submit_dynamic_form(uuid, jsonb) to authenticated, anon;

commit;
-- ── END MIGRATION: 20260826000000_submission_review_workflow.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260827000000_controlled_submission_project_conversion.sql ─────────────────────────────────────────────
-- Session 11 — Controlled Submission → Project Conversion
--
-- Adds one deliberate, atomic Admin workflow for turning a qualified/approved
-- submission into a configured project. The conversion keeps the immutable
-- answer rows in place, links both records, prevents duplicates (including
-- concurrent attempts), creates/selects the CRM client, and assigns the initial
-- owner, manager, and team in the same transaction.

begin;

-- ── 1. Project ownership, priority, and immutable submission provenance ─────
alter table public.projects
  add column if not exists priority text not null default 'medium',
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists manager_id uuid references public.profiles(id) on delete set null,
  add column if not exists source_submission_id uuid references public.form_submissions(id) on delete restrict;

alter table public.projects drop constraint if exists projects_priority_check;
alter table public.projects add constraint projects_priority_check
  check (priority in ('low', 'medium', 'high', 'urgent'));

create unique index if not exists projects_source_submission_unique
  on public.projects(source_submission_id)
  where source_submission_id is not null;
create index if not exists idx_projects_owner on public.projects(owner_id);
create index if not exists idx_projects_manager on public.projects(manager_id);

alter table public.form_submissions
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_form_submissions_converted_by
  on public.form_submissions(converted_by)
  where converted_by is not null;

comment on column public.projects.source_submission_id is
  'Immutable provenance link to the original form submission. Answers remain in form_submission_answers.';
comment on column public.form_submissions.converted_at is
  'Permanent conversion marker; retained even if the linked project is later deleted.';

-- Backfill projects made by the legacy, explicitly enabled submit-time automation.
update public.projects p
set source_submission_id = candidate.submission_id
from (
  select distinct on (fs.project_id) fs.project_id, fs.id as submission_id
  from public.form_submissions fs
  where fs.project_id is not null
  order by fs.project_id, fs.submitted_at asc
) candidate
where p.id = candidate.project_id
  and p.source_submission_id is null;

update public.form_submissions fs
set status = 'converted',
    converted_at = coalesce(fs.converted_at, fs.updated_at, fs.submitted_at),
    converted_by = coalesce(fs.converted_by, p.created_by),
    updated_at = now()
from public.projects p
where fs.project_id = p.id
  and (fs.status <> 'converted' or fs.converted_at is null);

-- Once populated, the source can never be swapped or cleared by a normal update.
create or replace function public.protect_project_submission_reference()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.source_submission_id is not null
     and new.source_submission_id is distinct from old.source_submission_id then
    raise exception 'A project submission reference is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_project_submission_reference on public.projects;
create trigger protect_project_submission_reference
before update of source_submission_id on public.projects
for each row execute function public.protect_project_submission_reference();

-- ── 2. Conversion audit event ───────────────────────────────────────────────
alter table public.form_submission_events
  drop constraint if exists form_submission_events_event_type_check;
alter table public.form_submission_events
  add constraint form_submission_events_event_type_check check (
    event_type in (
      'created', 'status_changed',
      'reviewer_assigned', 'reviewer_unassigned', 'reviewer_reassigned',
      'note_added', 'note_deleted', 'archived', 'restored',
      'converted_to_project'
    )
  );

-- ── 3. Only an Admin may explicitly enable submit-time project automation ───
-- Existing true settings are retained only when the form was created by an
-- Admin. Everything else returns to the safe/default manual conversion path.
update public.form_templates ft
set settings = case
  when exists (
    select 1 from public.profiles p
    where p.id = ft.created_by and p.role = 'admin'::public.app_role
  ) then jsonb_set(
    jsonb_set(coalesce(ft.settings, '{}'::jsonb), '{auto_project_configured_by}', to_jsonb(ft.created_by::text), true),
    '{auto_project_configured_at}', to_jsonb(coalesce(ft.updated_at, now())::text), true
  )
  else (coalesce(ft.settings, '{}'::jsonb) - 'auto_project_configured_by' - 'auto_project_configured_at')
       || '{"create_project_on_submit": false}'::jsonb
end
where coalesce(ft.settings ->> 'create_project_on_submit', 'false') = 'true';

create or replace function public.enforce_admin_auto_project_configuration()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  was_enabled boolean := case when tg_op = 'INSERT' then false else coalesce(old.settings ->> 'create_project_on_submit', 'false') = 'true' end;
  is_enabled boolean := coalesce(new.settings ->> 'create_project_on_submit', 'false') = 'true';
begin
  if is_enabled and not was_enabled then
    if auth.uid() is null or not public.has_permission('admin.manage') then
      raise exception 'Only an Admin can enable automatic project creation';
    end if;
    new.settings := jsonb_set(
      jsonb_set(coalesce(new.settings, '{}'::jsonb), '{auto_project_configured_by}', to_jsonb(auth.uid()::text), true),
      '{auto_project_configured_at}', to_jsonb(now()::text), true
    );
  elsif not is_enabled then
    new.settings := coalesce(new.settings, '{}'::jsonb)
      - 'auto_project_configured_by' - 'auto_project_configured_at';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_admin_auto_project_configuration on public.form_templates;
create trigger enforce_admin_auto_project_configuration
before insert or update of settings on public.form_templates
for each row execute function public.enforce_admin_auto_project_configuration();

-- The existing public submission RPC creates an automated project immediately
-- before inserting its submission. These triggers complete the two-way source
-- link and record that exceptional automated conversion after answers are saved.
create or replace function public.link_automated_project_to_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null then
    update public.projects
       set source_submission_id = new.id
     where id = new.project_id
       and source_submission_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists link_automated_project_to_submission on public.form_submissions;
create trigger link_automated_project_to_submission
after insert or update of project_id on public.form_submissions
for each row execute function public.link_automated_project_to_submission();

create or replace function public.finalize_automated_submission_conversion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sub_rec public.form_submissions;
  project_name text;
  configured_admin uuid;
begin
  if new.event_type <> 'created' then
    return new;
  end if;

  select * into sub_rec
  from public.form_submissions
  where id = new.submission_id and project_id is not null
  for update;

  if sub_rec.id is null or sub_rec.converted_at is not null then
    return new;
  end if;

  select p.name into project_name from public.projects p where p.id = sub_rec.project_id;
  select nullif(ft.settings ->> 'auto_project_configured_by', '')::uuid
    into configured_admin
  from public.form_templates ft where ft.id = sub_rec.form_id;

  update public.form_submissions
     set status = 'converted',
         converted_at = now(),
         converted_by = configured_admin,
         updated_at = now()
   where id = sub_rec.id;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, old_value, new_value, note, metadata
  ) values (
    sub_rec.id, configured_admin, 'converted_to_project', sub_rec.status, 'converted',
    'Project created by Admin-configured form automation',
    jsonb_build_object(
      'project_id', sub_rec.project_id,
      'project_name', project_name,
      'client_id', sub_rec.client_id,
      'automatic', true,
      'answers_preserved', true
    )
  );

  return new;
end;
$$;

drop trigger if exists finalize_automated_submission_conversion on public.form_submission_events;
create trigger finalize_automated_submission_conversion
after insert on public.form_submission_events
for each row when (new.event_type = 'created')
execute function public.finalize_automated_submission_conversion();

-- ── 4. Status changes cannot impersonate or undo a conversion ───────────────
create or replace function public.update_form_submission_status(
  p_submission_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  sub_rec public.form_submissions;
  old_status text;
  caller_profile public.profiles;
  clean_note text := btrim(coalesce(p_note, ''));
  action_event_type text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.has_permission('submission.edit') then
    raise exception 'Not authorized to update submissions';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active' then
    raise exception 'User is not active';
  end if;

  select * into sub_rec
  from public.form_submissions
  where id = p_submission_id
  for update;
  if sub_rec.id is null then raise exception 'Submission not found'; end if;

  if p_status = 'converted' then
    raise exception 'Use Convert to Project to set the Converted status';
  end if;
  if sub_rec.status = 'converted' or sub_rec.converted_at is not null then
    raise exception 'A converted submission cannot be moved to another status';
  end if;
  if p_status not in (
    'new', 'reviewing', 'need_information',
    'qualified', 'rejected', 'approved', 'archived'
  ) then
    raise exception 'Invalid submission status';
  end if;

  old_status := sub_rec.status;
  update public.form_submissions
     set status = p_status, updated_at = now()
   where id = p_submission_id;

  action_event_type := case
    when p_status = 'archived' then 'archived'
    when old_status = 'archived' then 'restored'
    else 'status_changed'
  end;

  if length(clean_note) > 0 then
    insert into public.form_submission_notes (submission_id, author_id, note)
    values (p_submission_id, auth.uid(), clean_note);
  end if;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, old_value, new_value, note, metadata
  ) values (
    p_submission_id, auth.uid(), action_event_type, old_status, p_status,
    case when length(clean_note) > 0 then clean_note else null end,
    jsonb_build_object(
      'previous_status', old_status,
      'new_status', p_status,
      'actor_name', coalesce(caller_profile.full_name, caller_profile.email)
    )
  );
  return true;
end;
$$;
revoke all on function public.update_form_submission_status(uuid, text, text) from public, anon;
grant execute on function public.update_form_submission_status(uuid, text, text) to authenticated;

-- ── 5. Atomic, Admin-only controlled conversion RPC ─────────────────────────
create or replace function public.convert_submission_to_project(
  p_submission_id uuid,
  p_client_id uuid,
  p_new_client jsonb,
  p_project_name text,
  p_description text,
  p_project_type text,
  p_priority text,
  p_status text,
  p_phase integer,
  p_phase_name text,
  p_start_date date,
  p_due_date date,
  p_budget numeric,
  p_currency text,
  p_owner_id uuid,
  p_manager_id uuid,
  p_team_member_ids uuid[]
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  sub_rec public.form_submissions;
  project_rec public.projects;
  client_rec public.clients;
  caller_profile public.profiles;
  resolved_client_id uuid;
  clean_project_name text := btrim(coalesce(p_project_name, ''));
  clean_project_type text := btrim(coalesce(p_project_type, ''));
  clean_currency text := upper(btrim(coalesce(p_currency, 'USD')));
  clean_client_name text;
  clean_client_email text;
  answer_count integer;
  attachment_count integer;
  requested_team_count integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.has_permission('admin.manage') then
    raise exception 'Only an Admin can convert a submission to a project';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active'
     or public.must_change_password_pending() then
    raise exception 'Admin account is not active';
  end if;

  -- Serializes concurrent conversion attempts for the same submission.
  select * into sub_rec
  from public.form_submissions
  where id = p_submission_id
  for update;

  if sub_rec.id is null then raise exception 'Submission not found'; end if;
  if sub_rec.status not in ('qualified', 'approved') then
    raise exception 'Submission must be Qualified or Approved before conversion';
  end if;
  if sub_rec.project_id is not null or sub_rec.converted_at is not null
     or exists (select 1 from public.projects p where p.source_submission_id = sub_rec.id) then
    raise exception 'This submission has already been converted';
  end if;

  if clean_project_name = '' or length(clean_project_name) > 200 then
    raise exception 'Project name is required and must be at most 200 characters';
  end if;
  if clean_project_type = '' or length(clean_project_type) > 100 then
    raise exception 'Project type is required and must be at most 100 characters';
  end if;
  if p_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'Invalid project priority';
  end if;
  if p_status not in ('active', 'review', 'completed', 'on-hold', 'cancelled') then
    raise exception 'Invalid initial project status';
  end if;
  if p_phase is null or p_phase not between 1 and 10 then
    raise exception 'Project phase must be between 1 and 10';
  end if;
  if p_start_date is not null and p_due_date is not null and p_due_date < p_start_date then
    raise exception 'Project deadline cannot be before its start date';
  end if;
  if p_budget is not null and p_budget < 0 then raise exception 'Budget cannot be negative'; end if;
  if clean_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a 3-letter code'; end if;

  -- Select an existing client OR create one inside this same transaction.
  if p_client_id is not null and p_new_client is not null then
    raise exception 'Select an existing client or create a new client, not both';
  elsif p_client_id is not null then
    select * into client_rec from public.clients where id = p_client_id;
    if client_rec.id is null then raise exception 'Selected client was not found'; end if;
    resolved_client_id := client_rec.id;
  elsif p_new_client is not null then
    clean_client_name := btrim(coalesce(p_new_client ->> 'name', ''));
    clean_client_email := lower(nullif(btrim(coalesce(p_new_client ->> 'email', '')), ''));
    if clean_client_name = '' or length(clean_client_name) > 200 then
      raise exception 'New client name is required and must be at most 200 characters';
    end if;
    if clean_client_email is not null and exists (
      select 1 from public.clients where lower(coalesce(email, '')) = clean_client_email
    ) then
      raise exception 'A client with this e-mail already exists; select that client instead';
    end if;
    if coalesce(p_new_client ->> 'type', 'smb') not in ('enterprise', 'smb', 'individual', 'potential') then
      raise exception 'Invalid client type';
    end if;

    insert into public.clients (
      name, type, status, contact_person, email, phone, notes, created_by
    ) values (
      clean_client_name,
      coalesce(p_new_client ->> 'type', 'smb'),
      'active',
      nullif(btrim(coalesce(p_new_client ->> 'contact_person', '')), ''),
      clean_client_email,
      nullif(btrim(coalesce(p_new_client ->> 'phone', '')), ''),
      'Created during controlled conversion of submission ' || sub_rec.id::text,
      auth.uid()
    ) returning * into client_rec;
    resolved_client_id := client_rec.id;
  else
    raise exception 'A client must be selected or created';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_owner_id and p.status = 'active' and p.role <> 'client'::public.app_role
  ) then
    raise exception 'Select an active internal project owner';
  end if;
  if p_manager_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_manager_id and p.status = 'active' and p.role <> 'client'::public.app_role
  ) then
    raise exception 'Selected project manager is not an active internal team member';
  end if;

  select count(distinct member_id), count(*)
    into requested_team_count, answer_count
  from unnest(coalesce(p_team_member_ids, '{}'::uuid[])) member_id;
  -- The second count above is only temporary; use it to detect duplicate/null input.
  if requested_team_count <> coalesce(array_length(p_team_member_ids, 1), 0)
     or exists (select 1 from unnest(coalesce(p_team_member_ids, '{}'::uuid[])) x where x is null) then
    raise exception 'Team member selections must be unique and non-empty';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_team_member_ids, '{}'::uuid[])) member_id
    left join public.profiles p on p.id = member_id
    where p.id is null or p.status <> 'active' or p.role = 'client'::public.app_role
  ) then
    raise exception 'Every selected team member must be an active internal user';
  end if;

  insert into public.projects (
    name, description, client_id, type, priority, status, phase, phase_name,
    progress, budget, currency, start_date, due_date, completed_date,
    owner_id, manager_id, source_submission_id, created_by
  ) values (
    clean_project_name,
    nullif(btrim(coalesce(p_description, '')), ''),
    resolved_client_id,
    clean_project_type,
    p_priority,
    p_status,
    p_phase,
    nullif(btrim(coalesce(p_phase_name, '')), ''),
    case when p_status = 'completed' then 100 else 0 end,
    p_budget,
    clean_currency,
    p_start_date,
    p_due_date,
    case when p_status = 'completed' then coalesce(p_due_date, current_date) else null end,
    p_owner_id,
    p_manager_id,
    sub_rec.id,
    auth.uid()
  ) returning * into project_rec;

  insert into public.project_members (project_id, user_id, assigned_by)
  select project_rec.id, member_id, auth.uid()
  from (
    select distinct member_id
    from unnest(
      coalesce(p_team_member_ids, '{}'::uuid[])
      || array[p_owner_id]
      || case when p_manager_id is null then '{}'::uuid[] else array[p_manager_id] end
    ) member_id
    where member_id is not null
  ) members;

  update public.form_submissions
     set status = 'converted',
         client_id = resolved_client_id,
         project_id = project_rec.id,
         converted_at = now(),
         converted_by = auth.uid(),
         updated_at = now()
   where id = sub_rec.id;

  select count(*) into answer_count
  from public.form_submission_answers where submission_id = sub_rec.id;
  select count(*) into attachment_count
  from public.form_submission_attachments where submission_id = sub_rec.id;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, old_value, new_value, note, metadata
  ) values (
    sub_rec.id,
    auth.uid(),
    'converted_to_project',
    sub_rec.status,
    'converted',
    'Submission deliberately converted to project “' || project_rec.name || '”',
    jsonb_build_object(
      'project_id', project_rec.id,
      'project_name', project_rec.name,
      'client_id', resolved_client_id,
      'owner_id', p_owner_id,
      'manager_id', p_manager_id,
      'team_member_ids', coalesce(p_team_member_ids, '{}'::uuid[]),
      'priority', project_rec.priority,
      'project_type', project_rec.type,
      'answer_count', answer_count,
      'attachment_count', attachment_count,
      'answers_preserved', true,
      'automatic', false
    )
  );

  return project_rec;
end;
$$;

revoke all on function public.convert_submission_to_project(
  uuid, uuid, jsonb, text, text, text, text, text, integer, text,
  date, date, numeric, text, uuid, uuid, uuid[]
) from public, anon;
grant execute on function public.convert_submission_to_project(
  uuid, uuid, jsonb, text, text, text, text, text, integer, text,
  date, date, numeric, text, uuid, uuid, uuid[]
) to authenticated;

commit;
-- ── END MIGRATION: 20260827000000_controlled_submission_project_conversion.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260828000000_project_ownership_status_lifecycle.sql ─────────────────────────────────────────────
-- Session 12 — Project Ownership, Status & Lifecycle
--
-- Turns the project record into a first-class deliverable with an explicit,
-- ordered lifecycle (Draft → Planned → Active → Waiting for Client → In Review
-- → Ready for Delivery → Delivered → Completed, plus On Hold and Cancelled),
-- a database-enforced status state machine, a project health indicator, and a
-- guarantee that the owner and manager are always project members — so
-- ownership is both visible everywhere and actually grants access.

begin;

-- ── 1. Expand the lifecycle ─────────────────────────────────────────────────
-- Migrate the legacy 'review' stage before widening the CHECK constraint so
-- existing rows keep working under the new vocabulary.
update public.projects set status = 'in-review' where status = 'review';

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check check (
  status in (
    'draft',
    'planned',
    'active',
    'waiting-for-client',
    'in-review',
    'ready-for-delivery',
    'delivered',
    'completed',
    'on-hold',
    'cancelled'
  )
);

comment on column public.projects.status is
  'Project lifecycle stage. Transitions are enforced by enforce_project_status_transition.';
comment on column public.projects.due_date is
  'Project deadline — the date the deliverable is due.';

-- ── 2. Project health ───────────────────────────────────────────────────────
alter table public.projects add column if not exists health text;
update public.projects set health = 'on-track' where health is null;
alter table public.projects alter column health set default 'on-track';
alter table public.projects alter column health set not null;
alter table public.projects drop constraint if exists projects_health_check;
alter table public.projects add constraint projects_health_check check (
  health in ('on-track', 'at-risk', 'off-track', 'blocked')
);
comment on column public.projects.health is
  'Operational health independent of lifecycle stage: on-track, at-risk, off-track, or blocked.';

create index if not exists idx_projects_health on public.projects(health);

-- ── 3. Valid status transitions (the lifecycle state machine) ───────────────
create or replace function public.valid_project_status_transition(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select (p_from = p_to)
    or (p_from, p_to) in (
      -- Draft can be planned, or dropped entirely.
      ('draft', 'planned'),
      ('draft', 'cancelled'),
      -- Planned work can start, pause, or be dropped.
      ('planned', 'active'),
      ('planned', 'on-hold'),
      ('planned', 'cancelled'),
      -- Active work either blocks on the client, goes to review, pauses, or is dropped.
      ('active', 'waiting-for-client'),
      ('active', 'in-review'),
      ('active', 'on-hold'),
      ('active', 'cancelled'),
      -- Client responses bring work back to active or on to review.
      ('waiting-for-client', 'active'),
      ('waiting-for-client', 'in-review'),
      ('waiting-for-client', 'on-hold'),
      ('waiting-for-client', 'cancelled'),
      -- Review approves into delivery, or bounces back for rework / more input.
      ('in-review', 'active'),
      ('in-review', 'waiting-for-client'),
      ('in-review', 'ready-for-delivery'),
      ('in-review', 'on-hold'),
      ('in-review', 'cancelled'),
      -- Ready for delivery hands off, bounces back, pauses, or is dropped.
      ('ready-for-delivery', 'delivered'),
      ('ready-for-delivery', 'in-review'),
      ('ready-for-delivery', 'on-hold'),
      ('ready-for-delivery', 'cancelled'),
      -- Delivered work is completed, or sent back for revisions.
      ('delivered', 'completed'),
      ('delivered', 'in-review'),
      ('delivered', 'on-hold'),
      -- On Hold resumes into any in-flight stage, or is cancelled.
      ('on-hold', 'draft'),
      ('on-hold', 'planned'),
      ('on-hold', 'active'),
      ('on-hold', 'waiting-for-client'),
      ('on-hold', 'in-review'),
      ('on-hold', 'ready-for-delivery'),
      ('on-hold', 'delivered'),
      ('on-hold', 'cancelled'),
      -- Cancelled work can be reopened as a fresh draft. Completed is terminal.
      ('cancelled', 'draft')
    );
$$;

create or replace function public.enforce_project_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if not public.valid_project_status_transition(old.status, new.status) then
      raise exception 'Invalid status transition from % to %.', old.status, new.status;
    end if;
    if new.status = 'completed' then
      new.completed_date := coalesce(new.completed_date, current_date);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_project_status_transition on public.projects;
create trigger enforce_project_status_transition
before update of status on public.projects
for each row execute function public.enforce_project_status_transition();

-- ── 4. Owner & manager are always project members ───────────────────────────
-- Ownership must grant access: whenever an owner or manager is set, they are
-- added to project_members. This runs as SECURITY DEFINER so the guarantee
-- holds regardless of which role performs the update.
create or replace function public.sync_project_lead_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is not null then
    insert into public.project_members (project_id, user_id, assigned_by)
    values (new.id, new.owner_id, coalesce(auth.uid(), new.created_by))
    on conflict (project_id, user_id) do nothing;
  end if;
  if new.manager_id is not null and new.manager_id is distinct from new.owner_id then
    insert into public.project_members (project_id, user_id, assigned_by)
    values (new.id, new.manager_id, coalesce(auth.uid(), new.created_by))
    on conflict (project_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_project_lead_membership on public.projects;
create trigger sync_project_lead_membership
after insert or update of owner_id, manager_id on public.projects
for each row execute function public.sync_project_lead_membership();

-- Backfill: any existing project whose owner or manager is missing from the
-- member list gets them added (idempotent).
insert into public.project_members (project_id, user_id, assigned_by)
select p.id, p.owner_id, p.created_by
from public.projects p
where p.owner_id is not null
on conflict (project_id, user_id) do nothing;

insert into public.project_members (project_id, user_id, assigned_by)
select p.id, p.manager_id, p.created_by
from public.projects p
where p.manager_id is not null
  and p.manager_id is distinct from p.owner_id
on conflict (project_id, user_id) do nothing;

-- ── 5. Project update notifications also watch health ───────────────────────
create or replace function public.notify_project_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.status, old.progress, old.phase, old.due_date, old.health) is distinct from
     (new.status, new.progress, new.phase, new.due_date, new.health) then
    insert into public.notifications (recipient_id, actor_id, project_id, type, title, message, action_url)
    select pm.user_id, auth.uid(), new.id, 'project_update', 'Project updated',
           new.name || ' has new progress, status, or health information.',
           '/projects/' || new.id::text
    from public.project_members pm
    where pm.project_id = new.id and pm.user_id is distinct from auth.uid();
  end if;
  return new;
end;
$$;

-- ── 6. Submission → project conversion accepts the full lifecycle ───────────
create or replace function public.convert_submission_to_project(
  p_submission_id uuid,
  p_client_id uuid,
  p_new_client jsonb,
  p_project_name text,
  p_description text,
  p_project_type text,
  p_priority text,
  p_status text,
  p_phase integer,
  p_phase_name text,
  p_start_date date,
  p_due_date date,
  p_budget numeric,
  p_currency text,
  p_owner_id uuid,
  p_manager_id uuid,
  p_team_member_ids uuid[]
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  sub_rec public.form_submissions;
  project_rec public.projects;
  client_rec public.clients;
  caller_profile public.profiles;
  resolved_client_id uuid;
  clean_project_name text := btrim(coalesce(p_project_name, ''));
  clean_project_type text := btrim(coalesce(p_project_type, ''));
  clean_currency text := upper(btrim(coalesce(p_currency, 'USD')));
  clean_client_name text;
  clean_client_email text;
  answer_count integer;
  attachment_count integer;
  requested_team_count integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.has_permission('admin.manage') then
    raise exception 'Only an Admin can convert a submission to a project';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active'
     or public.must_change_password_pending() then
    raise exception 'Admin account is not active';
  end if;

  -- Serializes concurrent conversion attempts for the same submission.
  select * into sub_rec
  from public.form_submissions
  where id = p_submission_id
  for update;

  if sub_rec.id is null then raise exception 'Submission not found'; end if;
  if sub_rec.status not in ('qualified', 'approved') then
    raise exception 'Submission must be Qualified or Approved before conversion';
  end if;
  if sub_rec.project_id is not null or sub_rec.converted_at is not null
     or exists (select 1 from public.projects p where p.source_submission_id = sub_rec.id) then
    raise exception 'This submission has already been converted';
  end if;

  if clean_project_name = '' or length(clean_project_name) > 200 then
    raise exception 'Project name is required and must be at most 200 characters';
  end if;
  if clean_project_type = '' or length(clean_project_type) > 100 then
    raise exception 'Project type is required and must be at most 100 characters';
  end if;
  if p_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'Invalid project priority';
  end if;
  if p_status not in (
    'draft', 'planned', 'active', 'waiting-for-client', 'in-review',
    'ready-for-delivery', 'delivered', 'completed', 'on-hold', 'cancelled'
  ) then
    raise exception 'Invalid initial project status';
  end if;
  if p_phase is null or p_phase not between 1 and 10 then
    raise exception 'Project phase must be between 1 and 10';
  end if;
  if p_start_date is not null and p_due_date is not null and p_due_date < p_start_date then
    raise exception 'Project deadline cannot be before its start date';
  end if;
  if p_budget is not null and p_budget < 0 then raise exception 'Budget cannot be negative'; end if;
  if clean_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a 3-letter code'; end if;

  -- Select an existing client OR create one inside this same transaction.
  if p_client_id is not null and p_new_client is not null then
    raise exception 'Select an existing client or create a new client, not both';
  elsif p_client_id is not null then
    select * into client_rec from public.clients where id = p_client_id;
    if client_rec.id is null then raise exception 'Selected client was not found'; end if;
    resolved_client_id := client_rec.id;
  elsif p_new_client is not null then
    clean_client_name := btrim(coalesce(p_new_client ->> 'name', ''));
    clean_client_email := lower(nullif(btrim(coalesce(p_new_client ->> 'email', '')), ''));
    if clean_client_name = '' or length(clean_client_name) > 200 then
      raise exception 'New client name is required and must be at most 200 characters';
    end if;
    if clean_client_email is not null and exists (
      select 1 from public.clients where lower(coalesce(email, '')) = clean_client_email
    ) then
      raise exception 'A client with this e-mail already exists; select that client instead';
    end if;
    if coalesce(p_new_client ->> 'type', 'smb') not in ('enterprise', 'smb', 'individual', 'potential') then
      raise exception 'Invalid client type';
    end if;

    insert into public.clients (
      name, type, status, contact_person, email, phone, notes, created_by
    ) values (
      clean_client_name,
      coalesce(p_new_client ->> 'type', 'smb'),
      'active',
      nullif(btrim(coalesce(p_new_client ->> 'contact_person', '')), ''),
      clean_client_email,
      nullif(btrim(coalesce(p_new_client ->> 'phone', '')), ''),
      'Created during controlled conversion of submission ' || sub_rec.id::text,
      auth.uid()
    ) returning * into client_rec;
    resolved_client_id := client_rec.id;
  else
    raise exception 'A client must be selected or created';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_owner_id and p.status = 'active' and p.role <> 'client'::public.app_role
  ) then
    raise exception 'Select an active internal project owner';
  end if;
  if p_manager_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_manager_id and p.status = 'active' and p.role <> 'client'::public.app_role
  ) then
    raise exception 'Selected project manager is not an active internal team member';
  end if;

  select count(distinct member_id), count(*)
    into requested_team_count, answer_count
  from unnest(coalesce(p_team_member_ids, '{}'::uuid[])) member_id;
  -- The second count above is only temporary; use it to detect duplicate/null input.
  if requested_team_count <> coalesce(array_length(p_team_member_ids, 1), 0)
     or exists (select 1 from unnest(coalesce(p_team_member_ids, '{}'::uuid[])) x where x is null) then
    raise exception 'Team member selections must be unique and non-empty';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_team_member_ids, '{}'::uuid[])) member_id
    left join public.profiles p on p.id = member_id
    where p.id is null or p.status <> 'active' or p.role = 'client'::public.app_role
  ) then
    raise exception 'Every selected team member must be an active internal user';
  end if;

  insert into public.projects (
    name, description, client_id, type, priority, status, phase, phase_name,
    progress, budget, currency, start_date, due_date, completed_date,
    owner_id, manager_id, source_submission_id, created_by
  ) values (
    clean_project_name,
    nullif(btrim(coalesce(p_description, '')), ''),
    resolved_client_id,
    clean_project_type,
    p_priority,
    p_status,
    p_phase,
    nullif(btrim(coalesce(p_phase_name, '')), ''),
    case when p_status = 'completed' then 100 else 0 end,
    p_budget,
    clean_currency,
    p_start_date,
    p_due_date,
    case when p_status = 'completed' then coalesce(p_due_date, current_date) else null end,
    p_owner_id,
    p_manager_id,
    sub_rec.id,
    auth.uid()
  ) returning * into project_rec;

  insert into public.project_members (project_id, user_id, assigned_by)
  select project_rec.id, member_id, auth.uid()
  from (
    select distinct member_id
    from unnest(
      coalesce(p_team_member_ids, '{}'::uuid[])
      || array[p_owner_id]
      || case when p_manager_id is null then '{}'::uuid[] else array[p_manager_id] end
    ) member_id
    where member_id is not null
  ) members
  on conflict (project_id, user_id) do nothing;

  update public.form_submissions
     set status = 'converted',
         client_id = resolved_client_id,
         project_id = project_rec.id,
         converted_at = now(),
         converted_by = auth.uid(),
         updated_at = now()
   where id = sub_rec.id;

  select count(*) into answer_count
  from public.form_submission_answers where submission_id = sub_rec.id;
  select count(*) into attachment_count
  from public.form_submission_attachments where submission_id = sub_rec.id;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, old_value, new_value, note, metadata
  ) values (
    sub_rec.id,
    auth.uid(),
    'converted_to_project',
    sub_rec.status,
    'converted',
    'Submission deliberately converted to project “' || project_rec.name || '”',
    jsonb_build_object(
      'project_id', project_rec.id,
      'project_name', project_rec.name,
      'client_id', resolved_client_id,
      'owner_id', p_owner_id,
      'manager_id', p_manager_id,
      'team_member_ids', coalesce(p_team_member_ids, '{}'::uuid[]),
      'priority', project_rec.priority,
      'project_type', project_rec.type,
      'answer_count', answer_count,
      'attachment_count', attachment_count,
      'answers_preserved', true,
      'automatic', false
    )
  );

  return project_rec;
end;
$$;

revoke all on function public.convert_submission_to_project(
  uuid, uuid, jsonb, text, text, text, text, text, integer, text,
  date, date, numeric, text, uuid, uuid, uuid[]
) from public, anon;
grant execute on function public.convert_submission_to_project(
  uuid, uuid, jsonb, text, text, text, text, text, integer, text,
  date, date, numeric, text, uuid, uuid, uuid[]
) to authenticated;

commit;
-- ── END MIGRATION: 20260828000000_project_ownership_status_lifecycle.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260829000000_my_work_task_management.sql ─────────────────────────────────────────────
-- Session 13 — Employee My Work & Task Management
--
-- Strengthens the task system around the people who actually execute it:
--
--   1. User-scoped permission helpers so the database can ask "may THIS user
--      touch this project?" — not only "may the current user?".
--   2. A database-enforced assignee guard: a task can only be assigned to an
--      active team member who belongs to the task's project, or to someone the
--      permission model explicitly grants project-wide access to
--      (`project.view_all`). Clients and outsiders can never own tasks, no
--      matter which UI or API client sends the write.
--   3. A tamper-evident `task_activity` feed (audit trail + work notes) that
--      follows the task's current project access: everyone authorized for a
--      task sees the same history; nobody outside the project does.
--   4. Removal hygiene: when a member leaves a project, their OPEN tasks are
--      released back to unassigned (completed history is preserved), so My
--      Work never shows work nobody can reach.
--   5. Task-assignment notifications deep-link into the new /my-work page.
--
-- Reminder scheduling is intentionally NOT part of this session.

begin;

-- ── 1. User-scoped permission helpers ───────────────────────────────────────
-- Mirrors get_user_permissions()/has_permission() for an arbitrary user. The
-- caller's own checks stay on the no-arg helpers; these exist so guards and
-- RPCs can reason about a *target* user (e.g. a prospective task assignee).
create or replace function public.user_has_permission(p_user_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.profiles prof
      join public.app_roles r on r.id = prof.role_id and r.is_active
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
      where prof.id = p_user_id
        and prof.status = 'active'
        and not prof.must_change_password
        and p.key = p_permission
    );
$$;

comment on function public.user_has_permission(uuid, text) is
  'True when the target user is an active team account whose role carries the given permission key.';

-- Project access for an arbitrary user: same semantics as can_access_project
-- (project.view + either project.view_all or active membership).
create or replace function public.can_user_access_project(p_user_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_project_id is not null
    and public.user_has_permission(p_user_id, 'project.view')
    and (
      public.user_has_permission(p_user_id, 'project.view_all')
      or exists (
        select 1
        from public.project_members pm
        join public.profiles prof on prof.id = pm.user_id and prof.status = 'active'
        where pm.project_id = p_project_id and pm.user_id = p_user_id
      )
    );
$$;

comment on function public.can_user_access_project(uuid, uuid) is
  'True when the target user may open the project (member, or a project.view_all role such as Manager/Admin).';

-- ── 2. Task assignee guard ──────────────────────────────────────────────────
-- Authorization at the row level, below every UI:
--   * unassigned tasks are always allowed;
--   * the assignee must be an active, non-client team account;
--   * the assignee must belong to the task's project …
--   * … unless the permission model explicitly grants them project-wide
--     access (project.view_all — Managers/Admins or a custom role).
-- The trigger runs on project_id changes too, so moving a task between
-- projects re-validates the assignee against the destination team.
create or replace function public.enforce_task_assignee_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Reassigning to ANOTHER person is a management action: it requires the
  -- task.assign permission. Anyone who may edit may still pick up a task for
  -- themselves (or hand their own task back to unassigned). Operator contexts
  -- without an authenticated user (SQL editor maintenance) are exempt — RLS
  -- already blocks that path for API clients.
  if tg_op = 'UPDATE'
    and auth.uid() is not null
    and new.assignee_id is distinct from old.assignee_id
    and new.assignee_id is not null
    and new.assignee_id is distinct from auth.uid()
    and not public.has_permission('task.assign')
  then
    raise exception 'Only users with the “Assign tasks” permission can assign tasks to other people.';
  end if;

  if new.assignee_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = new.assignee_id
      and p.status = 'active'
      and p.role <> 'client'::public.app_role
      and not p.must_change_password
  ) then
    raise exception 'Tasks can only be assigned to active team member accounts (never to clients, inactive, or pending-password accounts).';
  end if;

  if exists (
    select 1 from public.project_members pm
    where pm.project_id = new.project_id and pm.user_id = new.assignee_id
  ) then
    return new;
  end if;

  if public.user_has_permission(new.assignee_id, 'project.view_all') then
    return new;
  end if;

  raise exception 'Task assignee must belong to this project. Add them to the project team first, or grant a role with “View all projects”.';
end;
$$;

comment on function public.enforce_task_assignee_guard() is
  'Rejects task assignments to users outside the project team unless the permission model explicitly allows them (project.view_all), and limits assigning OTHER people to holders of task.assign.';

drop trigger if exists enforce_task_assignee_membership on public.tasks;
drop trigger if exists enforce_task_assignee_guard on public.tasks;
create trigger enforce_task_assignee_guard
before insert or update of assignee_id, project_id on public.tasks
for each row execute function public.enforce_task_assignee_guard();

-- ── 3. Task activity feed ───────────────────────────────────────────────────
-- One append-only history row per meaningful event. The actor column is a
-- nullable audit attribution (on delete set null, like every other audit FK),
-- and metadata keeps machine-readable context (ids, names) so the feed stays
-- readable even after accounts are removed.
create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  event_type text not null check (event_type in (
    'note',
    'created',
    'status_changed',
    'priority_changed',
    'assignee_changed',
    'due_date_changed',
    'title_changed',
    'description_changed',
    'project_changed'
  )),
  old_value text,
  new_value text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.task_activity is
  'Append-only task history: automatic change events plus team work notes. Access follows the task''s current project.';
comment on column public.task_activity.project_id is
  'Denormalized project of the task at write time; select access always re-checks the task''s CURRENT project.';

create index if not exists idx_task_activity_task on public.task_activity(task_id, created_at);
create index if not exists idx_task_activity_project on public.task_activity(project_id);

alter table public.task_activity enable row level security;

-- Read: exactly the people who may open the task itself (its current project).
create policy task_activity_select_authorized on public.task_activity for select to authenticated
  using (
    public.is_active()
    and exists (
      select 1 from public.tasks t
      where t.id = task_activity.task_id
        and public.can_access_project(t.project_id)
    )
  );

-- Write: only work notes, directly by users allowed to edit tasks on that
-- project. Every other event is written exclusively by SECURITY DEFINER
-- triggers, so history rows can never be forged through the table API.
create policy task_activity_insert_note on public.task_activity for insert to authenticated
  with check (
    event_type = 'note'
    and actor_id = auth.uid()
    and public.has_permission('task.edit')
    and exists (
      select 1 from public.tasks t
      where t.id = task_activity.task_id
        and t.project_id = task_activity.project_id
        and public.can_access_project(t.project_id)
    )
  );

-- No update/delete policies: the feed is append-only for every role.

-- ── 4. Automatic activity recording ─────────────────────────────────────────
create or replace function public.record_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.created_by);
  v_old_assignee text;
  v_new_assignee text;
  v_old_project text;
  v_new_project text;
begin
  if tg_op = 'INSERT' then
    select coalesce(nullif(trim(full_name), ''), email) into v_new_assignee
    from public.profiles where id = new.assignee_id;

    insert into public.task_activity (task_id, project_id, actor_id, event_type, new_value, metadata)
    values (
      new.id,
      new.project_id,
      v_actor,
      'created',
      new.title,
      jsonb_build_object(
        'status', new.status,
        'priority', new.priority,
        'due_date', new.due_date,
        'assignee_id', new.assignee_id,
        'assignee_name', v_new_assignee
      )
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'status_changed', old.status, new.status);
  end if;

  if new.priority is distinct from old.priority then
    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'priority_changed', old.priority, new.priority);
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    select coalesce(nullif(trim(full_name), ''), email) into v_old_assignee
    from public.profiles where id = old.assignee_id;
    select coalesce(nullif(trim(full_name), ''), email) into v_new_assignee
    from public.profiles where id = new.assignee_id;

    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value, metadata)
    values (
      new.id,
      new.project_id,
      v_actor,
      'assignee_changed',
      v_old_assignee,
      v_new_assignee,
      jsonb_build_object('old_assignee_id', old.assignee_id, 'new_assignee_id', new.assignee_id)
    );
  end if;

  if new.due_date is distinct from old.due_date then
    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'due_date_changed', old.due_date::text, new.due_date::text);
  end if;

  if new.title is distinct from old.title then
    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'title_changed', old.title, new.title);
  end if;

  if new.description is distinct from old.description then
    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value)
    values (new.id, new.project_id, v_actor, 'description_changed', left(coalesce(old.description, ''), 500), left(coalesce(new.description, ''), 500));
  end if;

  if new.project_id is distinct from old.project_id then
    select name into v_old_project from public.projects where id = old.project_id;
    select name into v_new_project from public.projects where id = new.project_id;

    insert into public.task_activity (task_id, project_id, actor_id, event_type, old_value, new_value, metadata)
    values (
      new.id,
      new.project_id,
      v_actor,
      'project_changed',
      v_old_project,
      v_new_project,
      jsonb_build_object('old_project_id', old.project_id, 'new_project_id', new.project_id)
    );
  end if;

  return new;
end;
$$;

comment on function public.record_task_activity() is
  'Writes one task_activity row per changed task field (creation, status, priority, assignee, due date, title, description, project move).';

drop trigger if exists record_task_activity on public.tasks;
create trigger record_task_activity
after insert or update of status, priority, assignee_id, due_date, title, description, project_id on public.tasks
for each row execute function public.record_task_activity();

-- ── 5. Work notes RPC ───────────────────────────────────────────────────────
-- Mirrors add_form_submission_note: one permission-checked entry point that
-- validates the note and attributes it to the caller. Direct table inserts
-- remain possible through the note-only RLS policy above; both paths produce
-- the same shape of row.
create or replace function public.add_task_note(p_task_id uuid, p_note text)
returns public.task_activity
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_row public.task_activity;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found.';
  end if;

  if not public.is_active() or public.must_change_password_pending() then
    raise exception 'Your account cannot add task notes until it is active and the temporary password is replaced.';
  end if;

  if not public.can_access_project(v_task.project_id) then
    raise exception 'You do not have access to this task.';
  end if;

  if not public.has_permission('task.edit') then
    raise exception 'You do not have permission to add task notes.';
  end if;

  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'A task note cannot be empty.';
  end if;

  insert into public.task_activity (task_id, project_id, actor_id, event_type, new_value)
  values (v_task.id, v_task.project_id, auth.uid(), 'note', left(trim(p_note), 2000))
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.add_task_note(uuid, text) is
  'Adds a work note to a task the caller may edit; stored as an immutable task_activity row.';

grant execute on function public.add_task_note(uuid, text) to authenticated;

-- ── 6. Assignee directory RPC ───────────────────────────────────────────────
-- The single source of truth for "who may receive a task in this project":
-- active team accounts that are project members PLUS anyone the permission
-- model grants project-wide access to (project.view_all). Mirrors the
-- enforce_task_assignee_guard trigger exactly, so the UI only offers
-- choices the database will accept. Security definer because employees
-- without team-directory access still need valid choices for their own
-- projects — the result is scoped to one project the caller may open.
create or replace function public.list_task_assignees(p_project_id uuid)
returns table (
  id uuid,
  full_name text,
  email text,
  job_title text,
  role public.app_role,
  is_member boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_active() or not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to this project.';
  end if;

  return query
  select
    prof.id,
    prof.full_name,
    prof.email,
    prof.job_title,
    prof.role,
    (pm.user_id is not null) as is_member
  from public.profiles prof
  left join public.project_members pm
    on pm.project_id = p_project_id and pm.user_id = prof.id
  where prof.status = 'active'
    and prof.role <> 'client'::public.app_role
    and not prof.must_change_password
    and (
      pm.user_id is not null
      or public.user_has_permission(prof.id, 'project.view_all')
    )
  order by (pm.user_id is not null) desc, prof.full_name asc nulls last, prof.email asc;
end;
$$;

comment on function public.list_task_assignees(uuid) is
  'Valid task assignees for one project: active team members plus project.view_all staff, ordered with members first.';

grant execute on function public.list_task_assignees(uuid) to authenticated;

-- ── 7. Member-removal hygiene ───────────────────────────────────────────────
-- Leaving a project must never strand open work on someone who can no longer
-- reach it: open tasks release to unassigned and the activity feed records the
-- change (actor = whoever removed the member). Completed tasks keep their
-- attribution — history is not rewritten.
create or replace function public.unassign_tasks_on_member_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tasks
  set assignee_id = null
  where project_id = old.project_id
    and assignee_id = old.user_id
    and status <> 'done';
  return old;
end;
$$;

comment on function public.unassign_tasks_on_member_removal() is
  'Releases open tasks to unassigned when their assignee leaves the project; completed tasks stay attributed.';

drop trigger if exists unassign_tasks_on_member_removal on public.project_members;
create trigger unassign_tasks_on_member_removal
after delete on public.project_members
for each row execute function public.unassign_tasks_on_member_removal();

-- ── 8. Task notifications deep-link into My Work ────────────────────────────
-- Identical to the previous trigger except the action_url: the assignee lands
-- on their personal My Work page with the task opened, instead of the project
-- task list.
create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_rec public.projects;
  assigner_name text;
begin
  if new.assignee_id is not null
    and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
    and exists (
      select 1 from public.profiles p
      where p.id = new.assignee_id
        and p.status = 'active'
        and p.role <> 'client'::public.app_role
    ) then

    select * into proj_rec from public.projects where id = new.project_id;

    select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'A team member')
    into assigner_name
    from public.profiles
    where id = coalesce(new.created_by, auth.uid());

    if assigner_name is null then
      assigner_name := 'A team member';
    end if;

    insert into public.notifications (
      recipient_id,
      actor_id,
      project_id,
      task_id,
      type,
      title,
      message,
      action_url,
      metadata
    )
    values (
      new.assignee_id,
      coalesce(new.created_by, (select id from public.profiles where id = auth.uid())),
      new.project_id,
      new.id,
      'task_assignment',
      'New task assignment: ' || new.title,
      'You were assigned “' || new.title || '” in project “' || coalesce(proj_rec.name, 'a project') || '” by ' || assigner_name || case when new.due_date is not null then ' (Due: ' || to_char(new.due_date, 'YYYY-MM-DD') || ')' else '' end || '.',
      '/my-work?task=' || new.id::text,
      jsonb_build_object(
        'task_id', new.id,
        'task_title', new.title,
        'project_id', new.project_id,
        'project_name', coalesce(proj_rec.name, 'Project'),
        'assigned_by', assigner_name,
        'due_date', new.due_date,
        'priority', new.priority,
        'status', new.status,
        'assigned_at', now()
      )
    );
  end if;
  return new;
end;
$$;

-- ── 9. Grants & cleanup ─────────────────────────────────────────────────────
grant select, insert on public.task_activity to authenticated;
revoke all on public.task_activity from anon;

grant execute on function public.user_has_permission(uuid, text) to authenticated;
grant execute on function public.can_user_access_project(uuid, uuid) to authenticated;

commit;
-- ── END MIGRATION: 20260829000000_my_work_task_management.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260830000000_project_activity_audit.sql ─────────────────────────────────────────────
-- Session 14 — Project Activity & Audit Timeline
--
-- A unified, append-only history of project-level events so every meaningful
-- change (creation, submission conversion, ownership, status, deadline, team
-- membership, file uploads/deletes) is recorded with who, what, when, and
-- context. Task-level events already live in `task_activity`; the project
-- detail page merges both feeds into one timeline.
--
-- Audit/system events are deliberately kept SEPARATE from client-facing
-- comments: `project_activity` is written exclusively by SECURITY DEFINER
-- triggers and read via RLS, while human/client discussion stays in `comments`.

create table if not exists public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  event_type text not null check (event_type in (
    'created',
    'submission_converted',
    'owner_changed',
    'manager_changed',
    'member_added',
    'member_removed',
    'status_changed',
    'deadline_changed',
    'file_uploaded',
    'file_deleted'
  )),
  old_value text,
  new_value text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.project_activity is
  'Append-only project audit history. Written exclusively by SECURITY DEFINER triggers; never by clients directly. Read access follows the project.';
comment on column public.project_activity.metadata is
  'Machine-readable context (ids, names) so the feed stays readable after accounts and records are removed.';

create index if not exists idx_project_activity_project on public.project_activity(project_id, created_at);

alter table public.project_activity enable row level security;

-- Read: anyone who may open the project. Every event is written by definer
-- triggers, so there is no insert/update/delete policy at all.
create policy project_activity_select_authorized on public.project_activity for select to authenticated
  using (
    public.is_active()
    and public.can_access_project(project_id)
  );

grant select on public.project_activity to authenticated;
revoke all on public.project_activity from anon;

-- ── 1. Project-level events ─────────────────────────────────────────────────
create or replace function public.record_project_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.created_by, new.owner_id);
  v_old_owner text;
  v_new_owner text;
  v_old_manager text;
  v_new_manager text;
begin
  -- Only attribute the event to a real profile. Some creation paths (e.g. a
  -- submission auto-converting to a project under an anonymous caller) pass an
  -- id that is not a persisted profile; such events are recorded as System.
  if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
    v_actor := null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
    values (
      new.id,
      v_actor,
      'created',
      new.name,
      jsonb_build_object(
        'client_id', new.client_id,
        'project_type', new.type,
        'owner_id', new.owner_id,
        'manager_id', new.manager_id,
        'status', new.status
      )
    );

    if new.source_submission_id is not null then
      insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
      values (
        new.id,
        v_actor,
        'submission_converted',
        new.name,
        jsonb_build_object('source_submission_id', new.source_submission_id)
      );
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value)
    values (new.id, v_actor, 'status_changed', old.status, new.status);
  end if;

  if new.due_date is distinct from old.due_date then
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value)
    values (new.id, v_actor, 'deadline_changed', old.due_date::text, new.due_date::text);
  end if;

  if new.owner_id is distinct from old.owner_id then
    select coalesce(nullif(trim(full_name), ''), email) into v_old_owner from public.profiles where id = old.owner_id;
    select coalesce(nullif(trim(full_name), ''), email) into v_new_owner from public.profiles where id = new.owner_id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (
      new.id,
      v_actor,
      'owner_changed',
      v_old_owner,
      v_new_owner,
      jsonb_build_object('old_owner_id', old.owner_id, 'new_owner_id', new.owner_id)
    );
  end if;

  if new.manager_id is distinct from old.manager_id then
    select coalesce(nullif(trim(full_name), ''), email) into v_old_manager from public.profiles where id = old.manager_id;
    select coalesce(nullif(trim(full_name), ''), email) into v_new_manager from public.profiles where id = new.manager_id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (
      new.id,
      v_actor,
      'manager_changed',
      v_old_manager,
      v_new_manager,
      jsonb_build_object('old_manager_id', old.manager_id, 'new_manager_id', new.manager_id)
    );
  end if;

  return new;
end;
$$;

comment on function public.record_project_activity() is
  'Writes project_activity rows for creation, submission conversion, status, deadline, owner, and manager changes.';

drop trigger if exists record_project_activity on public.projects;
create trigger record_project_activity
after insert or update of status, due_date, owner_id, manager_id on public.projects
for each row execute function public.record_project_activity();

-- ── 2. Team membership events ───────────────────────────────────────────────
create or replace function public.record_project_member_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_actor uuid := auth.uid();
begin
  if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
    v_actor := null;
  end if;

  select coalesce(nullif(trim(full_name), ''), email) into v_name
  from public.profiles where id = coalesce(new.user_id, old.user_id);

  if tg_op = 'INSERT' then
    insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
    values (
      new.project_id,
      v_actor,
      'member_added',
      v_name,
      jsonb_build_object('user_id', new.user_id, 'assigned_by', new.assigned_by)
    );
  elsif tg_op = 'DELETE' then
    insert into public.project_activity (project_id, actor_id, event_type, old_value, metadata)
    values (
      old.project_id,
      v_actor,
      'member_removed',
      v_name,
      jsonb_build_object('user_id', old.user_id)
    );
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.record_project_member_activity() is
  'Records when a team member is added to or removed from a project.';

drop trigger if exists record_project_member_activity on public.project_members;
create trigger record_project_member_activity
after insert or delete on public.project_members
for each row execute function public.record_project_member_activity();

-- ── 3. File upload/delete events ────────────────────────────────────────────
create or replace function public.record_project_file_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  if tg_op = 'INSERT' and new.project_id is not null then
    v_actor := new.uploaded_by;
    if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
      v_actor := null;
    end if;
    insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
    values (
      new.project_id,
      v_actor,
      'file_uploaded',
      new.name,
      jsonb_build_object('file_id', new.id, 'file_type', new.type, 'size', new.size)
    );
  elsif tg_op = 'DELETE' and old.project_id is not null then
    v_actor := auth.uid();
    if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
      v_actor := null;
    end if;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, metadata)
    values (
      old.project_id,
      v_actor,
      'file_deleted',
      old.name,
      jsonb_build_object('file_id', old.id, 'file_type', old.type)
    );
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.record_project_file_activity() is
  'Records project file uploads and deletions so the timeline shows important file activity.';

drop trigger if exists record_project_file_activity on public.files;
create trigger record_project_file_activity
after insert or delete on public.files
for each row execute function public.record_project_file_activity();

commit;
-- ── END MIGRATION: 20260830000000_project_activity_audit.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260831000000_project_delivery_closure.sql ─────────────────────────────────────────────
-- Session 15 — Project Delivery & Closure Workflow
--
-- Completes the operational lifecycle after Active / In Review:
--   Ready for Delivery → Delivered → Completed → Archive
--
-- What this adds (all INTERNAL staff data):
--   * A versioned delivery package (`project_deliveries`) with final delivery files
--   * A delivery state machine (preparing / ready / delivered / revision / approved)
--   * An INTERNAL client-approval placeholder — staff-recorded only
--   * Database-enforced completion guards (no accidental Complete)
--   * Archive / unarchive after Completed or Cancelled
--
-- Client-facing approval is deliberately NOT implemented here. Future portal
-- approval must live in a separate table (e.g. `client_approvals`) and must
-- never write to `project_deliveries`. Clients have no SELECT/INSERT/UPDATE
-- on these tables.

begin;

-- ── 1. Project archive flag (not a lifecycle status) ────────────────────────
alter table public.projects
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

comment on column public.projects.archived_at is
  'When set, the project is archived (hidden from the default workspace). Archive is independent of status and is only allowed after Completed or Cancelled.';
comment on column public.projects.archived_by is
  'Staff member who archived the project.';

create index if not exists idx_projects_archived
  on public.projects(archived_at)
  where archived_at is not null;

-- ── 2. Internal delivery package ────────────────────────────────────────────
create table if not exists public.project_deliveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version >= 1),
  status text not null default 'preparing' check (status in (
    'preparing',
    'ready',
    'delivered',
    'revision_requested',
    'approved',
    'superseded'
  )),
  notes text,
  delivered_at timestamptz,
  delivered_by uuid references public.profiles(id) on delete set null,
  -- INTERNAL placeholder. This is a staff record of what the client said —
  -- not a client-submitted action. Do not reuse this table for a future
  -- client portal; add a separate client-owned table instead.
  approval_state text not null default 'not_requested' check (approval_state in (
    'not_requested',
    'awaiting_client',
    'approved_internally',
    'revision_required'
  )),
  approval_recorded_by uuid references public.profiles(id) on delete set null,
  approval_recorded_at timestamptz,
  approval_note text,
  revision_note text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, version)
);

comment on table public.project_deliveries is
  'INTERNAL staff delivery packages. Versioned so a revision creates a new package. Never writable by client accounts. Future client-facing approval must not live here.';
comment on column public.project_deliveries.approval_state is
  'Staff-recorded placeholder for client approval. Not a client portal action.';
comment on column public.project_deliveries.status is
  'Package state: preparing → ready → delivered → (approved | revision_requested). superseded is reserved for abandoned drafts.';

create index if not exists idx_project_deliveries_project
  on public.project_deliveries(project_id, version desc);
create index if not exists idx_project_deliveries_status
  on public.project_deliveries(project_id, status);

drop trigger if exists set_project_deliveries_updated_at on public.project_deliveries;
create trigger set_project_deliveries_updated_at
  before update on public.project_deliveries
  for each row execute function public.set_updated_at();

-- ── 3. Final delivery files (working files stay on `files`) ─────────────────
create table if not exists public.project_delivery_files (
  delivery_id uuid not null references public.project_deliveries(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null default auth.uid(),
  added_at timestamptz not null default now(),
  primary key (delivery_id, file_id)
);

comment on table public.project_delivery_files is
  'The final delivery set for one internal delivery package. Distinct from working project files.';

create index if not exists idx_project_delivery_files_file
  on public.project_delivery_files(file_id);

-- ── 4. RLS — staff read only; writes go through SECURITY DEFINER RPCs ───────
alter table public.project_deliveries enable row level security;
alter table public.project_delivery_files enable row level security;

drop policy if exists project_deliveries_select_staff on public.project_deliveries;
create policy project_deliveries_select_staff on public.project_deliveries
  for select to authenticated
  using (
    public.is_active()
    and public.is_staff()
    and public.can_access_project(project_id)
  );

drop policy if exists project_delivery_files_select_staff on public.project_delivery_files;
create policy project_delivery_files_select_staff on public.project_delivery_files
  for select to authenticated
  using (
    public.is_active()
    and public.is_staff()
    and exists (
      select 1 from public.project_deliveries d
      where d.id = project_delivery_files.delivery_id
        and public.can_access_project(d.project_id)
    )
  );

grant select on public.project_deliveries to authenticated;
grant select on public.project_delivery_files to authenticated;
revoke all on public.project_deliveries from anon;
revoke all on public.project_delivery_files from anon;

-- ── 5. Activity event types for delivery / archive ──────────────────────────
alter table public.project_activity drop constraint if exists project_activity_event_type_check;
alter table public.project_activity add constraint project_activity_event_type_check check (
  event_type in (
    'created',
    'submission_converted',
    'owner_changed',
    'manager_changed',
    'member_added',
    'member_removed',
    'status_changed',
    'deadline_changed',
    'file_uploaded',
    'file_deleted',
    'delivery_prepared',
    'delivery_ready',
    'delivery_sent',
    'delivery_file_added',
    'delivery_file_removed',
    'revision_requested',
    'approval_recorded',
    'archived',
    'unarchived'
  )
);

-- Record archive / unarchive alongside the existing project-level events.
create or replace function public.record_project_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.created_by, new.owner_id);
  v_old_owner text;
  v_new_owner text;
  v_old_manager text;
  v_new_manager text;
begin
  if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
    v_actor := null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
    values (
      new.id,
      v_actor,
      'created',
      new.name,
      jsonb_build_object(
        'client_id', new.client_id,
        'project_type', new.type,
        'owner_id', new.owner_id,
        'manager_id', new.manager_id,
        'status', new.status
      )
    );

    if new.source_submission_id is not null then
      insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
      values (
        new.id,
        v_actor,
        'submission_converted',
        new.name,
        jsonb_build_object('source_submission_id', new.source_submission_id)
      );
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value)
    values (new.id, v_actor, 'status_changed', old.status, new.status);
  end if;

  if new.due_date is distinct from old.due_date then
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value)
    values (new.id, v_actor, 'deadline_changed', old.due_date::text, new.due_date::text);
  end if;

  if new.owner_id is distinct from old.owner_id then
    select coalesce(nullif(trim(full_name), ''), email) into v_old_owner from public.profiles where id = old.owner_id;
    select coalesce(nullif(trim(full_name), ''), email) into v_new_owner from public.profiles where id = new.owner_id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (
      new.id, v_actor, 'owner_changed', v_old_owner, v_new_owner,
      jsonb_build_object('old_owner_id', old.owner_id, 'new_owner_id', new.owner_id)
    );
  end if;

  if new.manager_id is distinct from old.manager_id then
    select coalesce(nullif(trim(full_name), ''), email) into v_old_manager from public.profiles where id = old.manager_id;
    select coalesce(nullif(trim(full_name), ''), email) into v_new_manager from public.profiles where id = new.manager_id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (
      new.id, v_actor, 'manager_changed', v_old_manager, v_new_manager,
      jsonb_build_object('old_manager_id', old.manager_id, 'new_manager_id', new.manager_id)
    );
  end if;

  if new.archived_at is distinct from old.archived_at then
    if new.archived_at is not null and old.archived_at is null then
      insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
      values (new.id, v_actor, 'archived', new.status, jsonb_build_object('archived_by', new.archived_by));
    elsif new.archived_at is null and old.archived_at is not null then
      insert into public.project_activity (project_id, actor_id, event_type, old_value, metadata)
      values (new.id, v_actor, 'unarchived', old.status, jsonb_build_object('previously_archived_by', old.archived_by));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists record_project_activity on public.projects;
create trigger record_project_activity
after insert or update of status, due_date, owner_id, manager_id, archived_at on public.projects
for each row execute function public.record_project_activity();

-- ── 6. Delivery helpers ─────────────────────────────────────────────────────
create or replace function public.current_project_delivery(p_project_id uuid)
returns public.project_deliveries
language sql
stable
security definer
set search_path = public
as $$
  select d.*
  from public.project_deliveries d
  where d.project_id = p_project_id
    and d.status <> 'superseded'
  order by d.version desc
  limit 1;
$$;

comment on function public.current_project_delivery(uuid) is
  'Latest non-superseded internal delivery package for a project.';

create or replace function public.project_delivery_file_count(p_project_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.project_delivery_files f
  join public.project_deliveries d on d.id = f.delivery_id
  where d.project_id = p_project_id
    and d.status <> 'superseded'
    and d.id = (select id from public.current_project_delivery(p_project_id));
$$;

create or replace function public.project_completion_blockers(p_project_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  file_count integer;
  blockers text[] := '{}';
begin
  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then
    return array['Project not found'];
  end if;
  if proj.archived_at is not null then
    blockers := blockers || 'The project is archived';
  end if;
  if proj.status is distinct from 'delivered' and proj.status is distinct from 'completed' then
    blockers := blockers || 'The project must be in Delivered before it can be completed';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null then
    blockers := blockers || 'Prepare a delivery package and attach at least one final delivery file';
    return blockers;
  end if;

  select count(*)::integer into file_count
  from public.project_delivery_files where delivery_id = pkg.id;

  if file_count < 1 then
    blockers := blockers || 'Attach at least one final delivery file';
  end if;
  if pkg.status not in ('delivered', 'approved') then
    blockers := blockers || 'Mark the delivery package as delivered';
  end if;
  if pkg.approval_state is distinct from 'approved_internally' then
    blockers := blockers || 'Record the internal client-approval placeholder';
  end if;
  return blockers;
end;
$$;

comment on function public.project_completion_blockers(uuid) is
  'Human-readable reasons a project cannot be completed. Empty array means the delivery conditions are met.';

create or replace function public.project_can_complete(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(cardinality(public.project_completion_blockers(p_project_id)), 0) = 0;
$$;

create or replace function public.project_delivery_readiness(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  file_count integer := 0;
  blockers text[];
begin
  if auth.uid() is null or not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to this project.';
  end if;

  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then raise exception 'Project not found'; end if;
  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is not null then
    select count(*)::integer into file_count
    from public.project_delivery_files where delivery_id = pkg.id;
  end if;
  blockers := public.project_completion_blockers(p_project_id);

  return jsonb_build_object(
    'project_status', proj.status,
    'archived', proj.archived_at is not null,
    'has_package', pkg.id is not null,
    'delivery_id', pkg.id,
    'delivery_version', pkg.version,
    'delivery_status', pkg.status,
    'approval_state', pkg.approval_state,
    'file_count', file_count,
    'can_complete', coalesce(cardinality(blockers), 0) = 0 and proj.status = 'delivered',
    'can_archive', proj.archived_at is null and proj.status in ('completed', 'cancelled'),
    'can_unarchive', proj.archived_at is not null,
    'blockers', to_jsonb(coalesce(blockers, '{}'))
  );
end;
$$;

-- ── 7. Package / file integrity ─────────────────────────────────────────────
create or replace function public.enforce_delivery_file_same_project()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  pkg public.project_deliveries;
  file_project uuid;
begin
  select * into pkg from public.project_deliveries where id = new.delivery_id;
  if pkg.id is null then
    raise exception 'Delivery package not found.';
  end if;
  if pkg.status <> 'preparing' then
    raise exception 'Final delivery files can only be added while the package is being prepared. Request a revision to open a new package.';
  end if;
  select project_id into file_project from public.files where id = new.file_id;
  if file_project is null or file_project is distinct from pkg.project_id then
    raise exception 'A delivery file must belong to the same project as the delivery package.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_delivery_file_same_project on public.project_delivery_files;
create trigger enforce_delivery_file_same_project
before insert on public.project_delivery_files
for each row execute function public.enforce_delivery_file_same_project();

create or replace function public.enforce_delivery_file_unlocked()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  pkg_status text;
begin
  select status into pkg_status from public.project_deliveries where id = old.delivery_id;
  if pkg_status is not null and pkg_status <> 'preparing' then
    raise exception 'Final delivery files are locked on this package. Request a revision before changing the set.';
  end if;
  return old;
end;
$$;

drop trigger if exists enforce_delivery_file_unlocked on public.project_delivery_files;
create trigger enforce_delivery_file_unlocked
before delete on public.project_delivery_files
for each row execute function public.enforce_delivery_file_unlocked();

create or replace function public.guard_locked_delivery_file_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.project_delivery_files df
    join public.project_deliveries d on d.id = df.delivery_id
    where df.file_id = old.id
      and d.status in ('ready', 'delivered', 'approved')
  ) then
    raise exception 'This file is locked as a final delivery file. Request a revision before deleting it.';
  end if;
  return old;
end;
$$;

drop trigger if exists guard_locked_delivery_file_delete on public.files;
create trigger guard_locked_delivery_file_delete
before delete on public.files
for each row execute function public.guard_locked_delivery_file_delete();

-- ── 8. Status transition + completion / archive guards ──────────────────────
create or replace function public.enforce_project_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  blockers text[];
  file_count integer;
begin
  if tg_op = 'INSERT' then
    if new.status in ('ready-for-delivery', 'delivered', 'completed') then
      raise exception 'New projects cannot start at %. Attach final delivery files and move through the delivery workflow.', new.status;
    end if;
    if new.archived_at is not null then
      raise exception 'New projects cannot be created already archived.';
    end if;
    return new;
  end if;

  if old.archived_at is not null and new.status is distinct from old.status then
    raise exception 'Archived projects cannot change status. Unarchive the project first.';
  end if;

  if new.status is distinct from old.status then
    if not public.valid_project_status_transition(old.status, new.status) then
      raise exception 'Invalid status transition from % to %.', old.status, new.status;
    end if;

    if new.status in ('ready-for-delivery', 'delivered') then
      select public.project_delivery_file_count(new.id) into file_count;
      if coalesce(file_count, 0) < 1 then
        raise exception 'Cannot move to % without at least one final delivery file.', new.status;
      end if;
    end if;

    if new.status = 'completed' then
      blockers := public.project_completion_blockers(new.id);
      -- The helper treats "must be delivered" as a blocker when status is not
      -- yet completed; while we are transitioning FROM delivered the other
      -- blockers are what matter.
      blockers := array(
        select b from unnest(coalesce(blockers, '{}')) b
        where b <> 'The project must be in Delivered before it can be completed'
      );
      if old.status is distinct from 'delivered' then
        blockers := blockers || 'The project must be in Delivered before it can be completed';
      end if;
      if coalesce(cardinality(blockers), 0) > 0 then
        raise exception 'Cannot complete this project: %', array_to_string(blockers, '; ');
      end if;
      new.completed_date := coalesce(new.completed_date, current_date);
      new.progress := 100;
    end if;
  end if;

  if new.archived_at is not null and old.archived_at is null then
    if new.status not in ('completed', 'cancelled') then
      raise exception 'Only Completed or Cancelled projects can be archived.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_project_status_transition on public.projects;
create trigger enforce_project_status_transition
before insert or update of status, archived_at, completed_date, progress on public.projects
for each row execute function public.enforce_project_status_transition();

-- Keep the delivery package in sync when staff move status from the project UI.
create or replace function public.sync_delivery_on_project_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pkg public.project_deliveries;
  next_version integer;
  actor uuid := auth.uid();
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select * into pkg from public.current_project_delivery(new.id);

  if new.status = 'ready-for-delivery' and pkg.id is not null and pkg.status = 'preparing' then
    update public.project_deliveries set status = 'ready' where id = pkg.id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (new.id, actor, 'delivery_ready', 'preparing', 'ready', jsonb_build_object('delivery_id', pkg.id, 'version', pkg.version));
  end if;

  if new.status = 'delivered' and pkg.id is not null and pkg.status in ('preparing', 'ready') then
    update public.project_deliveries
       set status = 'delivered',
           delivered_at = coalesce(delivered_at, now()),
           delivered_by = coalesce(delivered_by, actor)
     where id = pkg.id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (new.id, actor, 'delivery_sent', pkg.status, 'delivered', jsonb_build_object('delivery_id', pkg.id, 'version', pkg.version));
  end if;

  if old.status in ('ready-for-delivery', 'delivered') and new.status = 'in-review' then
    if pkg.id is not null and pkg.status not in ('revision_requested', 'preparing') then
      update public.project_deliveries
         set status = 'revision_requested',
             approval_state = 'revision_required',
             revision_note = coalesce(nullif(trim(revision_note), ''), 'Returned to review for revision')
       where id = pkg.id;
      insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
      values (new.id, actor, 'revision_requested', pkg.status, 'revision_requested', jsonb_build_object('delivery_id', pkg.id, 'version', pkg.version));
    end if;
    if not exists (
      select 1 from public.project_deliveries
      where project_id = new.id and status = 'preparing'
    ) then
      select coalesce(max(version), 0) + 1 into next_version
      from public.project_deliveries where project_id = new.id;
      insert into public.project_deliveries (project_id, version, status, created_by)
      values (new.id, next_version, 'preparing', actor);
      insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
      values (new.id, actor, 'delivery_prepared', 'v' || next_version::text, jsonb_build_object('version', next_version));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_delivery_on_project_status on public.projects;
create trigger sync_delivery_on_project_status
after update of status on public.projects
for each row execute function public.sync_delivery_on_project_status();

-- ── 9. Conversion cannot skip the delivery workflow ─────────────────────────
create or replace function public.convert_submission_to_project(
  p_submission_id uuid,
  p_client_id uuid,
  p_new_client jsonb,
  p_project_name text,
  p_description text,
  p_project_type text,
  p_priority text,
  p_status text,
  p_phase integer,
  p_phase_name text,
  p_start_date date,
  p_due_date date,
  p_budget numeric,
  p_currency text,
  p_owner_id uuid,
  p_manager_id uuid,
  p_team_member_ids uuid[]
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  sub_rec public.form_submissions;
  project_rec public.projects;
  client_rec public.clients;
  caller_profile public.profiles;
  resolved_client_id uuid;
  clean_project_name text := btrim(coalesce(p_project_name, ''));
  clean_project_type text := btrim(coalesce(p_project_type, ''));
  clean_currency text := upper(btrim(coalesce(p_currency, 'USD')));
  clean_client_name text;
  clean_client_email text;
  answer_count integer;
  attachment_count integer;
  requested_team_count integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.has_permission('admin.manage') then
    raise exception 'Only an Admin can convert a submission to a project';
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.id is null or caller_profile.status <> 'active'
     or public.must_change_password_pending() then
    raise exception 'Admin account is not active';
  end if;

  select * into sub_rec
  from public.form_submissions
  where id = p_submission_id
  for update;

  if sub_rec.id is null then raise exception 'Submission not found'; end if;
  if sub_rec.status not in ('qualified', 'approved') then
    raise exception 'Submission must be Qualified or Approved before conversion';
  end if;
  if sub_rec.project_id is not null or sub_rec.converted_at is not null
     or exists (select 1 from public.projects p where p.source_submission_id = sub_rec.id) then
    raise exception 'This submission has already been converted';
  end if;

  if clean_project_name = '' or length(clean_project_name) > 200 then
    raise exception 'Project name is required and must be at most 200 characters';
  end if;
  if clean_project_type = '' or length(clean_project_type) > 100 then
    raise exception 'Project type is required and must be at most 100 characters';
  end if;
  if p_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'Invalid project priority';
  end if;
  -- Delivery-stage statuses require final files + approval and cannot be the
  -- starting state of a newly converted project.
  if p_status not in (
    'draft', 'planned', 'active', 'waiting-for-client', 'in-review', 'on-hold', 'cancelled'
  ) then
    raise exception 'Invalid initial project status. Converted projects start before Ready for delivery.';
  end if;
  if p_phase is null or p_phase not between 1 and 10 then
    raise exception 'Project phase must be between 1 and 10';
  end if;
  if p_start_date is not null and p_due_date is not null and p_due_date < p_start_date then
    raise exception 'Project deadline cannot be before its start date';
  end if;
  if p_budget is not null and p_budget < 0 then raise exception 'Budget cannot be negative'; end if;
  if clean_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a 3-letter code'; end if;

  if p_client_id is not null and p_new_client is not null then
    raise exception 'Select an existing client or create a new client, not both';
  elsif p_client_id is not null then
    select * into client_rec from public.clients where id = p_client_id;
    if client_rec.id is null then raise exception 'Selected client was not found'; end if;
    resolved_client_id := client_rec.id;
  elsif p_new_client is not null then
    clean_client_name := btrim(coalesce(p_new_client ->> 'name', ''));
    clean_client_email := lower(nullif(btrim(coalesce(p_new_client ->> 'email', '')), ''));
    if clean_client_name = '' or length(clean_client_name) > 200 then
      raise exception 'New client name is required and must be at most 200 characters';
    end if;
    if clean_client_email is not null and exists (
      select 1 from public.clients where lower(coalesce(email, '')) = clean_client_email
    ) then
      raise exception 'A client with this e-mail already exists; select that client instead';
    end if;
    if coalesce(p_new_client ->> 'type', 'smb') not in ('enterprise', 'smb', 'individual', 'potential') then
      raise exception 'Invalid client type';
    end if;

    insert into public.clients (
      name, type, status, contact_person, email, phone, notes, created_by
    ) values (
      clean_client_name,
      coalesce(p_new_client ->> 'type', 'smb'),
      'active',
      nullif(btrim(coalesce(p_new_client ->> 'contact_person', '')), ''),
      clean_client_email,
      nullif(btrim(coalesce(p_new_client ->> 'phone', '')), ''),
      'Created during controlled conversion of submission ' || sub_rec.id::text,
      auth.uid()
    ) returning * into client_rec;
    resolved_client_id := client_rec.id;
  else
    raise exception 'A client must be selected or created';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_owner_id and p.status = 'active' and p.role <> 'client'::public.app_role
  ) then
    raise exception 'Select an active internal project owner';
  end if;
  if p_manager_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_manager_id and p.status = 'active' and p.role <> 'client'::public.app_role
  ) then
    raise exception 'Selected project manager is not an active internal team member';
  end if;

  select count(distinct member_id), count(*)
    into requested_team_count, answer_count
  from unnest(coalesce(p_team_member_ids, '{}'::uuid[])) member_id;
  if requested_team_count <> coalesce(array_length(p_team_member_ids, 1), 0)
     or exists (select 1 from unnest(coalesce(p_team_member_ids, '{}'::uuid[])) x where x is null) then
    raise exception 'Team member selections must be unique and non-empty';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_team_member_ids, '{}'::uuid[])) member_id
    left join public.profiles p on p.id = member_id
    where p.id is null or p.status <> 'active' or p.role = 'client'::public.app_role
  ) then
    raise exception 'Every selected team member must be an active internal user';
  end if;

  insert into public.projects (
    name, description, client_id, type, priority, status, phase, phase_name,
    progress, budget, currency, start_date, due_date, completed_date,
    owner_id, manager_id, source_submission_id, created_by
  ) values (
    clean_project_name,
    nullif(btrim(coalesce(p_description, '')), ''),
    resolved_client_id,
    clean_project_type,
    p_priority,
    p_status,
    p_phase,
    nullif(btrim(coalesce(p_phase_name, '')), ''),
    0,
    p_budget,
    clean_currency,
    p_start_date,
    p_due_date,
    null,
    p_owner_id,
    p_manager_id,
    sub_rec.id,
    auth.uid()
  ) returning * into project_rec;

  insert into public.project_members (project_id, user_id, assigned_by)
  select project_rec.id, member_id, auth.uid()
  from (
    select distinct member_id
    from unnest(
      coalesce(p_team_member_ids, '{}'::uuid[])
      || array[p_owner_id]
      || case when p_manager_id is null then '{}'::uuid[] else array[p_manager_id] end
    ) member_id
    where member_id is not null
  ) members
  on conflict (project_id, user_id) do nothing;

  update public.form_submissions
     set status = 'converted',
         client_id = resolved_client_id,
         project_id = project_rec.id,
         converted_at = now(),
         converted_by = auth.uid(),
         updated_at = now()
   where id = sub_rec.id;

  select count(*) into answer_count
  from public.form_submission_answers where submission_id = sub_rec.id;
  select count(*) into attachment_count
  from public.form_submission_attachments where submission_id = sub_rec.id;

  insert into public.form_submission_events (
    submission_id, actor_id, event_type, old_value, new_value, note, metadata
  ) values (
    sub_rec.id,
    auth.uid(),
    'converted_to_project',
    sub_rec.status,
    'converted',
    'Submission deliberately converted to project “' || project_rec.name || '”',
    jsonb_build_object(
      'project_id', project_rec.id,
      'project_name', project_rec.name,
      'client_id', resolved_client_id,
      'owner_id', p_owner_id,
      'manager_id', p_manager_id,
      'team_member_ids', coalesce(p_team_member_ids, '{}'::uuid[]),
      'priority', project_rec.priority,
      'project_type', project_rec.type,
      'answer_count', answer_count,
      'attachment_count', attachment_count,
      'answers_preserved', true,
      'automatic', false
    )
  );

  return project_rec;
end;
$$;

-- ── 10. Delivery workflow RPCs ──────────────────────────────────────────────
create or replace function public.assert_staff_can_access_project(p_project_id uuid)
returns public.projects
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  proj public.projects;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_active() or public.must_change_password_pending() then
    raise exception 'Your account cannot manage project delivery until it is active and the temporary password is replaced.';
  end if;
  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then raise exception 'Project not found'; end if;
  if not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to this project.';
  end if;
  if proj.archived_at is not null then
    raise exception 'This project is archived. Unarchive it before changing delivery.';
  end if;
  return proj;
end;
$$;

create or replace function public.prepare_project_delivery(p_project_id uuid, p_notes text default null)
returns public.project_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  next_version integer;
  clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not (public.has_permission('project.edit') or public.has_permission('file.upload')) then
    raise exception 'You do not have permission to prepare a delivery package.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is not null and pkg.status = 'preparing' then
    if clean_notes is not null then
      update public.project_deliveries set notes = clean_notes where id = pkg.id returning * into pkg;
    end if;
    return pkg;
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.project_deliveries where project_id = p_project_id;

  insert into public.project_deliveries (project_id, version, status, notes, created_by)
  values (p_project_id, next_version, 'preparing', clean_notes, auth.uid())
  returning * into pkg;

  insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
  values (p_project_id, auth.uid(), 'delivery_prepared', 'v' || next_version::text,
          jsonb_build_object('delivery_id', pkg.id, 'version', next_version));
  return pkg;
end;
$$;

create or replace function public.add_project_delivery_file(p_project_id uuid, p_file_id uuid)
returns public.project_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  file_rec public.files;
  file_name text;
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not (public.has_permission('project.edit') or public.has_permission('file.upload')) then
    raise exception 'You do not have permission to attach final delivery files.';
  end if;

  select * into file_rec from public.files where id = p_file_id;
  if file_rec.id is null or file_rec.project_id is distinct from p_project_id then
    raise exception 'Choose a file that belongs to this project.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null or pkg.status <> 'preparing' then
    pkg := public.prepare_project_delivery(p_project_id, null);
  end if;

  insert into public.project_delivery_files (delivery_id, file_id, added_by)
  values (pkg.id, p_file_id, auth.uid())
  on conflict (delivery_id, file_id) do nothing;

  select name into file_name from public.files where id = p_file_id;
  insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
  values (p_project_id, auth.uid(), 'delivery_file_added', file_name,
          jsonb_build_object('delivery_id', pkg.id, 'file_id', p_file_id));

  select * into pkg from public.project_deliveries where id = pkg.id;
  return pkg;
end;
$$;

create or replace function public.remove_project_delivery_file(p_project_id uuid, p_file_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  pkg public.project_deliveries;
  file_name text;
begin
  perform public.assert_staff_can_access_project(p_project_id);
  if not (public.has_permission('project.edit') or public.has_permission('file.upload')) then
    raise exception 'You do not have permission to change the delivery set.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null then raise exception 'There is no delivery package on this project.'; end if;
  if pkg.status <> 'preparing' then
    raise exception 'Final delivery files are locked. Request a revision to change the set.';
  end if;

  select name into file_name from public.files where id = p_file_id;
  delete from public.project_delivery_files
  where delivery_id = pkg.id and file_id = p_file_id;
  if not found then
    raise exception 'That file is not part of the current delivery package.';
  end if;

  insert into public.project_activity (project_id, actor_id, event_type, old_value, metadata)
  values (p_project_id, auth.uid(), 'delivery_file_removed', file_name,
          jsonb_build_object('delivery_id', pkg.id, 'file_id', p_file_id));
  return true;
end;
$$;

create or replace function public.mark_delivery_ready(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  file_count integer;
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to mark a delivery ready.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null then raise exception 'Prepare a delivery package first.'; end if;
  select count(*)::integer into file_count from public.project_delivery_files where delivery_id = pkg.id;
  if file_count < 1 then
    raise exception 'Attach at least one final delivery file before marking the package ready.';
  end if;

  if pkg.status = 'preparing' then
    update public.project_deliveries set status = 'ready' where id = pkg.id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (p_project_id, auth.uid(), 'delivery_ready', 'preparing', 'ready',
            jsonb_build_object('delivery_id', pkg.id, 'version', pkg.version));
  end if;

  if proj.status <> 'ready-for-delivery' then
    update public.projects set status = 'ready-for-delivery' where id = p_project_id
    returning * into proj;
  end if;
  return proj;
end;
$$;

create or replace function public.mark_project_delivered(p_project_id uuid, p_note text default null)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  file_count integer;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to mark a project delivered.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null then raise exception 'Prepare a delivery package first.'; end if;
  select count(*)::integer into file_count from public.project_delivery_files where delivery_id = pkg.id;
  if file_count < 1 then
    raise exception 'Cannot mark delivered without at least one final delivery file.';
  end if;

  update public.project_deliveries
     set status = 'delivered',
         notes = coalesce(clean_note, notes),
         delivered_at = coalesce(delivered_at, now()),
         delivered_by = coalesce(delivered_by, auth.uid())
   where id = pkg.id;

  insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
  values (p_project_id, auth.uid(), 'delivery_sent', pkg.status, 'delivered',
          jsonb_build_object('delivery_id', pkg.id, 'version', pkg.version));

  if proj.status in ('active', 'waiting-for-client') then
    update public.projects set status = 'in-review' where id = p_project_id;
  end if;
  select * into proj from public.projects where id = p_project_id;
  if proj.status = 'in-review' then
    update public.projects set status = 'ready-for-delivery' where id = p_project_id;
  end if;
  select * into proj from public.projects where id = p_project_id;
  if proj.status = 'ready-for-delivery' then
    update public.projects set status = 'delivered' where id = p_project_id
    returning * into proj;
  elsif proj.status <> 'delivered' then
    raise exception 'Cannot mark delivered from the current project status (%).', proj.status;
  end if;
  return proj;
end;
$$;

create or replace function public.request_project_revision(p_project_id uuid, p_note text)
returns public.project_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  next_pkg public.project_deliveries;
  next_version integer;
  clean_note text := btrim(coalesce(p_note, ''));
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to request a revision.';
  end if;
  if length(clean_note) = 0 then
    raise exception 'A revision note is required.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is not null and pkg.status not in ('revision_requested', 'preparing') then
    update public.project_deliveries
       set status = 'revision_requested',
           approval_state = 'revision_required',
           revision_note = clean_note
     where id = pkg.id;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
    values (p_project_id, auth.uid(), 'revision_requested', pkg.status, 'revision_requested',
            jsonb_build_object('delivery_id', pkg.id, 'version', pkg.version, 'note', left(clean_note, 280)));
  end if;

  select * into next_pkg from public.project_deliveries
  where project_id = p_project_id and status = 'preparing'
  order by version desc limit 1;

  if next_pkg.id is null then
    select coalesce(max(version), 0) + 1 into next_version
    from public.project_deliveries where project_id = p_project_id;
    insert into public.project_deliveries (project_id, version, status, notes, created_by)
    values (p_project_id, next_version, 'preparing', 'Revision of v' || coalesce(pkg.version, 0)::text, auth.uid())
    returning * into next_pkg;
    insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
    values (p_project_id, auth.uid(), 'delivery_prepared', 'v' || next_version::text,
            jsonb_build_object('delivery_id', next_pkg.id, 'version', next_version, 'revision_of', pkg.id));
  end if;

  if proj.status <> 'in-review' then
    update public.projects set status = 'in-review' where id = p_project_id;
  end if;
  return next_pkg;
end;
$$;

-- INTERNAL placeholder only. Does not represent a client portal action.
create or replace function public.record_internal_client_approval(p_project_id uuid, p_note text, p_state text default 'approved_internally')
returns public.project_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  pkg public.project_deliveries;
  clean_note text := btrim(coalesce(p_note, ''));
  clean_state text := coalesce(nullif(btrim(p_state), ''), 'approved_internally');
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to record client approval.';
  end if;
  if clean_state not in ('not_requested', 'awaiting_client', 'approved_internally', 'revision_required') then
    raise exception 'Invalid internal approval state.';
  end if;
  if clean_state = 'approved_internally' and length(clean_note) = 0 then
    raise exception 'Add a short internal note describing how the client approved.';
  end if;

  select * into pkg from public.current_project_delivery(p_project_id);
  if pkg.id is null then
    raise exception 'Prepare and deliver a package before recording approval.';
  end if;

  update public.project_deliveries
     set approval_state = clean_state,
         approval_note = case when length(clean_note) > 0 then clean_note else approval_note end,
         approval_recorded_by = case when clean_state = 'approved_internally' then auth.uid() else approval_recorded_by end,
         approval_recorded_at = case when clean_state = 'approved_internally' then now() else approval_recorded_at end,
         status = case
           when clean_state = 'approved_internally' and status = 'delivered' then 'approved'
           else status
         end
   where id = pkg.id
   returning * into pkg;

  insert into public.project_activity (project_id, actor_id, event_type, old_value, new_value, metadata)
  values (
    p_project_id, auth.uid(), 'approval_recorded', null, clean_state,
    jsonb_build_object(
      'delivery_id', pkg.id,
      'internal_placeholder', true,
      'not_client_facing', true,
      'note', left(clean_note, 280)
    )
  );
  return pkg;
end;
$$;

create or replace function public.complete_project(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
  blockers text[];
begin
  proj := public.assert_staff_can_access_project(p_project_id);
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to complete this project.';
  end if;
  blockers := public.project_completion_blockers(p_project_id);
  if coalesce(cardinality(blockers), 0) > 0 then
    raise exception 'Cannot complete this project: %', array_to_string(blockers, '; ');
  end if;
  update public.projects set status = 'completed' where id = p_project_id
  returning * into proj;
  return proj;
end;
$$;

create or replace function public.archive_project(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_active() or public.must_change_password_pending() then
    raise exception 'Your account cannot archive projects right now.';
  end if;
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to archive this project.';
  end if;
  if not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to this project.';
  end if;
  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then raise exception 'Project not found'; end if;
  if proj.archived_at is not null then return proj; end if;
  if proj.status not in ('completed', 'cancelled') then
    raise exception 'Only Completed or Cancelled projects can be archived.';
  end if;
  update public.projects
     set archived_at = now(), archived_by = auth.uid()
   where id = p_project_id
   returning * into proj;
  return proj;
end;
$$;

create or replace function public.unarchive_project(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.projects;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_active() or public.must_change_password_pending() then
    raise exception 'Your account cannot unarchive projects right now.';
  end if;
  if not public.has_permission('project.edit') then
    raise exception 'You do not have permission to unarchive this project.';
  end if;
  if not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to this project.';
  end if;
  select * into proj from public.projects where id = p_project_id;
  if proj.id is null then raise exception 'Project not found'; end if;
  if proj.archived_at is null then return proj; end if;
  update public.projects
     set archived_at = null, archived_by = null
   where id = p_project_id
   returning * into proj;
  return proj;
end;
$$;

revoke all on function public.current_project_delivery(uuid) from public, anon;
revoke all on function public.project_delivery_file_count(uuid) from public, anon;
revoke all on function public.project_completion_blockers(uuid) from public, anon;
revoke all on function public.project_can_complete(uuid) from public, anon;
revoke all on function public.project_delivery_readiness(uuid) from public, anon;
revoke all on function public.assert_staff_can_access_project(uuid) from public, anon;
revoke all on function public.prepare_project_delivery(uuid, text) from public, anon;
revoke all on function public.add_project_delivery_file(uuid, uuid) from public, anon;
revoke all on function public.remove_project_delivery_file(uuid, uuid) from public, anon;
revoke all on function public.mark_delivery_ready(uuid) from public, anon;
revoke all on function public.mark_project_delivered(uuid, text) from public, anon;
revoke all on function public.request_project_revision(uuid, text) from public, anon;
revoke all on function public.record_internal_client_approval(uuid, text, text) from public, anon;
revoke all on function public.complete_project(uuid) from public, anon;
revoke all on function public.archive_project(uuid) from public, anon;
revoke all on function public.unarchive_project(uuid) from public, anon;

grant execute on function public.current_project_delivery(uuid) to authenticated;
grant execute on function public.project_delivery_file_count(uuid) to authenticated;
grant execute on function public.project_completion_blockers(uuid) to authenticated;
grant execute on function public.project_can_complete(uuid) to authenticated;
grant execute on function public.project_delivery_readiness(uuid) to authenticated;
grant execute on function public.prepare_project_delivery(uuid, text) to authenticated;
grant execute on function public.add_project_delivery_file(uuid, uuid) to authenticated;
grant execute on function public.remove_project_delivery_file(uuid, uuid) to authenticated;
grant execute on function public.mark_delivery_ready(uuid) to authenticated;
grant execute on function public.mark_project_delivered(uuid, text) to authenticated;
grant execute on function public.request_project_revision(uuid, text) to authenticated;
grant execute on function public.record_internal_client_approval(uuid, text, text) to authenticated;
grant execute on function public.complete_project(uuid) to authenticated;
grant execute on function public.archive_project(uuid) to authenticated;
grant execute on function public.unarchive_project(uuid) to authenticated;

commit;
-- ── END MIGRATION: 20260831000000_project_delivery_closure.sql ───────────────────────────────────────────────

-- ── BEGIN MIGRATION: 20260901000000_public_submission_tracking.sql ─────────────────────────────────────────────
-- Session 16 — Public Submission Confirmation & Tracking
--
-- Provides a professional confirmation experience and a secure read-only tracking
-- mechanism for clients who submit a dynamic form.
--
-- Key principles:
--   * Unguessable, human-friendly request reference number (e.g. REQ-2608-ABC123)
--   * High-entropy tracking token for direct URLs
--   * Clients do NOT need an account to track their submission
--   * Public tracking RPC exposes ONLY minimal, non-sensitive projection
--   * Zero leakage of internal notes, reviewer identity, or audit logs

begin;

-- ── 1. Reference generator function ──────────────────────────────────────────
create or replace function public.generate_submission_reference()
returns text
language plpgsql
as $$
declare
  prefix text;
  rand_part text;
  candidate text;
  loop_count integer := 0;
begin
  prefix := 'REQ-' || to_char(now() at time zone 'utc', 'YYMM') || '-';
  loop
    loop_count := loop_count + 1;
    -- Generate 6 uppercase alphanumeric characters
    rand_part := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    candidate := prefix || rand_part;
    if not exists (select 1 from public.form_submissions where reference_number = candidate) then
      return candidate;
    end if;
    if loop_count > 20 then
      return prefix || upper(substr(md5(gen_random_uuid()::text), 1, 8));
    end if;
  end loop;
end;
$$;

-- ── 2. Add reference number & tracking token to form_submissions ─────────────
alter table public.form_submissions
  add column if not exists reference_number text,
  add column if not exists tracking_token text;

comment on column public.form_submissions.reference_number is
  'Human-friendly unique reference code (e.g. REQ-2608-ABC123) shown to the client upon submission.';
comment on column public.form_submissions.tracking_token is
  'Cryptographically safe random token for read-only submission status tracking URLs.';

-- Backfill existing rows
update public.form_submissions
set reference_number = 'REQ-' || to_char(coalesce(submitted_at, created_at) at time zone 'utc', 'YYMM') || '-' || upper(substr(md5(id::text || coalesce(submitted_at, created_at)::text), 1, 6))
where reference_number is null;

update public.form_submissions
set tracking_token = encode(digest(id::text || coalesce(submitted_at, created_at)::text || gen_random_uuid()::text, 'sha256'), 'hex')
where tracking_token is null;

-- Set defaults and non-null constraints
alter table public.form_submissions
  alter column reference_number set default public.generate_submission_reference(),
  alter column reference_number set not null,
  alter column tracking_token set default encode(gen_random_bytes(24), 'hex'),
  alter column tracking_token set not null;

alter table public.form_submissions drop constraint if exists form_submissions_reference_number_unique;
alter table public.form_submissions add constraint form_submissions_reference_number_unique unique (reference_number);

alter table public.form_submissions drop constraint if exists form_submissions_tracking_token_unique;
alter table public.form_submissions add constraint form_submissions_tracking_token_unique unique (tracking_token);

create index if not exists idx_form_submissions_ref_upper on public.form_submissions (upper(reference_number));
create index if not exists idx_form_submissions_tracking_token on public.form_submissions (tracking_token);

-- ── 3. Public tracking RPC (minimal, non-sensitive projection) ────────────────
create or replace function public.get_public_submission_tracking(p_tracking_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_key text;
  sub_rec record;
  stage_idx integer;
  status_label text;
  status_desc text;
begin
  clean_key := btrim(coalesce(p_tracking_key, ''));
  if clean_key = '' then
    return null;
  end if;

  select
    s.id,
    s.reference_number,
    s.tracking_token,
    s.form_id,
    ft.title as form_title,
    ft.description as form_description,
    s.status,
    s.respondent_name,
    s.company_name,
    s.submitted_at,
    s.updated_at,
    (s.project_id is not null) as has_project
  into sub_rec
  from public.form_submissions s
  left join public.form_templates ft on ft.id = s.form_id
  where upper(s.reference_number) = upper(clean_key)
     or s.tracking_token = clean_key
  limit 1;

  if sub_rec.id is null then
    return null;
  end if;

  -- Map internal workflow status to safe client-facing stage & descriptions
  case sub_rec.status
    when 'new' then
      stage_idx := 1;
      status_label := 'Received';
      status_desc := 'Your submission has been securely received and queued for initial team review.';
    when 'reviewing' then
      stage_idx := 2;
      status_label := 'Under Review';
      status_desc := 'Our creative and technical specialists are actively evaluating your request requirements.';
    when 'need_information' then
      stage_idx := 2;
      status_label := 'Information Needed';
      status_desc := 'Our team needs a few clarifications. Please check your email for questions from our team.';
    when 'qualified' then
      stage_idx := 3;
      status_label := 'Qualified';
      status_desc := 'Your request has been qualified and approved for scoping and kickoff planning.';
    when 'approved' then
      stage_idx := 3;
      status_label := 'Approved';
      status_desc := 'Your request is approved. Team assignments and project setup are underway.';
    when 'converted' then
      stage_idx := 4;
      status_label := 'In Progress';
      status_desc := 'Your request has transitioned to an active project in our production pipeline.';
    when 'rejected' then
      stage_idx := 0;
      status_label := 'Declined';
      status_desc := 'We are currently unable to take on this project. Thank you for considering us.';
    when 'archived' then
      stage_idx := 0;
      status_label := 'Archived';
      status_desc := 'This request has been archived or closed.';
    else
      stage_idx := 1;
      status_label := 'Received';
      status_desc := 'Your request is in our system and will be processed shortly.';
  end case;

  return jsonb_build_object(
    'id', sub_rec.id,
    'reference_number', sub_rec.reference_number,
    'tracking_token', sub_rec.tracking_token,
    'form_id', sub_rec.form_id,
    'form_title', coalesce(sub_rec.form_title, 'Service Request'),
    'form_description', sub_rec.form_description,
    'status', sub_rec.status,
    'client_status_label', status_label,
    'client_status_description', status_desc,
    'stage_index', stage_idx,
    'submitted_at', sub_rec.submitted_at,
    'updated_at', sub_rec.updated_at,
    'respondent_name', sub_rec.respondent_name,
    'company_name', sub_rec.company_name,
    'has_project', sub_rec.has_project,
    'expected_response_time', '1–2 business days (24–48 hours)',
    'contact_email', 'support@agencyos.studio',
    'contact_phone', '+1 (555) 019-2834',
    'support_hours', 'Monday – Friday, 9:00 AM – 6:00 PM EST'
  );
end;
$$;

revoke all on function public.get_public_submission_tracking(text) from public;
grant execute on function public.get_public_submission_tracking(text) to anon, authenticated;

-- ── 4. Update submit_dynamic_form to store creation reference in event ───────
create or replace function public.submit_dynamic_form(
  p_form_id uuid,
  p_answers jsonb
)
returns public.form_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  form_rec public.form_templates;
  q public.form_questions;
  val jsonb;
  txt text;
  is_empty boolean;
  missing text[];
  submission_rec public.form_submissions;
  linked_client_id uuid;
  linked_project_id uuid;
  file_item jsonb;
  file_path text;
  file_name text;
  file_size bigint;
  file_ext text;
  rating_max_val integer;
  -- Rate limiting
  recent_count integer;
  -- Duplicate detection
  respondent_email_val text;
  fp text;
  dup_count integer;
  -- Payload validation
  answer_key text;
  answer_val text;
begin
  -- ── Form existence and status ──────────────────────────────────────────
  select * into form_rec from public.form_templates where id = p_form_id;
  if not found then
    raise exception 'Form not found';
  end if;
  if form_rec.status <> 'published' then
    raise exception 'This form is not accepting submissions';
  end if;

  -- ── Payload size guard ─────────────────────────────────────────────────
  if length(p_answers::text) > 102400 then
    raise exception 'Your submission is too large. Please shorten your answers.';
  end if;

  for answer_key, answer_val in select * from jsonb_each_text(p_answers)
  loop
    if length(answer_val) > 10000 then
      raise exception 'One of your answers exceeds the maximum allowed length.';
    end if;
  end loop;

  -- ── Rate limiting: max 5 submissions per minute per session+form ───────
  select count(*) into recent_count
  from public.form_rate_limits
  where session_id = auth.uid()
    and form_id = p_form_id
    and submitted_at > now() - interval '1 minute';

  if recent_count >= 5 then
    raise exception 'You are submitting too frequently. Please wait a moment and try again.';
  end if;

  -- ── Per-session cooldown: minimum 3 seconds between submissions ────────
  if exists (
    select 1 from public.form_rate_limits
    where session_id = auth.uid()
      and form_id = p_form_id
      and submitted_at > now() - interval '3 seconds'
  ) then
    raise exception 'Please wait a few seconds before submitting again.';
  end if;

  -- ── Validate answers ───────────────────────────────────────────────────
  for q in
    select * from public.form_questions where form_id = p_form_id order by position, created_at
  loop
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    is_empty := val is null
      or val = 'null'::jsonb
      or (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') = '')
      or (jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 0);

    if q.required and is_empty then
      missing := coalesce(missing, '{}') || q.label;
      continue;
    end if;

    if not is_empty then
      if q.question_type in ('single_choice', 'dropdown') then
        if jsonb_typeof(val) <> 'string'
           or not exists (select 1 from jsonb_array_elements_text(q.options) o where o = val #>> '{}') then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'multiple_choice' then
        if jsonb_typeof(val) <> 'array'
           or exists (select 1 from jsonb_array_elements_text(val) v where not exists (
                select 1 from jsonb_array_elements_text(q.options) o where o = v)) then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'yes_no' then
        if jsonb_typeof(val) <> 'string' or (val #>> '{}') not in ('yes', 'no') then
          raise exception 'Invalid answer for "%"', q.label;
        end if;
      elsif q.question_type = 'number' then
        if jsonb_typeof(val) <> 'number' and (jsonb_typeof(val) <> 'string' or (val #>> '{}') !~ '^-?\d+(\.\d+)?$') then
          raise exception 'Invalid number for "%"', q.label;
        end if;
      elsif q.question_type = 'rating' then
        rating_max_val := greatest(1, least(10, coalesce(nullif(q.config ->> 'rating_max', '')::integer, 5)));
        if (val #>> '{}') !~ '^\d+$'
           or (val #>> '{}')::integer < 1
           or (val #>> '{}')::integer > rating_max_val then
          raise exception 'Invalid rating for "%"', q.label;
        end if;
      elsif q.question_type = 'file_upload' then
        if jsonb_typeof(val) <> 'array' then
          raise exception 'Invalid file answer for "%"', q.label;
        end if;
        if jsonb_array_length(val) > 10 then
          raise exception 'Too many files uploaded for "%". Maximum is 10.', q.label;
        end if;

        for file_item in select * from jsonb_array_elements(val) loop
          file_name := coalesce(file_item ->> 'name', '');
          file_size := coalesce(nullif(file_item ->> 'size', '')::bigint, 0);

          if file_size > 20971520 then
            raise exception 'Uploaded file "%" exceeds maximum allowed size of 20 MB.', file_name;
          end if;

          file_ext := lower(substring(file_name from '\.([a-zA-Z0-9]+)$'));
          if file_ext in ('exe', 'bat', 'cmd', 'sh', 'php', 'phtml', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'js', 'vbs', 'msi', 'jar', 'scr', 'hta', 'ps1') then
            raise exception 'Uploaded file "%" has an unsafe file extension and is rejected.', file_name;
          end if;
        end loop;
      end if;

      txt := case when jsonb_typeof(val) = 'string' then btrim(val #>> '{}') else null end;
      if nullif(txt, '') is not null then
        if q.map_to = 'name' then submission_rec.respondent_name := txt; end if;
        if q.map_to = 'email' then respondent_email_val := lower(txt); end if;
        if q.map_to = 'phone' then submission_rec.respondent_phone := txt; end if;
        if q.map_to = 'company' then submission_rec.company_name := txt; end if;
      end if;
    end if;
  end loop;

  submission_rec.respondent_email := respondent_email_val;

  if missing is not null then
    raise exception 'Required questions are missing: %', array_to_string(missing, ', ');
  end if;

  -- ── Duplicate submission detection ─────────────────────────────────────
  if respondent_email_val is not null then
    fp := encode(digest(respondent_email_val || p_form_id::text, 'sha256'), 'hex');
    select count(*) into dup_count
    from public.form_submission_fingerprints
    where form_id = p_form_id
      and fingerprint = fp
      and submitted_at > now() - interval '5 minutes';

    if dup_count > 0 then
      raise exception 'You have already submitted a response recently. Please wait a few minutes before submitting again.';
    end if;

    insert into public.form_submission_fingerprints (form_id, fingerprint)
    values (p_form_id, fp);
  end if;

  -- ── Record rate-limit entry ────────────────────────────────────────────
  insert into public.form_rate_limits (session_id, form_id)
  values (auth.uid(), p_form_id);

  -- ── Match or create CRM client ─────────────────────────────────────────
  if respondent_email_val is not null then
    select id into linked_client_id
    from public.clients
    where lower(coalesce(email, '')) = respondent_email_val
    order by created_at asc
    limit 1;

    if linked_client_id is null then
      insert into public.clients (name, type, status, contact_person, email, phone, notes, created_by)
      values (
        coalesce(nullif(submission_rec.company_name, ''), nullif(submission_rec.respondent_name, ''), respondent_email_val),
        'potential',
        'potential',
        nullif(submission_rec.respondent_name, ''),
        respondent_email_val,
        nullif(submission_rec.respondent_phone, ''),
        'Created automatically from form "' || form_rec.title || '"',
        auth.uid()
      )
      returning id into linked_client_id;
    end if;
  end if;

  -- ── Optional: open a project ───────────────────────────────────────────
  if coalesce(form_rec.settings ->> 'create_project_on_submit', 'false') = 'true' and linked_client_id is not null then
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      coalesce(nullif(submission_rec.company_name, '') || ' — ', '') || form_rec.title,
      'Created automatically from a submission to form "' || form_rec.title || '"',
      linked_client_id,
      form_rec.title,
      'active', 1, 'Discovery', 0, auth.uid()
    )
    returning id into linked_project_id;
  end if;

  -- ── Store submission ───────────────────────────────────────────────────
  insert into public.form_submissions
    (form_id, form_version, status, respondent_name, respondent_email, respondent_phone, company_name, client_id, project_id, created_by)
  values (
    p_form_id, form_rec.version, 'new',
    submission_rec.respondent_name, submission_rec.respondent_email,
    submission_rec.respondent_phone, submission_rec.company_name,
    linked_client_id, linked_project_id, auth.uid()
  )
  returning * into submission_rec;

  -- Freeze each answer together with the question it answered
  insert into public.form_submission_answers (submission_id, question_id, question_snapshot, value)
  select submission_rec.id, fq.id, to_jsonb(fq), p_answers -> fq.id::text
  from public.form_questions fq
  where fq.form_id = p_form_id
    and public.is_form_question_visible(fq, p_answers)
  order by fq.position, fq.created_at;

  -- Record submission creation event in audit trail
  insert into public.form_submission_events (
    submission_id, actor_id, event_type, new_value, note, metadata
  ) values (
    submission_rec.id,
    (select id from public.profiles where id = auth.uid()),
    'created',
    'new',
    'Submission received',
    jsonb_build_object(
      'form_version', form_rec.version,
      'form_title', form_rec.title,
      'respondent_email', submission_rec.respondent_email,
      'reference_number', submission_rec.reference_number
    )
  );

  -- Attach uploaded files
  for q in select * from public.form_questions where form_id = p_form_id and question_type = 'file_upload' loop
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
    val := p_answers -> q.id::text;
    if jsonb_typeof(val) = 'array' then
      for file_item in select * from jsonb_array_elements(val) loop
        file_path := file_item ->> 'storage_path';
        if file_path is not null and (
          (auth.uid() is not null and split_part(file_path, '/', 1) = auth.uid()::text)
          or public.has_permission('submission.edit')
        ) then
          insert into public.form_submission_attachments
            (submission_id, question_id, name, size, mime_type, storage_path, uploaded_by)
          values (
            submission_rec.id, q.id,
            coalesce(nullif(file_item ->> 'name', ''), 'file'),
            coalesce(nullif(file_item ->> 'size', '')::bigint, 0),
            nullif(file_item ->> 'mime_type', ''),
            file_path,
            auth.uid()
          )
          on conflict (storage_path) do nothing;
        end if;
      end loop;
    end if;
  end loop;

  return submission_rec;
end;
$$;
revoke all on function public.submit_dynamic_form(uuid, jsonb) from public, anon;
grant execute on function public.submit_dynamic_form(uuid, jsonb) to authenticated, anon;

commit;
-- ── END MIGRATION: 20260901000000_public_submission_tracking.sql ───────────────────────────────────────────────
