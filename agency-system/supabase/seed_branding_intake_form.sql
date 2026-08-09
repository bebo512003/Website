-- =============================================================================
-- Branding & Visual Identity Intake Form — one-shot seed
-- -----------------------------------------------------------------------------
-- WHY THIS EXISTS
--   The Form Builder stores every form, question, option, section and
--   conditional rule in the database and renders it dynamically — nothing is
--   hardcoded in application code. This script inserts the exact rows the
--   builder would create, so you get the complete real-world form in one step.
--   After running it, open Administration -> Forms -> "Branding & Visual
--   Identity Intake Form" in the builder: everything is editable there exactly
--   as if you had clicked it together.
--
-- BEFORE RUNNING
--   You MUST first apply the conditional-logic migration so submissions skip
--   hidden questions correctly. In the Supabase SQL Editor run:
--       supabase/migrations/20260812000000_form_sections_and_conditional.sql
--   (that file defines is_form_question_visible() and the updated
--   submit_dynamic_form()). Then run THIS file in the same SQL Editor.
--
-- The form is inserted as published so its public link works immediately:
--       /f/branding-visual-identity-intake
-- You can disable / re-enable / edit it any time from Administration -> Forms.
-- =============================================================================

begin;

do $$
declare
  f_id uuid;
  q_full_name uuid;
  q_email uuid;
  q_phone uuid;
  q_company uuid;
  q_need uuid;
  q_has_logo uuid;
  q_logo_upload uuid;
  q_logo_opinion uuid;
  q_industry uuid;
  q_industry_other uuid;
  q_brand_stage uuid;
  q_brand_personality uuid;
  q_target_audience uuid;
  q_target_other uuid;
  q_competitors uuid;
  q_brands_like uuid;
  q_colors_use uuid;
  q_colors_avoid uuid;
  q_deliverables uuid;
  q_deliverables_other uuid;
  q_timeline uuid;
  q_budget uuid;
  q_notes_id uuid;
  q_files uuid;
begin
  -- ── 1. Form template (published) ───────────────────────────────────────────
  insert into public.form_templates (slug, title, description, status, settings)
  values (
    'branding-visual-identity-intake',
    'Branding & Visual Identity Intake Form',
    'A client intake form to understand the client''s business, branding needs, existing visual identity, and project requirements.',
    'published',
    '{}'::jsonb
  )
  returning id into f_id;

  -- Helper: create a question. Inline function-local is not possible, so we
  -- insert each question explicitly below with captured ids.

  -- ── 2. Section 1 · About You ───────────────────────────────────────────────
  insert into public.form_questions (form_id, question_type, label, required, map_to, position, config)
  values (f_id, 'short_text', 'Full Name', true, 'name', 1, '{"section":"About You"}')
  returning id into q_full_name;

  insert into public.form_questions (form_id, question_type, label, required, map_to, position, config)
  values (f_id, 'short_text', 'Email Address', true, 'email', 2, '{"section":"About You"}')
  returning id into q_email;

  insert into public.form_questions (form_id, question_type, label, required, map_to, position, config)
  values (f_id, 'short_text', 'Phone / WhatsApp Number', true, 'phone', 3, '{"section":"About You"}')
  returning id into q_phone;

  insert into public.form_questions (form_id, question_type, label, required, map_to, position, config)
  values (f_id, 'short_text', 'Company / Brand Name', true, 'company', 4, '{"section":"About You"}')
  returning id into q_company;

  -- ── 3. Section 2 · Your Brand ──────────────────────────────────────────────
  insert into public.form_questions (form_id, question_type, label, required, position, options, config)
  values (f_id, 'multiple_choice', 'What do you need help with?', true, 5,
    '["Logo Design","Visual Identity","Logo + Visual Identity","Company Profile","Logo + Visual Identity + Company Profile","Brand Refresh / Rebranding","Not sure yet"]'::jsonb,
    '{"section":"Your Brand"}')
  returning id into q_need;

  insert into public.form_questions (form_id, question_type, label, required, position, options, config)
  values (f_id, 'single_choice', 'Do you already have a logo?', true, 6,
    '["Yes","No"]'::jsonb,
    '{"section":"Your Brand"}')
  returning id into q_has_logo;

  insert into public.form_questions (form_id, question_type, label, required, position, config)
  values (f_id, 'file_upload', 'Please upload your current logo.', true, 7,
    jsonb_build_object('section','Your Brand','show_if', jsonb_build_object('question_id', q_has_logo::text, 'value','Yes')))
  returning id into q_logo_upload;

  insert into public.form_questions (form_id, question_type, label, required, position, options, config)
  values (f_id, 'multiple_choice', 'What do you like or dislike about your current logo?', false, 8,
    '["I like it and want to keep it","I like the idea but want to improve it","I don''t like the design","It feels outdated","It doesn''t represent the brand","I''m not sure"]'::jsonb,
    jsonb_build_object('section','Your Brand','show_if', jsonb_build_object('question_id', q_has_logo::text, 'value','Yes')))
  returning id into q_logo_opinion;

  insert into public.form_questions (form_id, question_type, label, required, position, options, config)
  values (f_id, 'dropdown', 'What industry does your business operate in?', false, 9,
    '["Construction","Real Estate","Technology","Food & Beverage","Fashion","Healthcare","Education","Finance","E-commerce","Professional Services","Manufacturing","Other"]'::jsonb,
    '{"section":"Your Brand"}')
  returning id into q_industry;

  insert into public.form_questions (form_id, question_type, label, required, position, config)
  values (f_id, 'short_text', 'Please specify your industry.', false, 10,
    jsonb_build_object('section','Your Brand','show_if', jsonb_build_object('question_id', q_industry::text, 'value','Other')))
  returning id into q_industry_other;

  insert into public.form_questions (form_id, question_type, label, required, position, options, config)
  values (f_id, 'single_choice', 'How would you describe your brand?', true, 11,
    '["New business / Starting from scratch","Existing business with no clear identity","Existing brand that needs improvement","Established brand that needs a refresh","Rebranding an existing business"]'::jsonb,
    '{"section":"Your Brand"}')
  returning id into q_brand_stage;

  -- ── 4. Section 3 · Brand Personality ───────────────────────────────────────
  insert into public.form_questions (form_id, question_type, label, required, position, options, config)
  values (f_id, 'multiple_choice', 'How should your brand feel?', false, 12,
    '["Professional","Modern","Premium","Elegant","Friendly","Bold","Minimal","Creative","Trustworthy","Energetic","Serious","Luxurious"]'::jsonb,
    '{"section":"Brand Personality"}')
  returning id into q_brand_personality;

  -- ── 5. Section 4 · Audience & Market ───────────────────────────────────────
  insert into public.form_questions (form_id, question_type, label, required, position, options, config)
  values (f_id, 'multiple_choice', 'Who is your main target audience?', false, 13,
    '["Individuals / Consumers","Businesses","Professionals","Families","Young adults","Children","Luxury / Premium customers","Mass market","Other"]'::jsonb,
    '{"section":"Audience & Market"}')
  returning id into q_target_audience;

  insert into public.form_questions (form_id, question_type, label, required, position, config)
  values (f_id, 'short_text', 'Please specify your main target audience.', false, 14,
    jsonb_build_object('section','Audience & Market','show_if', jsonb_build_object('question_id', q_target_audience::text, 'value','Other')))
  returning id into q_target_other;

  insert into public.form_questions (form_id, question_type, label, help_text, required, position, config)
  values (f_id, 'short_text', 'Who are your main competitors?', 'Enter brand names or links, if you like.', false, 15,
    '{"section":"Audience & Market"}')
  returning id into q_competitors;

  insert into public.form_questions (form_id, question_type, label, help_text, required, position, config)
  values (f_id, 'short_text', 'Are there any brands you like visually?', 'Provide brand names or links, if you like.', false, 16,
    '{"section":"Audience & Market"}')
  returning id into q_brands_like;

  -- ── 6. Section 5 · Visual Preferences ──────────────────────────────────────
  insert into public.form_questions (form_id, question_type, label, required, position, options, config)
  values (f_id, 'multiple_choice', 'Are there any colors you want to use?', false, 17,
    '["Blue","Green","Red","Orange","Yellow","Purple","Black","White","Neutral colors","No preference"]'::jsonb,
    '{"section":"Visual Preferences"}')
  returning id into q_colors_use;

  insert into public.form_questions (form_id, question_type, label, required, position, options, config)
  values (f_id, 'multiple_choice', 'Are there any colors you want to avoid?', false, 18,
    '["Blue","Green","Red","Orange","Yellow","Purple","Black","White","Neutral colors","No preference"]'::jsonb,
    '{"section":"Visual Preferences"}')
  returning id into q_colors_avoid;

  -- ── 7. Section 6 · Deliverables ────────────────────────────────────────────
  insert into public.form_questions (form_id, question_type, label, required, position, options, config)
  values (f_id, 'multiple_choice', 'Which deliverables do you need?', false, 19,
    '["Primary Logo","Logo Variations","Color Palette","Typography","Brand Guidelines","Business Cards","Social Media Templates","Presentation Template","Company Profile","Other"]'::jsonb,
    '{"section":"Deliverables"}')
  returning id into q_deliverables;

  insert into public.form_questions (form_id, question_type, label, required, position, config)
  values (f_id, 'short_text', 'Please specify the deliverables you need.', false, 20,
    jsonb_build_object('section','Deliverables','show_if', jsonb_build_object('question_id', q_deliverables::text, 'value','Other')))
  returning id into q_deliverables_other;

  -- ── 8. Section 7 · Project Details ─────────────────────────────────────────
  insert into public.form_questions (form_id, question_type, label, required, position, options, config)
  values (f_id, 'single_choice', 'When do you need the project?', false, 21,
    '["As soon as possible","Within 1 week","Within 2 weeks","Within 1 month","Flexible"]'::jsonb,
    '{"section":"Project Details"}')
  returning id into q_timeline;

  insert into public.form_questions (form_id, question_type, label, required, position, options, config)
  values (f_id, 'single_choice', 'Do you have a specific budget range?', false, 22,
    '["Under $100","$100–$250","$250–$500","$500–$1,000","$1,000+","Not sure yet","Prefer not to say"]'::jsonb,
    '{"section":"Project Details"}')
  returning id into q_budget;

  -- ── 9. Section 8 · Final Notes ─────────────────────────────────────────────
  insert into public.form_questions (form_id, question_type, label, required, position, config)
  values (f_id, 'long_text', 'Is there anything else we should know about the project?', false, 23,
    '{"section":"Final Notes"}')
  returning id into q_notes_id;

  insert into public.form_questions (form_id, question_type, label, required, position, config)
  values (f_id, 'file_upload', 'Upload any references, documents, or files that may help us understand the project.', false, 24,
    '{"section":"Final Notes"}')
  returning id into q_files;

  raise notice 'Created form % with 24 questions', f_id;
end $$;

commit;
