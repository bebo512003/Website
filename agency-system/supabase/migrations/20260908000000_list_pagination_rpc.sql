-- Session 23 — Server-side list pagination (search / filtering / sorting)
--
-- Large collections are filtered, sorted, and paged in the database. Most
-- lists use parameterized PostgREST queries from the client (ilike/eq/in/
-- order/range + exact count). The submission review inbox gets two dedicated
-- SECURITY INVOKER functions because it needs cross-table search (form title,
-- reviewer name) and a non-alphabetical "workflow priority" sort that cannot
-- be expressed with PostgREST filters alone.
--
-- Both functions run with the caller's privileges, so RLS applies to every
-- row they read — they never widen what the signed-in user can already see.

begin;

-- ── 1. Submission inbox page ────────────────────────────────────────────────
-- One round trip returns: the requested page (with the form title and reviewer
-- joined for display), the exact total matching the filters, search across the
-- submission fields plus form title and reviewer name, status/reviewer/form
-- filters, and newest / oldest / workflow-priority sorting that stays correct
-- across pages.

create or replace function public.get_submission_inbox_page(
  p_search text default null,
  p_status text default null,
  p_reviewer_mode text default null,
  p_reviewer_id uuid default null,
  p_form_id uuid default null,
  p_sort text default 'newest',
  p_page integer default 1,
  p_page_size integer default 25,
  out data jsonb,
  out total bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_page_size integer := least(100, greatest(1, coalesce(p_page_size, 25)));
begin
  select count(*)
    into total
    from public.form_submissions fs
    left join public.form_templates ft on ft.id = fs.form_id
    left join public.profiles pr on pr.id = fs.reviewer_id
   where (p_search is null or p_search = ''
          or fs.reference_number ilike '%' || p_search || '%'
          or fs.respondent_name ilike '%' || p_search || '%'
          or fs.respondent_email ilike '%' || p_search || '%'
          or fs.respondent_phone ilike '%' || p_search || '%'
          or fs.company_name ilike '%' || p_search || '%'
          or ft.title ilike '%' || p_search || '%'
          or pr.full_name ilike '%' || p_search || '%'
          or pr.email ilike '%' || p_search || '%')
     and (p_status is null
          or (p_status = 'assigned_to_me' and fs.reviewer_id = auth.uid())
          or (p_status <> 'assigned_to_me' and fs.status = p_status))
     and (p_reviewer_mode is null
          or (p_reviewer_mode = 'unassigned' and fs.reviewer_id is null)
          or (p_reviewer_mode = 'assigned_to_me' and fs.reviewer_id = auth.uid()))
     and (p_reviewer_id is null or fs.reviewer_id = p_reviewer_id)
     and (p_form_id is null or fs.form_id = p_form_id);

  select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    into data
    from (
      select fs.*,
             case when ft.id is null then null
                  else jsonb_build_object('title', ft.title, 'slug', ft.slug)
             end as form_templates,
             case when pr.id is null then null
                  else jsonb_build_object(
                    'id', pr.id,
                    'full_name', pr.full_name,
                    'email', pr.email,
                    'avatar_url', pr.avatar_url,
                    'job_title', pr.job_title
                  )
             end as reviewer
        from public.form_submissions fs
        left join public.form_templates ft on ft.id = fs.form_id
        left join public.profiles pr on pr.id = fs.reviewer_id
       where (p_search is null or p_search = ''
              or fs.reference_number ilike '%' || p_search || '%'
              or fs.respondent_name ilike '%' || p_search || '%'
              or fs.respondent_email ilike '%' || p_search || '%'
              or fs.respondent_phone ilike '%' || p_search || '%'
              or fs.company_name ilike '%' || p_search || '%'
              or ft.title ilike '%' || p_search || '%'
              or pr.full_name ilike '%' || p_search || '%'
              or pr.email ilike '%' || p_search || '%')
         and (p_status is null
              or (p_status = 'assigned_to_me' and fs.reviewer_id = auth.uid())
              or (p_status <> 'assigned_to_me' and fs.status = p_status))
         and (p_reviewer_mode is null
              or (p_reviewer_mode = 'unassigned' and fs.reviewer_id is null)
              or (p_reviewer_mode = 'assigned_to_me' and fs.reviewer_id = auth.uid()))
         and (p_reviewer_id is null or fs.reviewer_id = p_reviewer_id)
         and (p_form_id is null or fs.form_id = p_form_id)
       order by
         (case when p_sort = 'oldest' then 1 else 0 end),
         (case when p_sort = 'status'
               then case fs.status
                      when 'new' then 0
                      when 'reviewing' then 1
                      when 'need_information' then 2
                      when 'qualified' then 3
                      when 'approved' then 4
                      when 'converted' then 5
                      when 'rejected' then 6
                      else 7
                    end
               else 0 end),
         (case when p_sort = 'oldest' then fs.submitted_at else '-infinity'::timestamptz end) asc,
         (case when p_sort = 'oldest' then 'infinity'::timestamptz else fs.submitted_at end) desc
       limit v_page_size offset (v_page - 1) * v_page_size
    ) r;
end;
$$;

comment on function public.get_submission_inbox_page is
  'Paged, searchable submission inbox (SECURITY INVOKER — RLS still applies).';

-- ── 2. Submission pipeline summary counts ───────────────────────────────────
-- Single round trip for the inbox summary cards: total, count per status, and
-- "assigned to me". Aggregated in Postgres, never in the browser.

create or replace function public.get_submission_pipeline_counts(
  out total bigint,
  out by_status jsonb,
  out assigned_to_me bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.form_submissions)::bigint,
    coalesce(
      (select jsonb_object_agg(status, n)
         from (select status, count(*) as n from public.form_submissions group by status) t),
      '{}'::jsonb
    ),
    (select count(*) from public.form_submissions where reviewer_id = auth.uid())::bigint
$$;

comment on function public.get_submission_pipeline_counts is
  'Submission inbox summary counts (SECURITY INVOKER — RLS still applies).';

commit;
