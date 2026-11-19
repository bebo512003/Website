-- Manage the homepage selection in the existing portfolio editor.
-- Uploads still use the private portfolio-images bucket. The two optional
-- URL fields are limited to the original public Behance image CDN; they are
-- rendered by the visitor's browser, never fetched by our image proxy.

begin;

alter table public.portfolio_projects
  add column subtitle text,
  add column cover_image_url text,
  add column detail_image_url text,
  add constraint portfolio_projects_subtitle_length check (char_length(subtitle) <= 160),
  add constraint portfolio_projects_cover_url_is_behance check (
    cover_image_url is null or (
      char_length(cover_image_url) <= 1024
      and cover_image_url ~ '^https://mir-s3-cdn-cf\.behance\.net/(projects|project_modules)/[A-Za-z0-9_./-]+\.(jpg|jpeg|png|webp|avif)$'
      and strpos(cover_image_url, '..') = 0
    )
  ),
  add constraint portfolio_projects_detail_url_is_behance check (
    detail_image_url is null or (
      char_length(detail_image_url) <= 1024
      and detail_image_url ~ '^https://mir-s3-cdn-cf\.behance\.net/(projects|project_modules)/[A-Za-z0-9_./-]+\.(jpg|jpeg|png|webp|avif)$'
      and strpos(detail_image_url, '..') = 0
    )
  );

-- Move the four already-public editorial picks into the managed inventory.
-- Do not replace or publish a matching project that was already in the DB.
with selection(title, slug, subtitle, description, category_slug, gallery_id, external_url, cover_url, detail_url, position) as (
  values
    ('Tahatan Holding', 'tahatan-holding', 'Bilingual company profile',
      'A bilingual company profile for Tahatan Holding, with an editorial layout for Arabic and English.',
      'company-profile', '257985759',
      'https://www.behance.net/gallery/257985759/Tahatan-Holding-Bilingual-Company-Profile',
      'https://mir-s3-cdn-cf.behance.net/projects/max_808/1db90c257985759.Y3JvcCwzODM1LDMwMDAsMjgsMA.jpg',
      'https://mir-s3-cdn-cf.behance.net/project_modules/1400/1aad71257985759.6ae9e797be4d0.jpg', 10),
    ('MERAAK', 'meraak', 'Real estate visual identity system',
      'A visual identity system for a Saudi real estate brand, with guidelines, patterns, and brand applications.',
      'visual-identity', '254584701',
      'https://www.behance.net/gallery/254584701/MERAAK-Real-Estate-Visual-Identity-System-KSA',
      'https://mir-s3-cdn-cf.behance.net/projects/max_808/d44189254584701.Y3JvcCw1NzA5LDQ0NjUsMCwxNA.png',
      'https://mir-s3-cdn-cf.behance.net/project_modules/1400/892fec254584701.6a87680338490.png', 20),
    ('3 Girls Fruit', '3-girls-fruit', 'Premium dates brand identity',
      'A visual identity for a premium dates brand, including its logo, packaging, and Arabic menu.',
      'branding', '229223805',
      'https://www.behance.net/gallery/229223805/3-Girls-Fruit-Premium-Dates-Brand-Identity',
      'https://mir-s3-cdn-cf.behance.net/projects/404/d2c894229223805.Y3JvcCwxOTE3LDE1MDAsNjYsMA.jpg',
      'https://mir-s3-cdn-cf.behance.net/project_modules/1400/81e5e5229223805.6aebdd5a07d55.jpg', 30),
    ('InventionsX', 'inventionsx', 'Investor pitch deck redesign',
      'An investor presentation redesign for InventionsX, with a consistent visual language across the deck.',
      'presentation-design', '235338327',
      'https://www.behance.net/gallery/235338327/InventionsX-Investor-Pitch-Deck-Redesign-KSA',
      'https://mir-s3-cdn-cf.behance.net/projects/max_808/1d68af235338327.Y3JvcCwzODM1LDMwMDAsODUsMA.jpg',
      'https://mir-s3-cdn-cf.behance.net/project_modules/1400/d6f8b1235338327.6ae2120e0522f.png', 40)
)
insert into public.portfolio_projects (
  title, slug, subtitle, description, category_id, external_url,
  cover_image_url, detail_image_url, featured, published, display_order
)
select item.title, item.slug, item.subtitle, item.description, category.id, item.external_url,
  item.cover_url, item.detail_url, true, true, item.position
from selection item
left join public.portfolio_categories category on category.slug = item.category_slug
where not exists (
  select 1 from public.portfolio_projects existing
  where substring(existing.external_url from '^https?://(?:www\.)?behance\.net/gallery/([0-9]+)(?:[/?#]|$)') = item.gallery_id
)
on conflict (slug) do nothing;

-- Retain the existing relative order while removing tied positions. Each new
-- project gets its own position at the end rather than another default zero.
with positions as (
  select id, row_number() over (order by display_order, created_at desc, id)::integer as position
  from public.portfolio_projects
)
update public.portfolio_projects project
set display_order = positions.position
from positions
where positions.id = project.id and project.display_order <> positions.position;

create sequence public.portfolio_project_order_seq as integer owned by public.portfolio_projects.display_order;
select setval('public.portfolio_project_order_seq', coalesce(max(display_order), 0) + 1, false)
from public.portfolio_projects;
alter table public.portfolio_projects
  alter column display_order set default nextval('public.portfolio_project_order_seq'),
  add constraint portfolio_projects_unique_order unique (display_order) deferrable;
grant usage on sequence public.portfolio_project_order_seq to authenticated;

-- Swap both positions in one statement so another visitor never sees a
-- partial reorder. Invoker privileges keep the normal table RLS in force.
create function public.swap_portfolio_project_order(p_project_id uuid, p_neighbor_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  project_order integer;
  neighbor_order integer;
begin
  if not public.has_permission('portfolio.manage') then
    raise exception 'Portfolio permission required' using errcode = '42501';
  end if;

  perform 1 from public.portfolio_projects
  where id in (p_project_id, p_neighbor_id) order by id for update;

  select max(display_order) filter (where id = p_project_id),
         max(display_order) filter (where id = p_neighbor_id)
  into project_order, neighbor_order
  from public.portfolio_projects where id in (p_project_id, p_neighbor_id);

  if project_order is null or neighbor_order is null or p_project_id = p_neighbor_id then
    raise exception 'Two different projects are required' using errcode = '22023';
  end if;

  update public.portfolio_projects
  set display_order = case when id = p_project_id then neighbor_order else project_order end
  where id in (p_project_id, p_neighbor_id);
end;
$$;

revoke all on function public.swap_portfolio_project_order(uuid, uuid) from public, anon;
grant execute on function public.swap_portfolio_project_order(uuid, uuid) to authenticated;

-- Keep the original public RPCs intact for existing integrations. This
-- projection adds card fields and filters at the DB, so asking for the home
-- row or a single project does not fetch the rest of the inventory.
create function public.get_public_portfolio_entries(
  p_selected_only boolean default false,
  p_slug text default null
)
returns table (
  id uuid,
  title text,
  slug text,
  subtitle text,
  cover_image_path text,
  cover_image_url text,
  detail_image_url text,
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
set search_path = ''
as $$
  select
    project.id,
    project.title,
    project.slug,
    project.subtitle,
    project.cover_image_path,
    project.cover_image_url,
    project.detail_image_url,
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
  where project.published and not project.archived
    and (not coalesce(p_selected_only, false) or project.featured)
    and (p_slug is null or project.slug = p_slug)
  group by project.id, category.id
  order by project.display_order, project.created_at desc, project.id;
$$;

revoke all on function public.get_public_portfolio_entries(boolean, text) from public;
grant execute on function public.get_public_portfolio_entries(boolean, text) to anon, authenticated;

commit;
