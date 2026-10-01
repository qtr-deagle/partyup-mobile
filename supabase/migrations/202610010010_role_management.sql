begin;

-- =====================================================================
-- Role management for the website: Guild Leaders and admins are managed
-- on separate pages, and both changes go through these RPCs so the
-- side effects (guild handover, safety rules, audit) always happen.
-- =====================================================================

-- A leader's guild and its members, for picking a successor before revoking.
create or replace function public.get_leader_guild_members(p_leader_id uuid)
returns table (
  guild_id uuid,
  guild_name text,
  user_id uuid,
  display_name text,
  member_role text,
  lifetime_points bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, gm.user_id, p.display_name, gm.role, public.guild_lifetime_points(gm.user_id)
  from public.guilds g
  join public.guild_members gm on gm.guild_id = g.id and gm.user_id <> g.leader_id
  join public.profiles p on p.id = gm.user_id
  where public.is_admin() and g.leader_id = p_leader_id
  order by (gm.role = 'officer') desc, 6 desc, p.display_name;
$$;

-- Revoke a Guild Leader. If they lead a guild, it must either go to one of
-- its members (who becomes the new leader) or be disbanded.
create or replace function public.revoke_guild_leader(p_user_id uuid, p_successor_id uuid default null, p_disband boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
  v_name text;
  v_successor_name text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can revoke Guild Leaders';
  end if;
  if (select role from public.profiles where id = p_user_id) is distinct from 'guild_leader' then
    raise exception 'That account isn''t a Guild Leader';
  end if;

  select display_name into v_name from public.profiles where id = p_user_id;
  select * into v_guild from public.guilds where leader_id = p_user_id;

  if v_guild.id is not null then
    if p_successor_id is not null then
      if not exists (select 1 from public.guild_members where guild_id = v_guild.id and user_id = p_successor_id) then
        raise exception 'The new leader must be a member of %', v_guild.name;
      end if;
      select display_name into v_successor_name from public.profiles where id = p_successor_id;

      update public.guilds set leader_id = p_successor_id where id = v_guild.id;
      update public.guild_members set role = 'member' where user_id = p_successor_id;
      update public.profiles set role = 'guild_leader' where id = p_successor_id;

      insert into public.notifications (user_id, type, title, message, data)
      values (p_successor_id, 'system', 'You''re now the Guild Leader!',
        'You''ve been handed leadership of ' || v_guild.name || '.', jsonb_build_object('route', '/guild'));
      insert into public.notifications (user_id, type, title, message, data)
      select gm.user_id, 'system', 'New Guild Leader',
        coalesce(v_successor_name, 'A member') || ' now leads ' || v_guild.name || '.', jsonb_build_object('route', '/guild')
      from public.guild_members gm
      where gm.guild_id = v_guild.id and gm.user_id not in (p_user_id, p_successor_id);
    elsif p_disband then
      insert into public.notifications (user_id, type, title, message, data)
      select gm.user_id, 'system', 'Guild disbanded',
        v_guild.name || ' was disbanded by PartyUp. Your points stay with you, and you can join another guild.',
        jsonb_build_object('route', '/guild')
      from public.guild_members gm
      where gm.guild_id = v_guild.id and gm.user_id <> p_user_id;
      delete from public.guilds where id = v_guild.id;
    else
      raise exception '% leads %: hand it to a member or disband it first', v_name, v_guild.name;
    end if;
  end if;

  update public.profiles set role = 'traveler' where id = p_user_id;
  insert into public.notifications (user_id, type, title, message, data)
  values (p_user_id, 'system', 'Guild Leader role removed',
    'You''re a traveler again. Your points and rank stay with you.', jsonb_build_object('route', '/guild'));

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'Revoked Guild Leader', 'profile', p_user_id,
    jsonb_build_object('guild', v_guild.name, 'successor_id', p_successor_id, 'disbanded', p_disband and v_guild.id is not null and p_successor_id is null));
end;
$$;

-- Grant or remove admin. Admins are referees: they don't lead or join
-- guilds. You can't remove yourself, and the last admin can't be removed.
create or replace function public.set_admin_role(p_user_id uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := (select role from public.profiles where id = p_user_id);
begin
  if not public.is_admin() then
    raise exception 'Only admins can change admin access';
  end if;
  if v_role is null then
    raise exception 'Account not found';
  end if;

  if p_admin then
    if v_role = 'admin' then
      raise exception 'They''re already an admin';
    end if;
    if exists (select 1 from public.guilds where leader_id = p_user_id) then
      raise exception 'They lead a guild. Revoke their Guild Leader role (hand over or disband the guild) first';
    end if;
    delete from public.guild_members where user_id = p_user_id;
    update public.guild_join_requests set status = 'cancelled', handled_at = now(), handled_by = auth.uid()
    where user_id = p_user_id and status = 'pending';
    update public.guild_leader_applications set status = 'declined', handled_at = now(), handled_by = auth.uid(),
      admin_notes = 'Made an admin'
    where user_id = p_user_id and status = 'pending';
    update public.profiles set role = 'admin' where id = p_user_id;
  else
    if v_role <> 'admin' then
      raise exception 'They aren''t an admin';
    end if;
    if p_user_id = auth.uid() then
      raise exception 'You can''t remove your own admin access';
    end if;
    if (select count(*) from public.profiles where role = 'admin' and is_active) <= 1 then
      raise exception 'PartyUp needs at least one admin';
    end if;
    update public.profiles set role = 'traveler' where id = p_user_id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), case when p_admin then 'Granted admin access' else 'Removed admin access' end, 'profile', p_user_id,
    jsonb_build_object('previous_role', v_role));
end;
$$;

grant execute on function public.get_leader_guild_members(uuid) to authenticated;
grant execute on function public.revoke_guild_leader(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_admin_role(uuid, boolean) to authenticated;

commit;
