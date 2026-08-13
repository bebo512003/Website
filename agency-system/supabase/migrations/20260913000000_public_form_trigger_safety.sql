-- Public form submit: never let notification/email side-effects roll back
-- the respondent's save.
--
-- AFTER INSERT triggers on form_submissions (inbox notification + email
-- outbox) used to abort the whole insert when a helper was missing, a
-- check constraint was stale, or pgcrypto was off search_path. The
-- public form then showed "Your answers could not be saved."
--
-- The Next.js persist path writes the row directly; these triggers still
-- fire. Swallowing their errors keeps the submission.

begin;

create or replace function public.notify_form_submission()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  form_rec public.form_templates;
  client_display_name text;
  notif_title text;
  notif_message text;
  action text;
begin
  begin
    select * into form_rec from public.form_templates where id = new.form_id;

    client_display_name := coalesce(
      nullif(trim(new.respondent_name), ''),
      nullif(trim(new.company_name), ''),
      nullif(trim(new.respondent_email), ''),
      'Anonymous client'
    );

    notif_title := 'New ' || coalesce(form_rec.title, 'Form') || ' submission';
    notif_message := 'New submission #' || substring(new.id::text, 1, 8)
      || ' received from ' || client_display_name
      || ' for ' || coalesce(form_rec.title, 'Form') || '.';
    action := '/admin/forms/' || new.form_id::text || '?tab=submissions&submission=' || new.id::text;

    perform public.notify_staff_with_permission(
      'submission.view',
      'submission.created',
      'form_submission',
      notif_title,
      notif_message,
      action,
      'submission.created:' || new.id::text,
      (select id from public.profiles where id = auth.uid()),
      new.project_id,
      new.id,
      null,
      jsonb_build_object(
        'submission_id', new.id,
        'form_id', new.form_id,
        'form_name', coalesce(form_rec.title, 'Form'),
        'client_name', client_display_name,
        'respondent_name', new.respondent_name,
        'respondent_email', new.respondent_email,
        'respondent_phone', new.respondent_phone,
        'company_name', new.company_name,
        'project_id', new.project_id,
        'submitted_at', new.submitted_at,
        'reference_number', new.reference_number
      )
    );
  exception
    when undefined_column then
      begin
        insert into public.notifications (
          recipient_id, actor_id, project_id, submission_id, type, title, message, action_url, metadata
        )
        select
          p.id,
          null,
          new.project_id,
          new.id,
          'form_submission',
          'New ' || coalesce(form_rec.title, 'Form') || ' submission',
          'New submission received from ' || coalesce(nullif(trim(new.respondent_name), ''), 'a client') || '.',
          '/admin/forms/' || new.form_id::text,
          '{}'::jsonb
        from public.profiles p
        where p.status = 'active' and p.role = 'admin'::public.app_role;
      exception
        when others then
          raise warning 'notify_form_submission fallback failed: %', sqlerrm;
      end;
    when others then
      raise warning 'notify_form_submission failed: %', sqlerrm;
  end;
  return new;
end;
$$;

create or replace function public.enqueue_submission_emails()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  form_rec public.form_templates;
  client_display text;
  staff_display text;
  rec record;
begin
  begin
    select * into form_rec from public.form_templates where id = new.form_id;

    client_display := coalesce(
      nullif(btrim(new.respondent_name), ''),
      nullif(btrim(new.company_name), ''),
      nullif(btrim(new.respondent_email), ''),
      'A client'
    );
    staff_display := coalesce(
      nullif(btrim(new.respondent_name), ''),
      nullif(btrim(new.company_name), ''),
      'A client'
    );

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
  exception
    when others then
      raise warning 'enqueue_submission_emails failed: %', sqlerrm;
  end;
  return new;
end;
$$;

commit;
