-- Session 21 — Transactional email notifications (Resend)
--
-- High-value events only. The database never sends email itself: triggers
-- enqueue rows into `email_outbox`, and the server-side job
-- (GET /api/cron/emails, protected by CRON_SECRET) claims them, renders the
-- branded template, and sends via the Resend provider. Delivery status is
-- tracked through Resend webhooks (POST /api/email/resend-webhook) which
-- append to `email_delivery_events` and update the outbox row.
--
-- Covered events (see README for the full matrix):
--   submission-received      → public submitter          (form_submissions insert)
--   new-submission           → staff with submission.view (form_submissions insert)
--   client-invitation        → enqueued by the Next.js admin route (no trigger,
--                              no password in the payload)
--   delivery-ready           → client portal accounts    (project_deliveries → delivered)
--   revision-approval-update → acting client             (client_approvals approved/revision_requested)
--   project-update           → project owner + manager   (client_approvals feedback/approved/revision)
--   task-assigned            → assignee                  (tasks insert / assignee change)
--   project-assigned         → new owner/manager/member  (projects update, project_members insert)
--
-- Every other in-app notification stays inbox-only for now.
--
-- Duplicates are impossible: `email_outbox` has a unique
-- (template_key, dedupe_key) index and the enqueue helper inserts with
-- ON CONFLICT DO NOTHING. Claiming is optimistic (status='queued' guard) so
-- concurrent workers can never double-send the same row.
--
-- The outbox is server-only: RLS denies every role and the enqueue helper is
-- revocable; only SECURITY DEFINER triggers and the service-role server can
-- read/write it. Sensitive payloads stay out of email content entirely
-- (e.g. no passwords, no full answer dumps, no internal links in client mail).

begin;

-- ── 1. Outbox table ─────────────────────────────────────────────────────────
create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  template_key text not null check (template_key in (
    'submission-received',
    'client-invitation',
    'delivery-ready',
    'revision-approval-update',
    'new-submission',
    'task-assigned',
    'project-assigned',
    'project-update'
  )),
  recipient_email text not null,
  recipient_user_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  provider text,
  provider_message_id text,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint email_outbox_template_dedupe_key unique (template_key, dedupe_key)
);

comment on table public.email_outbox is
  'Server-side transactional email queue. Written by SECURITY DEFINER triggers / service role, flushed by GET /api/cron/emails, updated by the Resend webhook.';
comment on column public.email_outbox.payload is
  'Template variables only — never passwords, answers, or internal-only data.';
comment on column public.email_outbox.status is
  'queued → sending → sent → delivered (webhook). failed after retries are exhausted; skipped when expired or unrenderable.';
comment on column public.email_outbox.next_attempt_at is
  'Earliest time the row may be claimed again after a transient failure.';

create index if not exists idx_email_outbox_claim
  on public.email_outbox (status, next_attempt_at, created_at);
create index if not exists idx_email_outbox_provider_message
  on public.email_outbox (provider_message_id);

alter table public.email_outbox enable row level security;

-- Server-only: no browser role may ever read or write the queue.
drop policy if exists email_outbox_no_public_read on public.email_outbox;
create policy email_outbox_no_public_read on public.email_outbox
  for select to anon, authenticated using (false);
drop policy if exists email_outbox_no_public_write on public.email_outbox;
create policy email_outbox_no_public_write on public.email_outbox
  for insert to anon, authenticated with check (false);
drop policy if exists email_outbox_no_public_update on public.email_outbox;
create policy email_outbox_no_public_update on public.email_outbox
  for update to anon, authenticated using (false);
drop policy if exists email_outbox_no_public_delete on public.email_outbox;
create policy email_outbox_no_public_delete on public.email_outbox
  for delete to anon, authenticated using (false);

revoke all on table public.email_outbox from anon, authenticated;

-- ── 2. Provider delivery-event log ──────────────────────────────────────────
create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend',
  provider_message_id text,
  event_type text not null,
  recipient_email text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

comment on table public.email_delivery_events is
  'Append-only log of provider webhook events (sent/delivered/bounced/complained/…). Written only by the server webhook route.';

create index if not exists idx_email_delivery_events_message
  on public.email_delivery_events (provider_message_id, received_at desc);

alter table public.email_delivery_events enable row level security;

drop policy if exists email_delivery_events_no_public_read on public.email_delivery_events;
create policy email_delivery_events_no_public_read on public.email_delivery_events
  for select to anon, authenticated using (false);
drop policy if exists email_delivery_events_no_public_write on public.email_delivery_events;
create policy email_delivery_events_no_public_write on public.email_delivery_events
  for insert to anon, authenticated with check (false);

revoke all on table public.email_delivery_events from anon, authenticated;

-- ── 3. Enqueue helper (deduped) ─────────────────────────────────────────────
create or replace function public.enqueue_email(
  p_template_key text,
  p_recipient_email text,
  p_recipient_user_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  clean_email text := lower(btrim(coalesce(p_recipient_email, '')));
begin
  if p_template_key is null
     or clean_email = ''
     or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or nullif(btrim(coalesce(p_dedupe_key, '')), '') is null then
    return null;
  end if;

  insert into public.email_outbox
    (template_key, recipient_email, recipient_user_id, payload, dedupe_key)
  values
    (p_template_key, clean_email, p_recipient_user_id, coalesce(p_payload, '{}'::jsonb), p_dedupe_key)
  on conflict (template_key, dedupe_key) do nothing
  returning id into inserted_id;

  return inserted_id;
end;
$$;

comment on function public.enqueue_email(text, text, uuid, jsonb, text) is
  'Deduplicated outbox writer used by email triggers and the server. Never callable from the browser.';

-- Only the service role (from the Next.js server) may call this directly.
revoke all on function public.enqueue_email(text, text, uuid, jsonb, text) from public, anon, authenticated;

-- ── 4. Recipient eligibility (mirrors the in-app rules) ─────────────────────
create or replace function public.email_staff_recipient_ok(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id
      and status = 'active'
      and not must_change_password
      and role <> 'client'::public.app_role
      and nullif(btrim(email), '') is not null
  );
$$;

create or replace function public.email_client_recipient_ok(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id
      and status = 'active'
      and not must_change_password
      and role = 'client'::public.app_role
      and nullif(btrim(email), '') is not null
  );
$$;

-- ── 5. Submission received (client) + new submission (staff) ────────────────
create or replace function public.enqueue_submission_emails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  form_rec public.form_templates;
  client_display text;
  staff_display text;
  rec record;
begin
  select * into form_rec from public.form_templates where id = new.form_id;

  client_display := coalesce(
    nullif(btrim(new.respondent_name), ''),
    nullif(btrim(new.company_name), ''),
    nullif(btrim(new.respondent_email), ''),
    'A client'
  );

  -- Staff emails never fall back to the respondent's email address:
  -- only the name / company travel over email.
  staff_display := coalesce(
    nullif(btrim(new.respondent_name), ''),
    nullif(btrim(new.company_name), ''),
    'A client'
  );

  -- Client: receipt with reference number + public tracking link.
  -- Deliberately no internal data: no reviewer info, no answers, no staff links.
  if nullif(btrim(coalesce(new.respondent_email, '')), '') is not null then
    perform public.enqueue_email(
      'submission-received',
      new.respondent_email,
      null,
      jsonb_build_object(
        'reference_number', new.reference_number,
        'form_name', coalesce(form_rec.title, 'Form'),
        'respondent_name', coalesce(nullif(btrim(new.respondent_name), ''), client_display),
        'submitted_at', new.submitted_at,
        'tracking_path', '/track/' || new.reference_number
      ),
      'submission.received:' || new.id::text
    );
  end if;

  -- Internal: staff with submission.view get the new-submission email.
  -- The respondent's email/phone are intentionally NOT included in email.
  for rec in
    select p.id, p.email
    from public.profiles p
    where public.email_staff_recipient_ok(p.id)
      and public.user_has_permission(p.id, 'submission.view')
  loop
    perform public.enqueue_email(
      'new-submission',
      rec.email,
      rec.id,
      jsonb_build_object(
        'reference_number', new.reference_number,
        'form_name', coalesce(form_rec.title, 'Form'),
        'client_name', staff_display,
        'company_name', new.company_name,
        'submission_id', new.id,
        'submitted_at', new.submitted_at,
        'inbox_path', '/submissions?submission=' || new.id::text
      ),
      'submission.created:' || new.id::text || ':' || rec.id::text
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists enqueue_submission_emails on public.form_submissions;
create trigger enqueue_submission_emails
after insert on public.form_submissions
for each row execute function public.enqueue_submission_emails();

-- ── 6. Important assignment: task assigned ──────────────────────────────────
create or replace function public.enqueue_task_assigned_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_rec public.projects;
  state_key text;
begin
  if new.assignee_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;
  if new.assignee_id is not distinct from auth.uid() then
    return new; -- assigning yourself needs no email
  end if;
  if not public.email_staff_recipient_ok(new.assignee_id) then
    return new;
  end if;

  select * into proj_rec from public.projects where id = new.project_id;

  -- A state snapshot in the key means the *same* assignment state never emails
  -- twice, while a real reassignment (changed title/status/priority/due date)
  -- produces a fresh key and a fresh email.
  state_key := md5(concat_ws('|', new.title, new.status, new.priority, coalesce(new.due_date::text, '')));

  perform public.enqueue_email(
    'task-assigned',
    (select email from public.profiles where id = new.assignee_id),
    new.assignee_id,
    jsonb_build_object(
      'task_id', new.id,
      'task_title', new.title,
      'project_id', new.project_id,
      'project_name', coalesce(proj_rec.name, 'a project'),
      'due_date', new.due_date,
      'priority', new.priority,
      'task_path', '/my-work?task=' || new.id::text
    ),
    'task.assigned:' || new.id::text || ':' || new.assignee_id::text || ':' || state_key
  );
  return new;
end;
$$;

drop trigger if exists enqueue_task_assigned_email on public.tasks;
create trigger enqueue_task_assigned_email
after insert or update of assignee_id on public.tasks
for each row execute function public.enqueue_task_assigned_email();

-- ── 7. Important assignment: project owner / manager change ─────────────────
create or replace function public.enqueue_project_lead_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
     and new.owner_id is not null
     and new.owner_id is distinct from auth.uid()
     and public.email_staff_recipient_ok(new.owner_id) then
    perform public.enqueue_email(
      'project-assigned',
      (select email from public.profiles where id = new.owner_id),
      new.owner_id,
      jsonb_build_object(
        'project_id', new.id,
        'project_name', new.name,
        'role', 'owner',
        'project_path', '/projects/' || new.id::text
      ),
      'project.assigned:' || new.id::text || ':' || new.owner_id::text || ':owner'
    );
  end if;

  if new.manager_id is distinct from old.manager_id
     and new.manager_id is not null
     and new.manager_id is distinct from new.owner_id
     and new.manager_id is distinct from auth.uid()
     and public.email_staff_recipient_ok(new.manager_id) then
    perform public.enqueue_email(
      'project-assigned',
      (select email from public.profiles where id = new.manager_id),
      new.manager_id,
      jsonb_build_object(
        'project_id', new.id,
        'project_name', new.name,
        'role', 'manager',
        'project_path', '/projects/' || new.id::text
      ),
      'project.assigned:' || new.id::text || ':' || new.manager_id::text || ':manager'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists enqueue_project_lead_email on public.projects;
create trigger enqueue_project_lead_email
after update of owner_id, manager_id on public.projects
for each row execute function public.enqueue_project_lead_email();

-- ── 8. Important assignment: team member added to a project ─────────────────
create or replace function public.enqueue_team_member_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_rec public.projects;
begin
  if new.user_id is distinct from auth.uid()
     and public.email_staff_recipient_ok(new.user_id) then
    select * into proj_rec from public.projects where id = new.project_id;
    perform public.enqueue_email(
      'project-assigned',
      (select email from public.profiles where id = new.user_id),
      new.user_id,
      jsonb_build_object(
        'project_id', new.project_id,
        'project_name', coalesce(proj_rec.name, 'a project'),
        'role', 'team member',
        'project_path', '/projects/' || new.project_id::text
      ),
      'team.member.assigned:' || new.project_id::text || ':' || new.user_id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists enqueue_team_member_email on public.project_members;
create trigger enqueue_team_member_email
after insert on public.project_members
for each row execute function public.enqueue_team_member_email();

-- ── 9. Important project update + client confirmation ───────────────────────
-- client_approvals is the only table client actions write (feedback, approved,
-- revision_requested). One trigger covers:
--   * project-update email → owner + manager (all three actions)
--   * revision-approval-update email → the acting client (approved / revision)
create or replace function public.enqueue_client_collaboration_emails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_rec public.projects;
  label text;
  rec record;
  actor_email text;
begin
  select * into proj_rec from public.projects where id = new.project_id;
  if proj_rec.id is null then
    return new;
  end if;

  label := case new.action
    when 'approved' then 'Client approval'
    when 'revision_requested' then 'Revision request'
    else 'Client feedback'
  end;

  -- Internal: owner + manager.
  for rec in
    select distinct p.id, p.email
    from unnest(array[proj_rec.owner_id, proj_rec.manager_id]) as u(id)
    join public.profiles p on p.id = u.id
    where u.id is not null
      and public.email_staff_recipient_ok(u.id)
  loop
    perform public.enqueue_email(
      'project-update',
      rec.email,
      rec.id,
      jsonb_build_object(
        'project_id', new.project_id,
        'project_name', proj_rec.name,
        'label', label,
        'summary', left(coalesce(new.message, ''), 280),
        'project_path', '/projects/' || new.project_id::text
      ),
      'client.collaboration:' || new.id::text || ':' || rec.id::text
    );
  end loop;

  -- Client confirmation receipt for approval / revision request.
  if new.action in ('approved', 'revision_requested') then
    select p.email into actor_email
    from public.profiles p
    where p.id = new.created_by
      and public.email_client_recipient_ok(p.id);
    if actor_email is not null then
      perform public.enqueue_email(
        'revision-approval-update',
        actor_email,
        new.created_by,
        jsonb_build_object(
          'project_id', new.project_id,
          'project_name', proj_rec.name,
          'action', new.action,
          'note', left(coalesce(new.message, ''), 280),
          'portal_path', '/portal/projects/' || new.project_id::text
        ),
        'client.confirmation:' || new.id::text
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enqueue_client_collaboration_emails on public.client_approvals;
create trigger enqueue_client_collaboration_emails
after insert on public.client_approvals
for each row execute function public.enqueue_client_collaboration_emails();

-- ── 10. Delivery ready (client) ─────────────────────────────────────────────
create or replace function public.enqueue_delivery_client_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_rec public.projects;
  rec record;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status <> 'delivered' then
    return new;
  end if;

  select * into proj_rec from public.projects where id = new.project_id;
  if proj_rec.id is null or proj_rec.client_id is null then
    return new;
  end if;

  for rec in
    select p.id, p.email
    from public.profiles p
    where p.client_id = proj_rec.client_id
      and public.email_client_recipient_ok(p.id)
  loop
    perform public.enqueue_email(
      'delivery-ready',
      rec.email,
      rec.id,
      jsonb_build_object(
        'project_id', proj_rec.id,
        'project_name', proj_rec.name,
        'version', new.version,
        'portal_path', '/portal/projects/' || proj_rec.id::text
      ),
      'delivery.ready:' || new.id::text || ':' || new.version::text || ':' || rec.id::text
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists enqueue_delivery_client_email on public.project_deliveries;
create trigger enqueue_delivery_client_email
after insert or update of status on public.project_deliveries
for each row execute function public.enqueue_delivery_client_email();

commit;
