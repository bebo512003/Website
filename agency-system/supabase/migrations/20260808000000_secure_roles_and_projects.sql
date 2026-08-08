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

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles', 'clients', 'projects', 'tasks', 'files', 'comments'] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
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
create policy tasks_insert_authorized on public.tasks for insert to authenticated with check (public.can_access_project(project_id) and created_by = auth.uid());
create policy tasks_update_authorized on public.tasks for update to authenticated using (public.is_manager_or_admin() or assignee_id = auth.uid() or created_by = auth.uid()) with check (public.can_access_project(project_id));
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
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.update_own_profile(text, text, text, text, text, text) to authenticated;

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
