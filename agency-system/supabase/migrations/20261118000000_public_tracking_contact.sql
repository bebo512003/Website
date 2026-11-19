-- Refresh the public tracking contact metadata to match lib/contact.ts.
-- Preserve the tracking projection, lookup, and existing function privileges.
-- Business hours have not been specified; keep the legacy key with a null value.

begin;

create or replace function public.get_public_submission_tracking(p_tracking_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_key text;
  sub_rec record;
  stage_idx integer;
  status_label text;
  status_desc text;
begin
  clean_key := btrim(coalesce(p_tracking_key, ''));
  if clean_key = '' then
    return null;
  end if;

  select
    s.id,
    s.reference_number,
    s.tracking_token,
    s.form_id,
    ft.title as form_title,
    ft.description as form_description,
    s.status,
    s.respondent_name,
    s.company_name,
    s.submitted_at,
    s.updated_at,
    (s.project_id is not null) as has_project
  into sub_rec
  from public.form_submissions s
  left join public.form_templates ft on ft.id = s.form_id
  where upper(s.reference_number) = upper(clean_key)
     or s.tracking_token = clean_key
  limit 1;

  if sub_rec.id is null then
    return null;
  end if;

  -- Map internal workflow status to safe client-facing stage & descriptions
  case sub_rec.status
    when 'new' then
      stage_idx := 1;
      status_label := 'Received';
      status_desc := 'Your submission has been securely received and queued for initial team review.';
    when 'reviewing' then
      stage_idx := 2;
      status_label := 'Under Review';
      status_desc := 'Our creative and technical specialists are actively evaluating your request requirements.';
    when 'need_information' then
      stage_idx := 2;
      status_label := 'Information Needed';
      status_desc := 'Our team needs a few clarifications. Please check your email for questions from our team.';
    when 'qualified' then
      stage_idx := 3;
      status_label := 'Qualified';
      status_desc := 'Your request has been qualified and approved for scoping and kickoff planning.';
    when 'approved' then
      stage_idx := 3;
      status_label := 'Approved';
      status_desc := 'Your request is approved. Team assignments and project setup are underway.';
    when 'converted' then
      stage_idx := 4;
      status_label := 'In Progress';
      status_desc := 'Your request has transitioned to an active project in our production pipeline.';
    when 'rejected' then
      stage_idx := 0;
      status_label := 'Declined';
      status_desc := 'We are currently unable to take on this project. Thank you for considering us.';
    when 'archived' then
      stage_idx := 0;
      status_label := 'Archived';
      status_desc := 'This request has been archived or closed.';
    else
      stage_idx := 1;
      status_label := 'Received';
      status_desc := 'Your request is in our system and will be processed shortly.';
  end case;

  return jsonb_build_object(
    'id', sub_rec.id,
    'reference_number', sub_rec.reference_number,
    'tracking_token', sub_rec.tracking_token,
    'form_id', sub_rec.form_id,
    'form_title', coalesce(sub_rec.form_title, 'Service Request'),
    'form_description', sub_rec.form_description,
    'status', sub_rec.status,
    'client_status_label', status_label,
    'client_status_description', status_desc,
    'stage_index', stage_idx,
    'submitted_at', sub_rec.submitted_at,
    'updated_at', sub_rec.updated_at,
    'respondent_name', sub_rec.respondent_name,
    'company_name', sub_rec.company_name,
    'has_project', sub_rec.has_project,
    'expected_response_time', '1–2 business days',
    'contact_email', 'beshoyashrafoffecial@gmail.com',
    'contact_phone', '+201008239401',
    'contact_whatsapp', 'https://wa.me/201008239401',
    'contact_behance', 'https://www.behance.net/beshoy-ashraf51',
    'contact_linkedin', 'https://www.linkedin.com/in/beshoy-ashraf51/',
    'support_hours', null
  );
end;
$$;

revoke all on function public.get_public_submission_tracking(text) from public;
grant execute on function public.get_public_submission_tracking(text) to anon, authenticated;

commit;
