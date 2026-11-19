-- Cascading deletion of a project removes its members and files. Their DELETE
-- audit triggers must not try to recreate activity for a project that has just
-- been removed (the activity.project_id foreign key rejects that insert).
-- Keep recording explicit member/file removals while the project still exists.

create or replace function public.record_project_member_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_actor uuid := auth.uid();
begin
  if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
    v_actor := null;
  end if;

  select coalesce(nullif(trim(full_name), ''), email) into v_name
  from public.profiles where id = coalesce(new.user_id, old.user_id);

  if tg_op = 'INSERT' then
    insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
    values (
      new.project_id,
      v_actor,
      'member_added',
      v_name,
      jsonb_build_object('user_id', new.user_id, 'assigned_by', new.assigned_by)
    );
  elsif tg_op = 'DELETE' and exists (select 1 from public.projects where id = old.project_id) then
    insert into public.project_activity (project_id, actor_id, event_type, old_value, metadata)
    values (
      old.project_id,
      v_actor,
      'member_removed',
      v_name,
      jsonb_build_object('user_id', old.user_id)
    );
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.record_project_file_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  if tg_op = 'INSERT' and new.project_id is not null then
    v_actor := new.uploaded_by;
    if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
      v_actor := null;
    end if;
    insert into public.project_activity (project_id, actor_id, event_type, new_value, metadata)
    values (
      new.project_id,
      v_actor,
      'file_uploaded',
      new.name,
      jsonb_build_object('file_id', new.id, 'file_type', new.type, 'size', new.size)
    );
  elsif tg_op = 'DELETE' and old.project_id is not null
        and exists (select 1 from public.projects where id = old.project_id) then
    v_actor := auth.uid();
    if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
      v_actor := null;
    end if;
    insert into public.project_activity (project_id, actor_id, event_type, old_value, metadata)
    values (
      old.project_id,
      v_actor,
      'file_deleted',
      old.name,
      jsonb_build_object('file_id', old.id, 'file_type', old.type)
    );
  end if;
  return coalesce(new, old);
end;
$$;
