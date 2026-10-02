begin;

-- Guilds have two levels only: the Guild Leader and members. Officers (from
-- 202610010007) are removed: everything they could do (answer join requests,
-- post announcements, edit the guild's look, invite, moderate guild chat,
-- handle guild reports) is now leader-only, plus admins.
--
-- Most permissions go through can_manage_guild() / guild_manager_ids(), so
-- redefining those covers join requests, announcements, chat moderation,
-- removals, reports and the audit log. Functions that read
-- guild_members.role are recreated without it, then the column is dropped.

-- ---------------------------------------------------------------------
-- 1. Permission helpers: leader (or admin) only
-- ---------------------------------------------------------------------
create or replace function public.can_manage_guild(p_guild_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin'
    or exists (select 1 from public.guilds g where g.id = p_guild_id and g.leader_id = auth.uid());
$$;

create or replace function public.guild_manager_ids(p_guild_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select leader_id from public.guilds where id = p_guild_id and leader_id is not null;
$$;

revoke all on function public.guild_manager_ids(uuid) from public, anon, authenticated;

create or replace function public.my_managed_guild_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.guilds where leader_id = auth.uid() limit 1;
$$;

revoke all on function public.my_managed_guild_id() from public, anon, authenticated;

drop function if exists public.set_guild_officer(uuid, boolean);

-- ---------------------------------------------------------------------
-- 2. Step down: the eligible member with the most points takes over
--    (was: the top officer). Returns their name.
-- ---------------------------------------------------------------------
create or replace function public.step_down_as_leader()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_successor uuid;
begin
  select gm.user_id into v_successor
  from public.guilds g
  join public.guild_members gm on gm.guild_id = g.id and gm.user_id <> g.leader_id
  join public.profiles p on p.id = gm.user_id
  where g.leader_id = auth.uid()
    and p.role = 'traveler' and p.is_active and p.verification_status = 'approved'
  order by public.guild_lifetime_points(gm.user_id) desc, gm.joined_at
  limit 1;

  if v_successor is null then
    raise exception 'No member can take over yet. They must be an active, verified traveler';
  end if;

  perform public.transfer_guild_leadership(v_successor);
  return (select display_name from public.profiles where id = v_successor);
end;
$$;

grant execute on function public.step_down_as_leader() to authenticated;

-- transfer_guild_leadership (202610010016) resets both members' role to
-- 'member'; recreated without that line since the column goes away.
create or replace function public.transfer_guild_leadership(p_successor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
  v_successor public.profiles;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_guild from public.guilds where leader_id = auth.uid() for update;
  if v_guild.id is null then
    raise exception 'You don''t lead a guild';
  end if;
  if p_successor_id = auth.uid() then
    raise exception 'Pick another member';
  end if;
  if not exists (select 1 from public.guild_members where guild_id = v_guild.id and user_id = p_successor_id) then
    raise exception 'The new leader must be a member of %', v_guild.name;
  end if;

  select * into v_successor from public.profiles where id = p_successor_id;
  if v_successor.role <> 'traveler' or not v_successor.is_active or v_successor.verification_status <> 'approved' then
    raise exception 'The new leader must be an active, verified traveler';
  end if;

  select display_name into v_name from public.profiles where id = auth.uid();

  update public.guilds set leader_id = p_successor_id where id = v_guild.id;
  update public.profiles set role = 'guild_leader' where id = p_successor_id;
  update public.guild_leader_applications
  set status = 'declined', handled_at = now(), handled_by = auth.uid(), admin_notes = 'Became leader by handover'
  where user_id = p_successor_id and status = 'pending';

  perform set_config('partyup.leader_handover', 'on', true);
  update public.profiles set role = 'traveler' where id = auth.uid();
  perform set_config('partyup.leader_handover', 'off', true);

  insert into public.notifications (user_id, type, title, message, data)
  values (p_successor_id, 'system', 'You''re now the Guild Leader!',
    coalesce(v_name, 'Your leader') || ' handed you leadership of ' || v_guild.name || '.',
    jsonb_build_object('route', '/guild'));
  insert into public.notifications (user_id, type, title, message, data)
  select gm.user_id, 'system', 'New Guild Leader',
    coalesce(v_successor.display_name, 'A member') || ' now leads ' || v_guild.name || '.',
    jsonb_build_object('route', '/guild')
  from public.guild_members gm
  where gm.guild_id = v_guild.id and gm.user_id not in (auth.uid(), p_successor_id);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'Handed over guild leadership', 'profile', p_successor_id,
    jsonb_build_object('guild', v_guild.name, 'guild_id', v_guild.id, 'previous_leader', auth.uid()));
end;
$$;

grant execute on function public.transfer_guild_leadership(uuid) to authenticated;

-- Admin revoke (202610010010), minus the role reset on the successor.
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

grant execute on function public.revoke_guild_leader(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Functions that returned member_role: recreated without it (the
--    return type changes, so they're dropped first).
-- ---------------------------------------------------------------------
drop function if exists public.get_guild_member_board(uuid, text);

create function public.get_guild_member_board(p_guild_id uuid, p_period text default 'all')
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  is_leader boolean,
  joined_at timestamptz,
  points bigint,
  lifetime_points bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    gm.user_id, p.display_name, p.avatar_url, g.leader_id = gm.user_id, gm.joined_at,
    coalesce((
      select sum(e.amount) from public.guild_point_events e
      where e.user_id = gm.user_id and e.amount > 0 and e.reason <> 'redemption_refund'
        and e.created_at >= public.guild_period_start(p_period)
    ), 0)::bigint,
    coalesce((
      select sum(e.amount) from public.guild_point_events e
      where e.user_id = gm.user_id and e.amount > 0 and e.reason <> 'redemption_refund'
    ), 0)::bigint
  from public.guild_members gm
  join public.guilds g on g.id = gm.guild_id
  join public.profiles p on p.id = gm.user_id
  where gm.guild_id = p_guild_id
    and (p.is_active or g.leader_id = gm.user_id)
  order by 6 desc, 7 desc, gm.joined_at;
$$;

grant execute on function public.get_guild_member_board(uuid, text) to authenticated;

drop function if exists public.get_leader_guild_members(uuid);

create function public.get_leader_guild_members(p_leader_id uuid)
returns table (
  guild_id uuid,
  guild_name text,
  user_id uuid,
  display_name text,
  lifetime_points bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, gm.user_id, p.display_name, public.guild_lifetime_points(gm.user_id)
  from public.guilds g
  join public.guild_members gm on gm.guild_id = g.id and gm.user_id <> g.leader_id
  join public.profiles p on p.id = gm.user_id
  where public.is_admin() and g.leader_id = p_leader_id
  order by 5 desc, p.display_name;
$$;

grant execute on function public.get_leader_guild_members(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Error messages that still said "or officers"
-- ---------------------------------------------------------------------
create or replace function public.update_guild_appearance(
  p_guild_id uuid,
  p_tagline text,
  p_description text,
  p_emblem text,
  p_color text
)
returns public.guilds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.can_manage_guild(p_guild_id) then
    raise exception 'Only the Guild Leader can edit the guild''s look';
  end if;
  if p_color is not null and not public.guild_color_readable(p_color) then
    raise exception 'That color is too light — pick a darker shade';
  end if;

  update public.guilds
  set tagline = nullif(btrim(coalesce(p_tagline, '')), ''),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      emblem = coalesce(p_emblem, emblem),
      color = coalesce(p_color, color)
  where id = p_guild_id
  returning * into v_guild;

  if v_guild.id is null then
    raise exception 'Guild not found';
  end if;
  return v_guild;
end;
$$;

revoke all on function public.update_guild_appearance(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_guild_appearance(uuid, text, text, text, text) to authenticated;

create or replace function public.respond_guild_join_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.guild_join_requests;
  v_guild public.guilds;
  v_cap int;
begin
  select * into v_request from public.guild_join_requests where id = p_request_id for update;
  if v_request.id is null or v_request.status <> 'pending' then
    raise exception 'This request was already handled';
  end if;

  select * into v_guild from public.guilds where id = v_request.guild_id for update;
  if not public.can_manage_guild(v_guild.id) then
    raise exception 'Only this guild''s leader can answer join requests';
  end if;

  if p_accept then
    if exists (select 1 from public.guild_members where user_id = v_request.user_id) then
      raise exception 'They already joined another guild';
    end if;
    v_cap := public.guild_member_cap(v_guild.id);
    if (select count(*) from public.guild_members where guild_id = v_guild.id) >= v_cap then
      raise exception 'Your guild is full (% members). Level up the guild to unlock more slots', v_cap;
    end if;

    update public.guild_join_requests set status = 'accepted', handled_at = now(), handled_by = auth.uid()
    where id = v_request.id;
    insert into public.guild_members (user_id, guild_id) values (v_request.user_id, v_guild.id);
    perform public.award_guild_points(v_request.user_id, 10, 'guild_joined', 'once', v_guild.id, v_guild.name);

    insert into public.notifications (user_id, type, title, message, data)
    values (v_request.user_id, 'system', 'You''re in!',
      'Your request to join ' || v_guild.name || ' was accepted.',
      jsonb_build_object('guild_id', v_guild.id, 'route', '/guild'));
  else
    update public.guild_join_requests set status = 'declined', handled_at = now(), handled_by = auth.uid()
    where id = v_request.id;

    insert into public.notifications (user_id, type, title, message, data)
    values (v_request.user_id, 'system', 'Join request declined',
      v_guild.name || ' didn''t accept your request this time. You can ask another guild.',
      jsonb_build_object('route', '/guild'));
  end if;
end;
$$;

create or replace function public.delete_guild_chat_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.chat_messages;
  v_guild_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_message from public.chat_messages where id = p_message_id for update;
  if v_message.id is null or v_message.deleted_at is not null then
    return;
  end if;

  select guild_id into v_guild_id from public.chat_threads where id = v_message.thread_id;
  if v_guild_id is null then
    raise exception 'Only guild chat messages can be deleted';
  end if;
  if not (v_message.sender_id = auth.uid() or public.can_manage_guild(v_guild_id)) then
    raise exception 'Only the sender or the Guild Leader can delete this message';
  end if;

  update public.chat_messages
  set body = '', location = '{}'::jsonb, deleted_at = now(), deleted_by = auth.uid()
  where id = v_message.id;

  if v_message.sender_id <> auth.uid() then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'Deleted guild chat message', 'chat_message', v_message.id,
      jsonb_build_object('guild_id', v_guild_id, 'sender_id', v_message.sender_id, 'body', v_message.body));
  end if;
end;
$$;

grant execute on function public.delete_guild_chat_message(uuid) to authenticated;

-- invite_to_guild only changes its "not allowed" message; the rest is as in
-- 202610010018.
create or replace function public.invite_to_guild(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
  v_reason text;
  v_inviter text;
  v_invite_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Locked so the member-cap check can't race a join.
  select * into v_guild from public.guilds where id = public.my_managed_guild_id() for update;
  if v_guild.id is null then
    raise exception 'Only Guild Leaders can send invites';
  end if;

  v_reason := public.guild_invite_block_reason(v_guild, p_user_id);
  if v_reason is not null then
    raise exception '%', v_reason;
  end if;

  -- Drop a lapsed invite so the one-pending index doesn't block a fresh one.
  update public.guild_invites i set status = 'cancelled', handled_at = now()
  where i.guild_id = v_guild.id and i.user_id = p_user_id and i.status = 'pending'
    and not public.guild_invite_live(i);

  if exists (
    select 1 from public.guild_invites
    where guild_id = v_guild.id and user_id = p_user_id and status = 'pending'
  ) then
    raise exception 'They already have an invite from %', v_guild.name;
  end if;
  if exists (
    select 1 from public.guild_invites
    where guild_id = v_guild.id and user_id = p_user_id and status = 'declined'
      and handled_at > now() - interval '24 hours'
  ) then
    raise exception 'They declined your invite recently. Try again tomorrow';
  end if;
  if (select count(*) from public.guild_invites
      where guild_id = v_guild.id and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Your guild has sent 20 invites today. Try again tomorrow';
  end if;

  insert into public.guild_invites (guild_id, user_id, invited_by)
  values (v_guild.id, p_user_id, auth.uid())
  returning id into v_invite_id;

  select display_name into v_inviter from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, type, title, message, data)
  values (p_user_id, 'system', 'Guild invite',
    coalesce(v_inviter, 'A Guild Leader') || ' invited you to join ' || v_guild.name || '.',
    jsonb_build_object('guild_id', v_guild.id, 'invite_id', v_invite_id, 'route', '/guild'));

  return v_invite_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Drop the column (its check constraint goes with it).
-- ---------------------------------------------------------------------
alter table public.guild_members drop column if exists role;

commit;
