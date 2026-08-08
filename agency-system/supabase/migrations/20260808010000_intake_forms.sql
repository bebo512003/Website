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
