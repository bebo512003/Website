-- Agency OS production schema
-- Run this file in the Supabase SQL Editor on a new project.
-- It contains no seed users, clients, projects, tasks, files, or notifications.

begin;

create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('admin', 'manager', 'employee', 'client');
exception
  when duplicate_object then null;
end $$;

-- Older databases: adopt the client account role.
alter type public.app_role add value if not exists 'client';

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
-- Structured creative-service intakes: Logo Design, Visual Identity and Company Profile.
begin;

create table if not exists public.intake_forms (
  id uuid primary key default gen_random_uuid(),
  service_type text check (service_type in ('logo_design', 'visual_identity', 'company_profile')),
  service_types text[] not null default '{}',
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

create table if not exists public.intake_projects (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intake_forms(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  service_type text not null check (service_type in ('logo_design', 'visual_identity', 'company_profile')),
  created_at timestamptz not null default now(),
  unique (intake_id, project_id)
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
create index if not exists idx_intake_projects_intake on public.intake_projects(intake_id);
create index if not exists idx_intake_projects_project on public.intake_projects(project_id);
create index if not exists idx_intake_attachments_intake on public.intake_attachments(intake_id);

drop trigger if exists update_intake_forms_updated_at on public.intake_forms;
create trigger update_intake_forms_updated_at before update on public.intake_forms
for each row execute function public.set_updated_at();

alter table public.intake_forms enable row level security;
alter table public.intake_projects enable row level security;
alter table public.intake_attachments enable row level security;

create policy intake_forms_select on public.intake_forms for select
  using (created_by = auth.uid() or public.is_manager_or_admin());
create policy intake_forms_insert on public.intake_forms for insert
  with check (created_by = auth.uid());
create policy intake_forms_update on public.intake_forms for update
  using (created_by = auth.uid() or public.is_manager_or_admin())
  with check (created_by = auth.uid() or public.is_manager_or_admin());

create policy intake_projects_select on public.intake_projects for select
  using (exists (select 1 from public.intake_forms f where f.id = intake_id and (f.created_by = auth.uid() or public.is_manager_or_admin())));
create policy intake_projects_insert on public.intake_projects for insert
  with check (exists (select 1 from public.intake_forms f where f.id = intake_id and (f.created_by = auth.uid() or public.is_manager_or_admin())));

create policy intake_attachments_select on public.intake_attachments for select
  using (exists (select 1 from public.intake_forms f where f.id = intake_id and (f.created_by = auth.uid() or public.is_manager_or_admin())));
create policy intake_attachments_insert on public.intake_attachments for insert
  with check (uploaded_by = auth.uid() and exists (select 1 from public.intake_forms f where f.id = intake_id and (f.created_by = auth.uid() or public.is_manager_or_admin())));
create policy intake_attachments_delete on public.intake_attachments for delete
  using (uploaded_by = auth.uid() or public.is_manager_or_admin());

-- Multi-service branching submit: supports Logo, Logo+VI, VI, Profile, or any combination.
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

  if exists (select 1 from public.intake_projects where intake_id = target_intake_id) then
    update public.intake_forms set status = 'submitted', submitted_at = coalesce(submitted_at, now())
    where id = target_intake_id returning * into form_record;
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

  -- Logo + Visual Identity (combined or with Profile)
  if array['logo_design', 'visual_identity']::text[] <@ services then
    project_type := 'Logo + Visual Identity';
    project_title := form_record.company_name || ' — ' || project_type;
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (project_title, 'Created automatically from intake #' || left(target_intake_id::text, 8), linked_client_id, project_type, 'active', 1, 'Discovery', 0, auth.uid())
    returning id into linked_project_id;
    insert into public.intake_projects (intake_id, project_id, service_type)
    values (target_intake_id, linked_project_id, 'logo_design'), (target_intake_id, linked_project_id, 'visual_identity');
  end if;

  -- Logo only
  if 'logo_design' = any(services) and not ('visual_identity' = any(services)) then
    project_type := 'Logo Design';
    project_title := form_record.company_name || ' — ' || project_type;
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (project_title, 'Created automatically from intake #' || left(target_intake_id::text, 8), linked_client_id, project_type, 'active', 1, 'Discovery', 0, auth.uid())
    returning id into linked_project_id;
    insert into public.intake_projects (intake_id, project_id, service_type)
    values (target_intake_id, linked_project_id, 'logo_design');
  end if;

  -- Visual Identity only
  if 'visual_identity' = any(services) and not ('logo_design' = any(services)) then
    project_type := 'Visual Identity';
    project_title := form_record.company_name || ' — ' || project_type;
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (project_title, 'Created automatically from intake #' || left(target_intake_id::text, 8), linked_client_id, project_type, 'active', 1, 'Discovery', 0, auth.uid())
    returning id into linked_project_id;
    insert into public.intake_projects (intake_id, project_id, service_type)
    values (target_intake_id, linked_project_id, 'visual_identity');
  end if;

  -- Company Profile (always a separate project)
  if 'company_profile' = any(services) then
    project_type := 'Company Profile';
    project_title := form_record.company_name || ' — ' || project_type;
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (project_title, 'Created automatically from intake #' || left(target_intake_id::text, 8), linked_client_id, project_type, 'active', 1, 'Discovery', 0, auth.uid())
    returning id into linked_project_id;
    insert into public.intake_projects (intake_id, project_id, service_type)
    values (target_intake_id, linked_project_id, 'company_profile');
  end if;

  select project_id into linked_project_id from public.intake_projects
  where intake_id = target_intake_id order by created_at asc limit 1;

  update public.intake_forms
  set status = 'submitted', client_id = linked_client_id, project_id = linked_project_id, submitted_at = now()
  where id = target_intake_id returning * into form_record;
  return form_record;
end;
$$;
revoke all on function public.submit_intake_form(uuid) from public, anon;
grant execute on function public.submit_intake_form(uuid) to authenticated, anon;

insert into storage.buckets (id, name, public) values ('intake-files', 'intake-files', false)
on conflict (id) do update set public = false;
drop policy if exists intake_files_select on storage.objects;
drop policy if exists intake_files_insert on storage.objects;
drop policy if exists intake_files_delete on storage.objects;
create policy intake_files_select on storage.objects for select to authenticated, anon using (bucket_id = 'intake-files' and owner_id = auth.uid()::text);
create policy intake_files_insert on storage.objects for insert to authenticated, anon with check (bucket_id = 'intake-files' and owner_id = auth.uid()::text);
create policy intake_files_delete on storage.objects for delete to authenticated, anon using (bucket_id = 'intake-files' and owner_id = auth.uid()::text);
commit;
-- User & employee architecture: client accounts, admin-managed job roles, employment status.
-- Mirrors supabase/migrations/20260809000000_user_employee_architecture.sql.
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

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_staff_or_self on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

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

-- Dynamic form builder (Phase D)
-- Mirrors supabase/migrations/20260811000000_dynamic_form_builder.sql.
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

-- ── 4b. Section + conditional visibility helper ─────────────────────────────
-- Sections are stored in config->>'section'; conditional show/hide is stored in
-- config->'show_if' as {"question_id": "<uuid>", "value": "..."}. A question is
-- visible when its trigger question's answer equals the value (single_choice /
-- dropdown / yes_no) or, for multiple_choice, when the value is among the
-- selected options. Forms without a show_if rule behave exactly as before.
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

-- ── 5. Public submit RPC ─────────────────────────────────────────────────────
-- Validates the answers against the live question set, snapshots each question,
-- matches or creates the CRM client record, and (optionally) opens a project.
-- Questions hidden by an unmet show_if rule are skipped: not required, not
-- validated, and not snapshotted.
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

