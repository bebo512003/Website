-- Public form submit: let SECURITY DEFINER functions see pgcrypto.
--
-- submit_dynamic_form and generate_submission_reference run with
-- search_path = public. On hosted Supabase, digest() and
-- gen_random_bytes() live in the extensions schema, so every submit that
-- includes an email (the branding form always does) raised
-- "function digest(text, unknown) does not exist". The API mapped that
-- to the generic "Something went wrong. Please try again."
--
-- Adding extensions to the function search_path keeps the existing RPC
-- working. The Next.js submit route no longer depends on this migration
-- — it persists with the service role — but applying it still repairs
-- any leftover RPC callers.

begin;

alter function public.generate_submission_reference()
  set search_path = public, extensions;

alter function public.submit_dynamic_form(uuid, jsonb)
  set search_path = public, extensions;

commit;
