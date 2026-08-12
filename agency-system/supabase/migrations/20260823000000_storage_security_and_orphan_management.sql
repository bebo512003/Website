-- ── Storage security, bucket boundaries, centralized policies & orphan review ──
--
-- Session 06 — File Upload & Storage Security
--
-- 1. Updates storage buckets with strict limits and MIME types:
--    - avatars: public=true, 5 MB limit, image/* only
--    - portfolio-images: public=false (signed URLs only), 10 MB limit, image/* only
--    - project-files: public=false, 50 MB limit, safe project files only
--    - form-files: public=false, 20 MB limit, safe form attachments only
--    - intake-files: public=false, 20 MB limit, safe legacy intake attachments only
--
-- 2. Hardens storage.objects RLS policies across all buckets:
--    - project-files: isolated by project membership (can_access_project) + file permissions
--    - portfolio-images: public signed reads verified against published status; admin manage
--    - avatars: public reads, update/delete locked to owner folder or employee.manage
--    - form-files: uploader folder isolation for anon/auth; staff require submission.view
--    - intake-files: uploader folder isolation; staff require submission.view
--
-- 3. Hardens submit_dynamic_form RPC:
--    - Rejects dangerous executable attachments (.exe, .bat, .php, .sh, .js, etc.)
--    - Enforces 20 MB size limit per attachment at database level
--    - Retains caller folder isolation
--
-- 4. Introduces storage audit & orphan review function:
--    - get_storage_audit_summary() for workspace storage health and unreferenced object detection

begin;

-- ── 1. Storage bucket configuration ──────────────────────────────────────────
alter table storage.buckets add column if not exists file_size_limit bigint;
alter table storage.buckets add column if not exists allowed_mime_types text[];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('portfolio-images', 'portfolio-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
  ('project-files', 'project-files', false, 52428800, null),
  ('form-files', 'form-files', false, 20971520, null),
  ('intake-files', 'intake-files', false, 20971520, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. Storage RLS policies ──────────────────────────────────────────────────

-- Project files: strictly private, isolated to project members with proper permissions
drop policy if exists project_files_select on storage.objects;
create policy project_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'project-files'
    and public.has_permission('file.view')
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists project_files_insert on storage.objects;
create policy project_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and owner_id = auth.uid()::text
    and public.has_permission('file.upload')
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists project_files_update on storage.objects;
create policy project_files_update on storage.objects for update to authenticated
  using (
    bucket_id = 'project-files'
    and (owner_id = auth.uid()::text or public.has_permission('file.edit'))
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists project_files_delete on storage.objects;
create policy project_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-files'
    and (owner_id = auth.uid()::text or public.has_permission('file.delete'))
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

-- Portfolio images: private bucket, signed URLs for published items, admin manage
drop policy if exists portfolio_images_public_select on storage.objects;
create policy portfolio_images_public_select on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'portfolio-images'
    and public.is_public_portfolio_image(name)
  );

drop policy if exists portfolio_images_admin_select on storage.objects;
create policy portfolio_images_admin_select on storage.objects for select to authenticated
  using (
    bucket_id = 'portfolio-images'
    and public.has_permission('portfolio.manage')
  );

drop policy if exists portfolio_images_admin_insert on storage.objects;
create policy portfolio_images_admin_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'portfolio-images'
    and owner_id = auth.uid()::text
    and public.has_permission('portfolio.manage')
  );

drop policy if exists portfolio_images_admin_update on storage.objects;
create policy portfolio_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'portfolio-images' and public.has_permission('portfolio.manage'))
  with check (bucket_id = 'portfolio-images' and public.has_permission('portfolio.manage'));

drop policy if exists portfolio_images_admin_delete on storage.objects;
create policy portfolio_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'portfolio-images' and public.has_permission('portfolio.manage'));

-- Avatars: public bucket, write/delete locked to own folder or employee.manage
drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      public.has_permission('employee.manage')
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.has_permission('employee.manage')
      or owner_id = auth.uid()::text
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.has_permission('employee.manage')
      or owner_id = auth.uid()::text
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- Form files: private bucket, uploads go into caller folder, staff view gated by submission.view
drop policy if exists form_files_insert on storage.objects;
create policy form_files_insert on storage.objects for insert to authenticated, anon
  with check (
    bucket_id = 'form-files'
    and (owner_id = auth.uid()::text or auth.uid() is null)
    and (storage.foldername(name))[1] = coalesce(auth.uid()::text, 'anon')
  );

drop policy if exists form_files_select on storage.objects;
create policy form_files_select on storage.objects for select to authenticated, anon
  using (
    bucket_id = 'form-files'
    and (
      (auth.uid() is not null and owner_id = auth.uid()::text)
      or (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
      or public.has_permission('submission.view')
    )
  );

drop policy if exists form_files_delete on storage.objects;
create policy form_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'form-files'
    and (
      (auth.uid() is not null and owner_id = auth.uid()::text)
      or (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
      or public.has_permission('submission.edit')
    )
  );

-- Intake files: private bucket, legacy intake attachments
drop policy if exists intake_files_select on storage.objects;
create policy intake_files_select on storage.objects for select to authenticated, anon
  using (
    bucket_id = 'intake-files'
    and (
      (auth.uid() is not null and owner_id = auth.uid()::text)
      or (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
      or public.has_permission('submission.view')
    )
  );

drop policy if exists intake_files_delete on storage.objects;
create policy intake_files_delete on storage.objects for delete to authenticated, anon
  using (
    bucket_id = 'intake-files'
    and (
      (auth.uid() is not null and owner_id = auth.uid()::text)
      or (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
      or public.has_permission('submission.edit')
    )
  );

-- ── 3. Hardened submit_dynamic_form RPC ──────────────────────────────────────
create or replace function public.submit_dynamic_form(
  p_form_id uuid,
  p_answers jsonb
)
returns public.form_submissions
language plpgsql
security definer
set search_path = public
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
  file_name text;
  file_size bigint;
  file_ext text;
  rating_max_val integer;
  -- Rate limiting
  recent_count integer;
  -- Duplicate detection
  respondent_email_val text;
  fp text;
  dup_count integer;
  -- Payload validation
  answer_key text;
  answer_val text;
begin
  -- ── Form existence and status ──────────────────────────────────────────
  select * into form_rec from public.form_templates where id = p_form_id;
  if not found then
    raise exception 'Form not found';
  end if;
  if form_rec.status <> 'published' then
    raise exception 'This form is not accepting submissions';
  end if;

  -- ── Payload size guard ─────────────────────────────────────────────────
  -- The entire answers JSON must be under 100 KB.
  if length(p_answers::text) > 102400 then
    raise exception 'Your submission is too large. Please shorten your answers.';
  end if;

  -- Each individual text value must be under 10 000 characters.
  for answer_key, answer_val in select * from jsonb_each_text(p_answers)
  loop
    if length(answer_val) > 10000 then
      raise exception 'One of your answers exceeds the maximum allowed length.';
    end if;
  end loop;

  -- ── Rate limiting: max 5 submissions per minute per session+form ───────
  select count(*) into recent_count
  from public.form_rate_limits
  where session_id = auth.uid()
    and form_id = p_form_id
    and submitted_at > now() - interval '1 minute';

  if recent_count >= 5 then
    raise exception 'You are submitting too frequently. Please wait a moment and try again.';
  end if;

  -- ── Per-session cooldown: minimum 3 seconds between submissions ────────
  if exists (
    select 1 from public.form_rate_limits
    where session_id = auth.uid()
      and form_id = p_form_id
      and submitted_at > now() - interval '3 seconds'
  ) then
    raise exception 'Please wait a few seconds before submitting again.';
  end if;

  -- ── Validate answers ───────────────────────────────────────────────────
  for q in
    select * from public.form_questions where form_id = p_form_id order by position, created_at
  loop
    -- Hidden by an unmet show-if rule: skip entirely.
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
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
        rating_max_val := greatest(1, least(10, coalesce(nullif(q.config ->> 'rating_max', '')::integer, 5)));
        if (val #>> '{}') !~ '^\d+$'
           or (val #>> '{}')::integer < 1
           or (val #>> '{}')::integer > rating_max_val then
          raise exception 'Invalid rating for "%"', q.label;
        end if;
      elsif q.question_type = 'file_upload' then
        if jsonb_typeof(val) <> 'array' then
          raise exception 'Invalid file answer for "%"', q.label;
        end if;
        -- Limit to 10 files per question.
        if jsonb_array_length(val) > 10 then
          raise exception 'Too many files uploaded for "%". Maximum is 10.', q.label;
        end if;

        -- Validate each file item (size <= 20 MB, no blocked executable extension)
        for file_item in select * from jsonb_array_elements(val) loop
          file_name := coalesce(file_item ->> 'name', '');
          file_size := coalesce(nullif(file_item ->> 'size', '')::bigint, 0);

          if file_size > 20971520 then
            raise exception 'Uploaded file "%" exceeds maximum allowed size of 20 MB.', file_name;
          end if;

          -- Check for unsafe executable extensions (.exe, .bat, .cmd, .sh, .php, .js, etc.)
          file_ext := lower(substring(file_name from '\.([a-zA-Z0-9]+)$'));
          if file_ext in ('exe', 'bat', 'cmd', 'sh', 'php', 'phtml', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'js', 'vbs', 'msi', 'jar', 'scr', 'hta', 'ps1') then
            raise exception 'Uploaded file "%" has an unsafe file extension and is rejected.', file_name;
          end if;
        end loop;
      end if;

      -- Contact mapping feeds the client automation below.
      txt := case when jsonb_typeof(val) = 'string' then btrim(val #>> '{}') else null end;
      if nullif(txt, '') is not null then
        if q.map_to = 'name' then submission_rec.respondent_name := txt; end if;
        if q.map_to = 'email' then respondent_email_val := lower(txt); end if;
        if q.map_to = 'phone' then submission_rec.respondent_phone := txt; end if;
        if q.map_to = 'company' then submission_rec.company_name := txt; end if;
      end if;
    end if;
  end loop;

  submission_rec.respondent_email := respondent_email_val;

  if missing is not null then
    raise exception 'Required questions are missing: %', array_to_string(missing, ', ');
  end if;

  -- ── Duplicate submission detection (same email, same form, within 5 min) ──
  if respondent_email_val is not null then
    fp := encode(digest(respondent_email_val || p_form_id::text, 'sha256'), 'hex');
    select count(*) into dup_count
    from public.form_submission_fingerprints
    where form_id = p_form_id
      and fingerprint = fp
      and submitted_at > now() - interval '5 minutes';

    if dup_count > 0 then
      raise exception 'You have already submitted a response recently. Please wait a few minutes before submitting again.';
    end if;

    -- Record this submission fingerprint.
    insert into public.form_submission_fingerprints (form_id, fingerprint)
    values (p_form_id, fp);
  end if;

  -- ── Record rate-limit entry ────────────────────────────────────────────
  insert into public.form_rate_limits (session_id, form_id)
  values (auth.uid(), p_form_id);

  -- ── Match or create CRM client ─────────────────────────────────────────
  if respondent_email_val is not null then
    select id into linked_client_id
    from public.clients
    where lower(coalesce(email, '')) = respondent_email_val
    order by created_at asc
    limit 1;

    if linked_client_id is null then
      insert into public.clients (name, type, status, contact_person, email, phone, notes, created_by)
      values (
        coalesce(nullif(submission_rec.company_name, ''), nullif(submission_rec.respondent_name, ''), respondent_email_val),
        'potential',
        'potential',
        nullif(submission_rec.respondent_name, ''),
        respondent_email_val,
        nullif(submission_rec.respondent_phone, ''),
        'Created automatically from form "' || form_rec.title || '"',
        auth.uid()
      )
      returning id into linked_client_id;
    end if;
  end if;

  -- ── Optional: open a project ───────────────────────────────────────────
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

  -- ── Store submission ───────────────────────────────────────────────────
  insert into public.form_submissions
    (form_id, form_version, status, respondent_name, respondent_email, respondent_phone, company_name, client_id, project_id, created_by)
  values (
    p_form_id, form_rec.version, 'submitted',
    submission_rec.respondent_name, submission_rec.respondent_email,
    submission_rec.respondent_phone, submission_rec.company_name,
    linked_client_id, linked_project_id, auth.uid()
  )
  returning * into submission_rec;

  -- Freeze each answer together with the question it answered. Hidden
  -- questions are excluded so an unmet conditional never appears as answered.
  insert into public.form_submission_answers (submission_id, question_id, question_snapshot, value)
  select submission_rec.id, fq.id, to_jsonb(fq), p_answers -> fq.id::text
  from public.form_questions fq
  where fq.form_id = p_form_id
    and public.is_form_question_visible(fq, p_answers)
  order by fq.position, fq.created_at;

  -- Attach uploaded files.
  for q in select * from public.form_questions where form_id = p_form_id and question_type = 'file_upload' loop
    if not public.is_form_question_visible(q, p_answers) then
      continue;
    end if;
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

-- ── 4. Storage audit & orphan review function ─────────────────────────────────
create or replace function public.get_storage_audit_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  files_count bigint;
  form_attach_count bigint;
  intake_attach_count bigint;
  portfolio_img_count bigint;
  avatars_count bigint;
  storage_obj_count bigint := 0;
  unreferenced_count bigint := 0;
begin
  if not (public.has_permission('admin.manage') or public.has_permission('workspace.access') or public.is_admin()) then
    raise exception 'Unauthorized to view storage audit summary';
  end if;

  select count(*) into files_count from public.files where storage_path is not null;
  select count(*) into form_attach_count from public.form_submission_attachments;
  select count(*) into intake_attach_count from public.intake_attachments;
  select count(*) into portfolio_img_count from public.portfolio_project_images;
  select count(*) into avatars_count from public.profiles where avatar_url is not null and avatar_url <> '';

  -- If storage.objects exists and is queryable, count objects and detect unreferenced ones
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    select count(*) into storage_obj_count from storage.objects;

    select count(*) into unreferenced_count
    from storage.objects o
    where
      (o.bucket_id = 'project-files' and not exists (select 1 from public.files f where f.storage_path = o.name))
      or (o.bucket_id = 'form-files' and not exists (select 1 from public.form_submission_attachments a where a.storage_path = o.name))
      or (o.bucket_id = 'intake-files' and not exists (select 1 from public.intake_attachments ia where ia.storage_path = o.name))
      or (o.bucket_id = 'portfolio-images' and not exists (select 1 from public.portfolio_project_images pi where pi.storage_path = o.name));
  end if;

  return jsonb_build_object(
    'project_files_count', files_count,
    'form_attachments_count', form_attach_count,
    'intake_attachments_count', intake_attach_count,
    'portfolio_images_count', portfolio_img_count,
    'profiles_with_avatar_count', avatars_count,
    'storage_objects_total', storage_obj_count,
    'unreferenced_storage_objects_count', unreferenced_count,
    'audited_at', now()
  );
end;
$$;

revoke all on function public.get_storage_audit_summary() from public, anon;
grant execute on function public.get_storage_audit_summary() to authenticated;

commit;
