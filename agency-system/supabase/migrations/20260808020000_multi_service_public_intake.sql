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

create policy intake_attachments_insert on public.intake_attachments for insert
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
