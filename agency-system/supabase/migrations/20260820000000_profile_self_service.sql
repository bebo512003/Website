-- Profile self-service hardening (Session 03).
--
-- Users own their avatar folder. When an Administrator uploads an avatar for a
-- team member through Team Management, the storage object's owner_id is the
-- Administrator, so the member could previously neither update nor delete that
-- object. The avatar path always starts with the member's user id, so allow
-- folder-based ownership on the update/delete policies in addition to the
-- explicit owner. This keeps avatars safe: a user can only ever touch objects
-- inside their own folder (or those they explicitly uploaded), while Admins
-- keep their employee.manage override.

begin;

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

commit;
