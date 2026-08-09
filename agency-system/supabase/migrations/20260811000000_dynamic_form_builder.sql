-- Dynamic form builder (Phase D of docs/architecture-review-and-plan.md)
--   * Admins design forms (templates + questions) from the website — no code changes.
--   * Published forms render publicly at /f/<slug> and are answered by anyone.
--   * Answers are stored with a full per-question snapshot, so later edits to a
--     question never rewrite history.
--   * Authorization follows the metadata model: a new `form.manage` permission
--     (granted to Admin by default, grantable to any role from the admin UI).
begin;

-- ── 1. Permission key (extensible catalog — grant admin like every other key) ─
insert into public.permissions (key, name, category, description) values
  ('form.manage', 'Manage forms', 'forms', 'Create, edit, publish, duplicate, archive and delete dynamic forms and their questions.')
on conflict (key) do update set
  name = excluded.name, category = excluded.category, description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r, public.permissions p
where r.key = 'admin' and p.key = 'form.manage'
on conflict do nothing;

-- ── 2. Tables ────────────────────────────────────────────────────────────────
create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  -- draft: being built · published: live at /f/<slug> · disabled: paused · archived: soft-deleted
  status text not null default 'draft' check (status in ('draft', 'published', 'disabled', 'archived')),
  version integer not null default 1,
  -- Free-form per-form behaviour flags (e.g. {"create_project_on_submit": true}).
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.form_templates is 'Admin-designed dynamic forms. The frontend renders questions from form_questions; nothing is hardcoded per form.';

-- To add a new question type later: extend this CHECK list, register the type in
-- lib/forms/question-types.ts, and add a render/validation branch — that is all.
create table if not exists public.form_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.form_templates(id) on delete cascade,
  question_type text not null check (question_type in (
    'short_text', 'long_text', 'single_choice', 'multiple_choice', 'yes_no',
    'dropdown', 'number', 'date', 'file_upload', 'rating'
  )),
  label text not null,
  help_text text,
  placeholder text,
  required boolean not null default false,
  -- Choice options: jsonb array of strings, e.g. ["Option A", "Option B"].
  options jsonb not null default '[]'::jsonb,
  -- Type-specific knobs, e.g. {"rating_max": 10}. Validated in submit_dynamic_form.
  config jsonb not null default '{}'::jsonb,
  -- Optional mapping of an answer onto the respondent/contact columns so the
  -- automation can match or create the CRM client record.
  map_to text check (map_to in ('name', 'email', 'phone', 'company')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_form_questions_form on public.form_questions(form_id, position);
create index if not exists idx_form_templates_status on public.form_templates(status, updated_at desc);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.form_templates(id) on delete cascade,
  form_version integer not null default 1,
  status text not null default 'submitted' check (status in ('submitted', 'archived')),
  respondent_name text,
  respondent_email text,
  respondent_phone text,
  company_name text,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_form_submissions_form on public.form_submissions(form_id, submitted_at desc);
create index if not exists idx_form_submissions_email on public.form_submissions(respondent_email);

create table if not exists public.form_submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  question_id uuid references public.form_questions(id) on delete set null,
  -- Full copy of the question (label/type/options/required/position/version) as it
  -- was when answered — editing or deleting the question later keeps history intact.
  question_snapshot jsonb not null,
  value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_form_answers_submission on public.form_submission_answers(submission_id);

create table if not exists public.form_submission_attachments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  question_id uuid references public.form_questions(id) on delete set null,
  name text not null,
  size bigint not null default 0,
  mime_type text,
  storage_path text not null unique,
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_form_attachments_submission on public.form_submission_attachments(submission_id);

drop trigger if exists form_templates_updated_at on public.form_templates;
create trigger form_templates_updated_at before update on public.form_templates
for each row execute function public.set_updated_at();
drop trigger if exists form_questions_updated_at on public.form_questions;
create trigger form_questions_updated_at before update on public.form_questions
for each row execute function public.set_updated_at();
drop trigger if exists form_submissions_updated_at on public.form_submissions;
create trigger form_submissions_updated_at before update on public.form_submissions
for each row execute function public.set_updated_at();

-- Any structural question change bumps the parent form version, so each
-- submission's form_version genuinely identifies the question set it answered.
create or replace function public.bump_form_template_version()
returns trigger
language plpgsql
as $$
begin
  update public.form_templates
  set version = version + 1
  where id = coalesce(new.form_id, old.form_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists form_questions_bump_version on public.form_questions;
create trigger form_questions_bump_version after insert or update or delete on public.form_questions
for each row execute function public.bump_form_template_version();

-- A form with collected answers cannot be hard-deleted; archive it instead.
create or replace function public.guard_form_template_delete()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.form_submissions where form_id = old.id) then
    raise exception 'This form has submissions and cannot be deleted. Archive it instead.';
  end if;
  return old;
end;
$$;

drop trigger if exists form_templates_guard_delete on public.form_templates;
create trigger form_templates_guard_delete before delete on public.form_templates
for each row execute function public.guard_form_template_delete();

-- ── 3. Row level security ────────────────────────────────────────────────────
alter table public.form_templates enable row level security;
alter table public.form_questions enable row level security;
alter table public.form_submissions enable row level security;
alter table public.form_submission_answers enable row level security;
alter table public.form_submission_attachments enable row level security;

-- Templates: published forms are publicly readable (the renderer needs them);
-- every status is readable/writable by permission holders.
drop policy if exists form_templates_select_public on public.form_templates;
create policy form_templates_select_public on public.form_templates for select to anon, authenticated
using (status = 'published');
drop policy if exists form_templates_select_manage on public.form_templates;
create policy form_templates_select_manage on public.form_templates for select to authenticated
using (public.has_permission('form.manage'));
drop policy if exists form_templates_insert_manage on public.form_templates;
create policy form_templates_insert_manage on public.form_templates for insert to authenticated
with check (public.has_permission('form.manage'));
drop policy if exists form_templates_update_manage on public.form_templates;
create policy form_templates_update_manage on public.form_templates for update to authenticated
using (public.has_permission('form.manage')) with check (public.has_permission('form.manage'));
drop policy if exists form_templates_delete_manage on public.form_templates;
create policy form_templates_delete_manage on public.form_templates for delete to authenticated
using (public.has_permission('form.manage'));

-- Questions follow their parent form's visibility.
drop policy if exists form_questions_select_public on public.form_questions;
create policy form_questions_select_public on public.form_questions for select to anon, authenticated
using (exists (select 1 from public.form_templates t where t.id = form_questions.form_id and t.status = 'published'));
drop policy if exists form_questions_select_manage on public.form_questions;
create policy form_questions_select_manage on public.form_questions for select to authenticated
using (public.has_permission('form.manage'));
drop policy if exists form_questions_insert_manage on public.form_questions;
create policy form_questions_insert_manage on public.form_questions for insert to authenticated
with check (public.has_permission('form.manage'));
drop policy if exists form_questions_update_manage on public.form_questions;
create policy form_questions_update_manage on public.form_questions for update to authenticated
using (public.has_permission('form.manage')) with check (public.has_permission('form.manage'));
drop policy if exists form_questions_delete_manage on public.form_questions;
create policy form_questions_delete_manage on public.form_questions for delete to authenticated
using (public.has_permission('form.manage'));

-- Submissions: inserts happen only inside submit_dynamic_form (security definer).
-- Staff with submission.view read all; the original submitter can re-read their own.
drop policy if exists form_submissions_select_staff on public.form_submissions;
create policy form_submissions_select_staff on public.form_submissions for select to authenticated
using (public.has_permission('submission.view'));
drop policy if exists form_submissions_select_owner on public.form_submissions;
create policy form_submissions_select_owner on public.form_submissions for select to anon, authenticated
using (created_by is not null and created_by = auth.uid());
drop policy if exists form_submissions_update_staff on public.form_submissions;
create policy form_submissions_update_staff on public.form_submissions for update to authenticated
using (public.has_permission('submission.edit')) with check (public.has_permission('submission.edit'));
drop policy if exists form_submissions_delete_staff on public.form_submissions;
create policy form_submissions_delete_staff on public.form_submissions for delete to authenticated
using (public.has_permission('submission.edit'));

-- Answers & attachments are readable exactly when their parent submission is.
drop policy if exists form_answers_select on public.form_submission_answers;
create policy form_answers_select on public.form_submission_answers for select to anon, authenticated
using (exists (
  select 1 from public.form_submissions s
  where s.id = submission_id
    and (public.has_permission('submission.view') or (s.created_by is not null and s.created_by = auth.uid()))
));
drop policy if exists form_attachments_select on public.form_submission_attachments;
create policy form_attachments_select on public.form_submission_attachments for select to anon, authenticated
using (exists (
  select 1 from public.form_submissions s
  where s.id = submission_id
    and (public.has_permission('submission.view') or (s.created_by is not null and s.created_by = auth.uid()))
));

-- ── 4. Admin RPCs (permission-gated, security definer like the rest) ─────────
-- Duplicate a form together with its questions. The copy starts as a draft.
create or replace function public.duplicate_form_template(p_form_id uuid)
returns public.form_templates
language plpgsql security definer set search_path = public
as $$
declare
  source public.form_templates;
  new_form public.form_templates;
begin
  if not public.has_permission('form.manage') then
    raise exception 'Not authorized to manage forms';
  end if;
  select * into source from public.form_templates where id = p_form_id;
  if not found then raise exception 'Form not found'; end if;

  insert into public.form_templates (slug, title, description, status, settings, created_by)
  values (
    source.slug || '-copy-' || left(replace(gen_random_uuid()::text, '-', ''), 8),
    source.title || ' (Copy)',
    source.description,
    'draft',
    source.settings,
    auth.uid()
  )
  returning * into new_form;

  insert into public.form_questions
    (form_id, question_type, label, help_text, placeholder, required, options, config, map_to, position)
  select new_form.id, question_type, label, help_text, placeholder, required, options, config, map_to, position
  from public.form_questions
  where form_id = source.id
  order by position;

  return new_form;
end;
$$;
revoke all on function public.duplicate_form_template(uuid) from public, anon;
grant execute on function public.duplicate_form_template(uuid) to authenticated;

-- Atomically persist the builder's drag order.
create or replace function public.reorder_form_questions(p_form_id uuid, p_question_ids uuid[])
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  expected integer;
  idx integer;
begin
  if not public.has_permission('form.manage') then
    raise exception 'Not authorized to manage forms';
  end if;
  select count(*) into expected from public.form_questions where form_id = p_form_id;
  if expected <> coalesce(array_length(p_question_ids, 1), 0)
     or exists (select 1 from unnest(p_question_ids) qid where not exists (
       select 1 from public.form_questions q where q.id = qid and q.form_id = p_form_id)) then
    raise exception 'Question list does not match this form';
  end if;
  for idx in 1..coalesce(array_length(p_question_ids, 1), 0) loop
    update public.form_questions set position = idx where id = p_question_ids[idx];
  end loop;
  return expected;
end;
$$;
revoke all on function public.reorder_form_questions(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_form_questions(uuid, uuid[]) to authenticated;

-- ── 5. Public submit RPC ─────────────────────────────────────────────────────
-- Validates the answers against the live question set, snapshots each question,
-- matches or creates the CRM client record, and (optionally) opens a project.
-- p_answers shape: { "<question_id>": value } where value is a JSON string for
-- text/date/number/choice/rating/yes_no, a JSON array of strings for
-- multiple_choice, or a JSON array of {storage_path,name,size,mime_type} for
-- file_upload questions.
create or replace function public.submit_dynamic_form(p_form_id uuid, p_answers jsonb)
returns public.form_submissions
language plpgsql security definer set search_path = public
as $$
declare
  form_rec public.form_templates;
  q public.form_questions;
  val jsonb;
  txt text;
  is_empty boolean;
  missing text[];
  submission_rec public.form_submissions;
  linked_client_id uuid;
  linked_project_id uuid;
  file_item jsonb;
  file_path text;
  rating_max integer;
begin
  select * into form_rec from public.form_templates where id = p_form_id;
  if not found then raise exception 'Form not found'; end if;
  if form_rec.status <> 'published' then
    raise exception 'This form is not accepting submissions';
  end if;

  for q in
    select * from public.form_questions where form_id = p_form_id order by position, created_at
  loop
    val := p_answers -> q.id::text;
    is_empty := val is null
      or val = 'null'::jsonb
      or (jsonb_typeof(val) = 'string' and btrim(val #>> '{}') = '')
      or (jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 0);

    if q.required and is_empty then
      missing := coalesce(missing, '{}') || q.label;
      continue;
    end if;

    if not is_empty then
      -- Server-side validation guards against tampered clients.
      if q.question_type in ('single_choice', 'dropdown') then
        if jsonb_typeof(val) <> 'string'
           or not exists (select 1 from jsonb_array_elements_text(q.options) o where o = val #>> '{}') then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'multiple_choice' then
        if jsonb_typeof(val) <> 'array'
           or exists (select 1 from jsonb_array_elements_text(val) v where not exists (
                select 1 from jsonb_array_elements_text(q.options) o where o = v)) then
          raise exception 'Invalid option for "%"', q.label;
        end if;
      elsif q.question_type = 'yes_no' then
        if jsonb_typeof(val) <> 'string' or (val #>> '{}') not in ('yes', 'no') then
          raise exception 'Invalid answer for "%"', q.label;
        end if;
      elsif q.question_type = 'number' then
        if jsonb_typeof(val) <> 'number' and (jsonb_typeof(val) <> 'string' or (val #>> '{}') !~ '^-?\d+(\.\d+)?$') then
          raise exception 'Invalid number for "%"', q.label;
        end if;
      elsif q.question_type = 'rating' then
        rating_max := greatest(1, least(10, coalesce(nullif(q.config ->> 'rating_max', '')::integer, 5)));
        if (val #>> '{}') !~ '^\d+$'
           or (val #>> '{}')::integer < 1
           or (val #>> '{}')::integer > rating_max then
          raise exception 'Invalid rating for "%"', q.label;
        end if;
      elsif q.question_type = 'file_upload' then
        if jsonb_typeof(val) <> 'array' then
          raise exception 'Invalid file answer for "%"', q.label;
        end if;
      end if;

      -- Contact mapping feeds the client automation below.
      txt := case when jsonb_typeof(val) = 'string' then btrim(val #>> '{}') else null end;
      if nullif(txt, '') is not null then
        if q.map_to = 'name' then submission_rec.respondent_name := txt; end if;
        if q.map_to = 'email' then submission_rec.respondent_email := lower(txt); end if;
        if q.map_to = 'phone' then submission_rec.respondent_phone := txt; end if;
        if q.map_to = 'company' then submission_rec.company_name := txt; end if;
      end if;
    end if;
  end loop;

  if missing is not null then
    raise exception 'Required questions are missing: %', array_to_string(missing, ', ');
  end if;

  -- Match an existing CRM client by e-mail, otherwise create a potential one
  -- (same automation the legacy intake uses).
  if submission_rec.respondent_email is not null then
    select id into linked_client_id
    from public.clients
    where lower(coalesce(email, '')) = submission_rec.respondent_email
    order by created_at asc
    limit 1;

    if linked_client_id is null then
      insert into public.clients (name, type, status, contact_person, email, phone, notes, created_by)
      values (
        coalesce(nullif(submission_rec.company_name, ''), nullif(submission_rec.respondent_name, ''), submission_rec.respondent_email),
        'potential',
        'potential',
        nullif(submission_rec.respondent_name, ''),
        submission_rec.respondent_email,
        nullif(submission_rec.respondent_phone, ''),
        'Created automatically from form "' || form_rec.title || '"',
        auth.uid()
      )
      returning id into linked_client_id;
    end if;
  end if;

  -- Optional per-form automation: open a project for the new request.
  if coalesce(form_rec.settings ->> 'create_project_on_submit', 'false') = 'true' and linked_client_id is not null then
    insert into public.projects (name, description, client_id, type, status, phase, phase_name, progress, created_by)
    values (
      coalesce(nullif(submission_rec.company_name, '') || ' — ', '') || form_rec.title,
      'Created automatically from a submission to form "' || form_rec.title || '"',
      linked_client_id,
      form_rec.title,
      'active', 1, 'Discovery', 0, auth.uid()
    )
    returning id into linked_project_id;
  end if;

  insert into public.form_submissions
    (form_id, form_version, status, respondent_name, respondent_email, respondent_phone, company_name, client_id, project_id, created_by)
  values (
    p_form_id, form_rec.version, 'submitted',
    submission_rec.respondent_name, submission_rec.respondent_email,
    submission_rec.respondent_phone, submission_rec.company_name,
    linked_client_id, linked_project_id, auth.uid()
  )
  returning * into submission_rec;

  -- Freeze each answer together with the question it answered.
  insert into public.form_submission_answers (submission_id, question_id, question_snapshot, value)
  select submission_rec.id, fq.id, to_jsonb(fq), p_answers -> fq.id::text
  from public.form_questions fq
  where fq.form_id = p_form_id
  order by fq.position, fq.created_at;

  -- Attach uploaded files. A path is only accepted when it lives inside the
  -- caller's own storage folder (or the caller is staff), so submissions can
  -- never point at someone else's files.
  for q in select * from public.form_questions where form_id = p_form_id and question_type = 'file_upload' loop
    val := p_answers -> q.id::text;
    if jsonb_typeof(val) = 'array' then
      for file_item in select * from jsonb_array_elements(val) loop
        file_path := file_item ->> 'storage_path';
        if file_path is not null and (
          (auth.uid() is not null and split_part(file_path, '/', 1) = auth.uid()::text)
          or public.has_permission('submission.edit')
        ) then
          insert into public.form_submission_attachments
            (submission_id, question_id, name, size, mime_type, storage_path, uploaded_by)
          values (
            submission_rec.id, q.id,
            coalesce(nullif(file_item ->> 'name', ''), 'file'),
            coalesce(nullif(file_item ->> 'size', '')::bigint, 0),
            nullif(file_item ->> 'mime_type', ''),
            file_path,
            auth.uid()
          )
          on conflict (storage_path) do nothing;
        end if;
      end loop;
    end if;
  end loop;

  return submission_rec;
end;
$$;
revoke all on function public.submit_dynamic_form(uuid, jsonb) from public, anon;
grant execute on function public.submit_dynamic_form(uuid, jsonb) to authenticated, anon;

-- ── 6. Storage: private bucket for form uploads ──────────────────────────────
insert into storage.buckets (id, name, public) values ('form-files', 'form-files', false)
on conflict (id) do update set public = false;

drop policy if exists form_files_insert on storage.objects;
create policy form_files_insert on storage.objects for insert to authenticated, anon
with check (
  bucket_id = 'form-files'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists form_files_select on storage.objects;
create policy form_files_select on storage.objects for select to authenticated, anon
using (
  bucket_id = 'form-files'
  and (owner_id = auth.uid()::text or public.has_permission('submission.view'))
);
drop policy if exists form_files_delete on storage.objects;
create policy form_files_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'form-files'
  and (owner_id = auth.uid()::text or public.has_permission('submission.edit'))
);

commit;
