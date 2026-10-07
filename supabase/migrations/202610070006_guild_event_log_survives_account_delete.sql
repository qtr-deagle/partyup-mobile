begin;

-- Deleting the account of anyone in a guild failed: the profile delete
-- cascades to guild_members, whose audit trigger logs "member left" with
-- target_user_id = the profile being deleted. That row no longer exists
-- mid-delete, so the insert broke guild_audit_events_target_user_id_fkey and
-- rolled the whole account deletion back.
--
-- Same function as 202610030002, except an actor/target whose profile is gone
-- is stored as null (what the FK's ON DELETE SET NULL would do to the event a
-- moment later anyway). Covers every caller: members, join requests, invites.
create or replace function public.log_guild_event(
  p_guild_id uuid,
  p_actor_id uuid,
  p_action text,
  p_target_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id is null or not exists (select 1 from public.guilds where id = p_guild_id) then
    return;
  end if;
  insert into public.guild_audit_events (guild_id, actor_id, action, target_user_id, metadata)
  values (
    p_guild_id,
    case when exists (select 1 from public.profiles where id = p_actor_id) then p_actor_id end,
    p_action,
    case when exists (select 1 from public.profiles where id = p_target_user_id) then p_target_user_id end,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.log_guild_event(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;

commit;
