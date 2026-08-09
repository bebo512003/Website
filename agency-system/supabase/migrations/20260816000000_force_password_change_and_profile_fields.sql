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
