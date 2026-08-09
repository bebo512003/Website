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
