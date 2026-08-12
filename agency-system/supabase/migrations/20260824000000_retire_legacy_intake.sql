-- Retire the legacy /intake system.
--
-- Dynamic Forms (`form_templates` / `form_submissions` / `submit_dynamic_form`)
-- is the only live request path. This migration:
--   * removes the write path (RPC, insert/update policies, intake notification trigger)
--   * retargets leftover notifications that still pointed at /intake
--   * lets legacy client accounts read Dynamic Form submissions linked to their CRM record
--
-- Historical `intake_*` tables and the `intake-files` bucket are NOT dropped.
-- Production may still hold older rows/files. They stay readable for staff
-- (`submission.view`) and linked client accounts, and leftover files can still
-- be cleaned up (`submission.edit`). New writes are impossible.

begin;

-- ── 1. Kill the live write path ──────────────────────────────────────────────
drop function if exists public.submit_intake_form(uuid);

drop trigger if exists notify_intake_submission on public.intake_forms;
drop function if exists public.notify_intake_submission();

drop policy if exists intake_forms_insert on public.intake_forms;
drop policy if exists intake_forms_update on public.intake_forms;
drop policy if exists intake_forms_update_staff on public.intake_forms;
drop policy if exists intake_attachments_insert on public.intake_attachments;
drop policy if exists intake_projects_insert on public.intake_projects;
drop policy if exists intake_files_insert on storage.objects;

-- Select policies stay so historical rows remain readable.
-- Delete policies stay so authorized staff can clean leftover files/rows.

comment on table public.intake_forms is
  'ARCHIVED. Legacy /intake submissions. Read-only. New requests go through form_submissions / submit_dynamic_form.';
comment on table public.intake_projects is
  'ARCHIVED. Legacy intake-to-project links. Read-only.';
comment on table public.intake_attachments is
  'ARCHIVED. Legacy intake file metadata. Read-only. New uploads use form_submission_attachments / form-files.';

-- ── 2. Retarget historical notifications that linked to the dead /intake UI ──
update public.notifications
set action_url = '/submissions'
where action_url is not null
  and action_url like '/intake%';

-- ── 3. Client portal now reads Dynamic Form submissions ──────────────────────
-- Legacy client-role accounts used to see intake_forms linked to their CRM
-- record. Mirror that on form_submissions so the portal does not depend on
-- the retired tables.
drop policy if exists form_submissions_select_client on public.form_submissions;
create policy form_submissions_select_client on public.form_submissions for select to authenticated
  using (client_id is not null and client_id = public.current_user_client_id());

drop policy if exists form_answers_select_client on public.form_submission_answers;
create policy form_answers_select_client on public.form_submission_answers for select to authenticated
  using (exists (
    select 1 from public.form_submissions s
    where s.id = submission_id
      and s.client_id is not null
      and s.client_id = public.current_user_client_id()
  ));

drop policy if exists form_attachments_select_client on public.form_submission_attachments;
create policy form_attachments_select_client on public.form_submission_attachments for select to authenticated
  using (exists (
    select 1 from public.form_submissions s
    where s.id = submission_id
      and s.client_id is not null
      and s.client_id = public.current_user_client_id()
  ));

update public.permissions
set description = 'View Dynamic Form submission records.'
where key = 'submission.view';

-- So the portal can join form_templates(title, slug) even after a form is
-- disabled or archived (public select only covers published templates).
drop policy if exists form_templates_select_client_linked on public.form_templates;
create policy form_templates_select_client_linked on public.form_templates for select to authenticated
  using (exists (
    select 1 from public.form_submissions s
    where s.form_id = form_templates.id
      and s.client_id is not null
      and s.client_id = public.current_user_client_id()
  ));

commit;
