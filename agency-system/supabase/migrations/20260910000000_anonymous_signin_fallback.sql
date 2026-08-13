-- Public form submission fallback when GoTrue does not support Anonymous Sign-ins.
--
-- Some self-hosted / older Supabase projects do not expose
-- auth.create_anonymous_user(), which causes signInAnonymously() to return 422.
-- The public form client now gracefully degrades: text answers still submit
-- through the server route using the anon key, and file uploads (when used)
-- land in the shared `anon/` folder. This migration relaxes ONLY the form-files
-- insert policy so the anon role can write under `anon/...`, while keeping reads
-- locked down (staff with submission.view, or the uploader when a real session
-- exists) and keeping every other bucket unchanged.

begin;

drop policy if exists form_files_insert on storage.objects;
create policy form_files_insert on storage.objects for insert to authenticated, anon
  with check (
    bucket_id = 'form-files'
    and (
      -- Real (anonymous or authenticated) caller: uploader folder isolation.
      (auth.uid() is not null and owner_id = auth.uid()::text
        and (storage.foldername(name))[1] = auth.uid()::text)
      -- Fallback when no session is available: shared anon folder. The server
      -- only accepts file paths in this folder for callers without submission.edit,
      -- so cross-folder references remain impossible.
      or (auth.uid() is null and (storage.foldername(name))[1] = 'anon')
    )
  );

commit;
