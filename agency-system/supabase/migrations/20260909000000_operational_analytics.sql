-- Session 24 — Operational Analytics
--
-- One permission-checked database report built from the agency's real workflow:
-- submissions and their immutable first staff response, project lifecycle,
-- task deadlines/assignees, team workload, and delivery packages.
--
-- Financial reporting is intentionally out of scope. Project budgets, client
-- values, rates, invoices, and revenue are never selected or returned here.

begin;

-- These indexes serve the report's time-window and exception queries without
-- changing any business records. All are safe/idempotent for existing installs.
create index if not exists idx_form_submissions_submitted_at
  on public.form_submissions(submitted_at desc);
create index if not exists idx_form_submission_events_first_response
  on public.form_submission_events(submission_id, created_at)
  where actor_id is not null
    and event_type in (
      'status_changed', 'reviewer_assigned', 'reviewer_reassigned',
      'note_added', 'converted_to_project'
    );
create index if not exists idx_tasks_open_due_date
  on public.tasks(due_date, assignee_id)
  where status <> 'done';
create index if not exists idx_projects_live_status_due_date
  on public.projects(status, due_date)
  where archived_at is null;
create index if not exists idx_project_deliveries_delivered_at
  on public.project_deliveries(delivered_at)
  where delivered_at is not null;

create or replace function public.get_operational_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_days integer := least(365, greatest(7, coalesce(p_days, 30)));
  v_start_date date;
  v_previous_start_date date;
  v_has_submissions boolean;
  v_all_projects boolean;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_active() or public.must_change_password_pending() then
    raise exception 'Your account is not available for operational reporting.';
  end if;
  if not public.has_permission('report.view') then
    raise exception 'You do not have permission to view reports.';
  end if;

  v_start_date := current_date - (v_days - 1);
  v_previous_start_date := v_start_date - v_days;
  v_has_submissions := public.has_permission('submission.view');
  v_all_projects := public.has_permission('project.view_all');

  with
  -- SECURITY DEFINER is used so one RPC can aggregate efficiently, but every
  -- project is explicitly scoped through the same access helper as project RLS.
  accessible_projects as materialized (
    -- Explicit operational projection: financial columns are not selected.
    select
      p.id,
      p.name,
      p.status,
      p.due_date,
      p.archived_at,
      p.start_date,
      p.created_at
    from public.projects p
    where public.can_user_access_project(v_user_id, p.id)
  ),
  live_projects as materialized (
    select * from accessible_projects where archived_at is null
  ),
  operational_projects as materialized (
    select *
    from live_projects
    where status in (
      'planned', 'active', 'waiting-for-client', 'in-review',
      'ready-for-delivery', 'delivered'
    )
  ),
  current_submissions as materialized (
    select
      fs.id,
      fs.form_id,
      fs.status,
      fs.project_id,
      fs.converted_at,
      fs.submitted_at,
      first_action.first_response_at
    from public.form_submissions fs
    left join lateral (
      select min(e.created_at) as first_response_at
      from public.form_submission_events e
      where e.submission_id = fs.id
        and e.actor_id is not null
        and e.event_type in (
          'status_changed', 'reviewer_assigned', 'reviewer_reassigned',
          'note_added', 'converted_to_project'
        )
        and e.created_at >= fs.submitted_at
    ) first_action on true
    where v_has_submissions
      and fs.submitted_at >= v_start_date::timestamptz
      and fs.submitted_at <= now()
  ),
  submission_summary as (
    select
      count(*)::bigint as volume,
      count(*) filter (
        where project_id is not null or converted_at is not null or status = 'converted'
      )::bigint as converted,
      count(*) filter (where first_response_at is not null)::bigint as responded,
      count(*) filter (where first_response_at is null)::bigint as awaiting_response,
      percentile_cont(0.5) within group (
        order by extract(epoch from (first_response_at - submitted_at)) / 3600.0
      ) filter (where first_response_at is not null) as median_response_hours
    from current_submissions
  ),
  previous_submission_summary as (
    select count(*)::bigint as volume
    from public.form_submissions fs
    where v_has_submissions
      and fs.submitted_at >= v_previous_start_date::timestamptz
      and fs.submitted_at < v_start_date::timestamptz
  ),
  submission_by_form as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'form_id', ranked.form_id,
      'title', ranked.title,
      'submissions', ranked.submissions,
      'converted', ranked.converted,
      'conversion_rate', ranked.conversion_rate
    ) order by ranked.submissions desc, ranked.title), '[]'::jsonb) as rows
    from (
      select
        cs.form_id,
        coalesce(ft.title, 'Deleted form') as title,
        count(*)::bigint as submissions,
        count(*) filter (
          where cs.project_id is not null or cs.converted_at is not null or cs.status = 'converted'
        )::bigint as converted,
        round(
          100.0 * count(*) filter (
            where cs.project_id is not null or cs.converted_at is not null or cs.status = 'converted'
          ) / nullif(count(*), 0),
          1
        ) as conversion_rate
      from current_submissions cs
      left join public.form_templates ft on ft.id = cs.form_id
      group by cs.form_id, ft.title
    ) ranked
  ),
  trend_settings as (
    select
      case when v_days <= 31 then 'day' else 'week' end as grain,
      case
        when v_days <= 31 then v_start_date
        else date_trunc('week', v_start_date::timestamp)::date
      end as first_bucket,
      case when v_days <= 31 then interval '1 day' else interval '7 days' end as step
  ),
  trend_series as (
    select point::date as period_start
    from trend_settings ts,
         generate_series(ts.first_bucket::timestamp, current_date::timestamp, ts.step) point
  ),
  submission_trend as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'period_start', series.period_start,
      'submissions', coalesce(bucket.submissions, 0),
      'converted', coalesce(bucket.converted, 0)
    ) order by series.period_start), '[]'::jsonb) as rows
    from trend_series series
    cross join trend_settings settings
    left join (
      select
        case
          when v_days <= 31 then date_trunc('day', submitted_at)::date
          else date_trunc('week', submitted_at)::date
        end as period_start,
        count(*)::bigint as submissions,
        count(*) filter (
          where project_id is not null or converted_at is not null or status = 'converted'
        )::bigint as converted
      from current_submissions
      group by 1
    ) bucket on bucket.period_start = series.period_start
  ),
  project_status_catalog as (
    select status, display_order
    from unnest(array[
      'draft', 'planned', 'active', 'waiting-for-client', 'in-review',
      'ready-for-delivery', 'delivered', 'completed', 'on-hold', 'cancelled'
    ]::text[]) with ordinality as statuses(status, display_order)
  ),
  projects_by_status as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'status', catalog.status,
      'count', coalesce(counts.count, 0)
    ) order by catalog.display_order), '[]'::jsonb) as rows
    from project_status_catalog catalog
    left join (
      select status, count(*)::bigint as count
      from live_projects
      group by status
    ) counts on counts.status = catalog.status
  ),
  project_summary as (
    select
      (select count(*)::bigint from operational_projects) as active,
      count(*) filter (
        where due_date < current_date
          and status not in ('completed', 'cancelled')
      )::bigint as overdue
    from live_projects
  ),
  open_tasks as materialized (
    select
      t.id,
      t.title,
      t.project_id,
      t.status,
      t.priority,
      t.assignee_id,
      t.due_date,
      project.name as project_name
    from public.tasks t
    join live_projects project on project.id = t.project_id
    where t.status <> 'done'
  ),
  task_summary as (
    select
      count(*)::bigint as open,
      count(*) filter (where due_date < current_date)::bigint as overdue,
      count(*) filter (where assignee_id is null)::bigint as unassigned,
      count(*) filter (
        where due_date between current_date and current_date + 7
      )::bigint as due_next_7_days
    from open_tasks
  ),
  overdue_task_items as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id,
      'title', item.title,
      'project_id', item.project_id,
      'project_name', item.project_name,
      'assignee_id', item.assignee_id,
      'assignee_name', item.assignee_name,
      'due_date', item.due_date,
      'days_overdue', item.days_overdue,
      'priority', item.priority
    ) order by item.days_overdue desc, item.due_date, item.title), '[]'::jsonb) as rows
    from (
      select
        task.id,
        task.title,
        task.project_id,
        task.project_name,
        task.assignee_id,
        coalesce(nullif(btrim(profile.full_name), ''), profile.email, 'Unassigned') as assignee_name,
        task.due_date,
        (current_date - task.due_date)::integer as days_overdue,
        task.priority
      from open_tasks task
      left join public.profiles profile on profile.id = task.assignee_id
      where task.due_date < current_date
      order by task.due_date, task.title
      limit 10
    ) item
  ),
  workload_people as materialized (
    select profile.id, profile.full_name, profile.email, profile.job_title
    from public.profiles profile
    where profile.status = 'active'
      and profile.role <> 'client'::public.app_role
      and not profile.must_change_password
      and (
        exists (select 1 from open_tasks task where task.assignee_id = profile.id)
        or exists (
          select 1
          from public.project_members member
          join operational_projects project on project.id = member.project_id
          where member.user_id = profile.id
        )
      )
  ),
  team_workload as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', workload.user_id,
      'name', workload.name,
      'job_title', workload.job_title,
      'active_projects', workload.active_projects,
      'open_tasks', workload.open_tasks,
      'overdue_tasks', workload.overdue_tasks,
      'due_next_7_days', workload.due_next_7_days,
      'in_review_tasks', workload.in_review_tasks
    ) order by workload.overdue_tasks desc, workload.open_tasks desc, workload.name), '[]'::jsonb) as rows
    from (
      select
        person.id as user_id,
        coalesce(nullif(btrim(person.full_name), ''), person.email) as name,
        person.job_title,
        (
          select count(distinct member.project_id)::bigint
          from public.project_members member
          join operational_projects project on project.id = member.project_id
          where member.user_id = person.id
        ) as active_projects,
        count(task.id)::bigint as open_tasks,
        count(task.id) filter (where task.due_date < current_date)::bigint as overdue_tasks,
        count(task.id) filter (
          where task.due_date between current_date and current_date + 7
        )::bigint as due_next_7_days,
        count(task.id) filter (where task.status = 'review')::bigint as in_review_tasks
      from workload_people person
      left join open_tasks task on task.assignee_id = person.id
      group by person.id, person.full_name, person.email, person.job_title
    ) workload
  ),
  first_project_delivery as materialized (
    select
      project.id as project_id,
      project.start_date,
      project.created_at,
      project.due_date,
      min(delivery.delivered_at) as first_delivered_at,
      bool_or(
        delivery.status = 'revision_requested'
        or delivery.approval_state = 'revision_required'
      ) as had_revision
    from accessible_projects project
    join public.project_deliveries delivery on delivery.project_id = project.id
    where delivery.delivered_at is not null
    group by project.id, project.start_date, project.created_at, project.due_date
  ),
  delivery_window as materialized (
    select *
    from first_project_delivery
    where first_delivered_at >= v_start_date::timestamptz
      and first_delivered_at <= now()
  ),
  delivery_summary as (
    select
      count(*)::bigint as delivered,
      count(*) filter (where due_date is not null)::bigint as scheduled,
      count(*) filter (
        where due_date is not null and first_delivered_at::date <= due_date
      )::bigint as on_time,
      count(*) filter (
        where due_date is not null and first_delivered_at::date > due_date
      )::bigint as late,
      count(*) filter (where due_date is null)::bigint as no_deadline,
      count(*) filter (where had_revision)::bigint as revision_projects,
      percentile_cont(0.5) within group (
        order by first_delivered_at::date - coalesce(start_date, created_at::date)
      ) as median_cycle_days,
      percentile_cont(0.5) within group (
        order by first_delivered_at::date - due_date
      ) filter (where due_date is not null) as median_variance_days
    from delivery_window
  )
  select jsonb_build_object(
    'window', jsonb_build_object(
      'days', v_days,
      'start_date', v_start_date,
      'end_date', current_date,
      'previous_start_date', v_previous_start_date,
      'previous_end_date', v_start_date - 1,
      'generated_at', now()
    ),
    'scope', jsonb_build_object(
      'all_projects', v_all_projects,
      'submissions_included', v_has_submissions
    ),
    'submissions', (
      select jsonb_build_object(
        'volume', summary.volume,
        'previous_volume', previous.volume,
        'volume_change_percent', case
          when previous.volume = 0 then null
          else round(100.0 * (summary.volume - previous.volume) / previous.volume, 1)
        end,
        'converted', summary.converted,
        'conversion_rate', case
          when summary.volume = 0 then null
          else round(100.0 * summary.converted / summary.volume, 1)
        end,
        'responded', summary.responded,
        'awaiting_response', summary.awaiting_response,
        'median_response_hours', case
          when summary.median_response_hours is null then null
          else round(summary.median_response_hours::numeric, 1)
        end,
        'by_form', forms.rows,
        'trend', trend.rows
      )
      from submission_summary summary
      cross join previous_submission_summary previous
      cross join submission_by_form forms
      cross join submission_trend trend
    ),
    'projects', (
      select jsonb_build_object(
        'active', summary.active,
        'overdue', summary.overdue,
        'by_status', statuses.rows
      )
      from project_summary summary
      cross join projects_by_status statuses
    ),
    'tasks', (
      select jsonb_build_object(
        'open', summary.open,
        'overdue', summary.overdue,
        'unassigned', summary.unassigned,
        'due_next_7_days', summary.due_next_7_days,
        'overdue_items', items.rows
      )
      from task_summary summary
      cross join overdue_task_items items
    ),
    'team_workload', (select rows from team_workload),
    'delivery', (
      select jsonb_build_object(
        'delivered', summary.delivered,
        'scheduled', summary.scheduled,
        'on_time', summary.on_time,
        'late', summary.late,
        'no_deadline', summary.no_deadline,
        'on_time_rate', case
          when summary.scheduled = 0 then null
          else round(100.0 * summary.on_time / summary.scheduled, 1)
        end,
        'revision_projects', summary.revision_projects,
        'median_cycle_days', case
          when summary.median_cycle_days is null then null
          else round(summary.median_cycle_days::numeric, 1)
        end,
        'median_variance_days', case
          when summary.median_variance_days is null then null
          else round(summary.median_variance_days::numeric, 1)
        end
      )
      from delivery_summary summary
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_operational_analytics(integer) is
  'Permission-scoped operational report. Windowed: submissions/deliveries. Current snapshot: projects/tasks/workload. Contains no financial data.';

revoke all on function public.get_operational_analytics(integer) from public, anon;
grant execute on function public.get_operational_analytics(integer) to authenticated;

commit;
