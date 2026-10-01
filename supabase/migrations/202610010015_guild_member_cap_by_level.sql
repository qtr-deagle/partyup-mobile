begin;

-- =====================================================================
-- Guild size is no longer a leader setting. Every guild holds 20 members
-- at Level 1, +5 per guild level, up to 50 (leader included), so leveling
-- up unlocks slots. Guild level = floor(lifetime pts / 500) + 1. Keep in
-- sync with guildMemberCap() in lib/guilds.ts.
-- Guilds already over their cap keep everyone; they just can't add more.
-- =====================================================================

-- These reference max_members; recreated below without it.
drop function if exists public.create_guild(text, text, text, text, text, text, int, text, text[], text[]);
drop function if exists public.update_guild(uuid, text, text, text, text, text, text, int, text, text[], text[]);
drop function if exists public.get_guild_leaderboard(text);

alter table public.guilds drop column if exists max_members;

create or replace function public.guild_member_cap(p_guild_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select least(50, 20 + 5 * (
    coalesce((
      select sum(e.amount) from public.guild_point_events e
      where e.guild_id = p_guild_id and e.amount > 0 and e.reason <> 'redemption_refund'
    ), 0)::bigint / 500
  ))::int;
$$;

grant execute on function public.guild_member_cap(uuid) to authenticated;

create or replace function public.guild_join_block_reason(p_guild public.guilds, p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_points bigint;
  v_city text;
  v_cap int;
begin
  if p_guild.min_rank is not null then
    v_points := public.guild_lifetime_points(p_user_id);
    if public.guild_rank_index(v_points) < public.guild_rank_index_of_name(p_guild.min_rank) then
      return p_guild.name || ' only accepts ' || p_guild.min_rank || ' rank and up';
    end if;
  end if;
  if cardinality(p_guild.areas) > 0 then
    select city into v_city from public.profiles where id = p_user_id;
    if v_city is null or not (v_city = any (p_guild.areas)) then
      return p_guild.name || ' only accepts members from ' || array_to_string(p_guild.areas, ', ');
    end if;
  end if;
  v_cap := public.guild_member_cap(p_guild.id);
  if (select count(*) from public.guild_members where guild_id = p_guild.id) >= v_cap then
    return p_guild.name || ' is full (' || v_cap || ' members). It unlocks more slots as it levels up';
  end if;
  return null;
end;
$$;

revoke all on function public.guild_join_block_reason(public.guilds, uuid) from public, anon, authenticated;

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

  select * into v_guild from public.guilds where id = v_request.guild_id;
  if not public.can_manage_guild(v_guild.id) then
    raise exception 'Only this guild''s leader or officers can answer join requests';
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

create function public.create_guild(
  p_name text,
  p_tagline text default null,
  p_emblem text default 'shield',
  p_color text default '#2563EB',
  p_join_policy text default 'approval',
  p_min_rank text default null,
  p_description text default null,
  p_areas text[] default '{}',
  p_focus text[] default '{}'
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
  if public.current_user_role() <> 'guild_leader' then
    raise exception 'Only Guild Leaders can found a guild';
  end if;
  if exists (select 1 from public.guilds where leader_id = auth.uid()) then
    raise exception 'You already lead a guild';
  end if;
  if exists (select 1 from public.guilds where lower(btrim(name)) = lower(btrim(p_name))) then
    raise exception 'That guild name is taken';
  end if;

  insert into public.guilds (
    name, tagline, emblem, color, leader_id, join_policy,
    min_rank, description, areas, focus
  )
  values (
    btrim(p_name), nullif(btrim(coalesce(p_tagline, '')), ''), coalesce(p_emblem, 'shield'), coalesce(p_color, '#2563EB'), auth.uid(),
    coalesce(p_join_policy, 'approval'),
    p_min_rank,
    nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_areas, '{}'), coalesce(p_focus, '{}')
  )
  returning * into v_guild;

  delete from public.guild_members where user_id = auth.uid();
  insert into public.guild_members (user_id, guild_id) values (auth.uid(), v_guild.id);

  perform public.award_guild_points(auth.uid(), 50, 'guild_founded', 'once', v_guild.id, v_guild.name);

  return v_guild;
end;
$$;

create function public.update_guild(
  p_guild_id uuid,
  p_name text,
  p_tagline text,
  p_emblem text,
  p_color text,
  p_join_policy text default null,
  p_min_rank text default null,
  p_description text default null,
  p_areas text[] default '{}',
  p_focus text[] default '{}'
)
returns public.guilds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
begin
  if not exists (
    select 1 from public.guilds
    where id = p_guild_id and (leader_id = auth.uid() or public.current_user_role() = 'admin')
  ) then
    raise exception 'Only this guild''s leader can edit it';
  end if;
  if exists (
    select 1 from public.guilds where id <> p_guild_id and lower(btrim(name)) = lower(btrim(p_name))
  ) then
    raise exception 'That guild name is taken';
  end if;

  -- Joining rules are always written (null / empty = no limit), so the
  -- form sends the full current settings. Narrowing areas or raising the
  -- rank doesn't remove current members.
  update public.guilds
  set name = btrim(p_name),
      tagline = nullif(btrim(coalesce(p_tagline, '')), ''),
      emblem = coalesce(p_emblem, emblem),
      color = coalesce(p_color, color),
      join_policy = coalesce(p_join_policy, join_policy),
      min_rank = p_min_rank,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      areas = coalesce(p_areas, '{}'),
      focus = coalesce(p_focus, '{}')
  where id = p_guild_id
  returning * into v_guild;

  return v_guild;
end;
$$;

create function public.get_guild_leaderboard(p_period text default 'all')
returns table (
  guild_id uuid,
  name text,
  tagline text,
  emblem text,
  color text,
  leader_id uuid,
  leader_name text,
  member_count bigint,
  points bigint,
  lifetime_points bigint,
  join_policy text,
  min_rank text,
  member_cap int,
  areas text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id, g.name, g.tagline, g.emblem, g.color, g.leader_id, p.display_name,
    (select count(*) from public.guild_members gm where gm.guild_id = g.id),
    coalesce((
      select sum(e.amount) from public.guild_point_events e
      where e.guild_id = g.id and e.amount > 0 and e.reason <> 'redemption_refund'
        and e.created_at >= public.guild_period_start(p_period)
    ), 0)::bigint,
    coalesce((
      select sum(e.amount) from public.guild_point_events e
      where e.guild_id = g.id and e.amount > 0 and e.reason <> 'redemption_refund'
    ), 0)::bigint,
    g.join_policy,
    g.min_rank,
    public.guild_member_cap(g.id),
    g.areas
  from public.guilds g
  join public.profiles p on p.id = g.leader_id
  order by 9 desc, 8 desc, g.created_at;
$$;

grant execute on function public.create_guild(text, text, text, text, text, text, text, text[], text[]) to authenticated;
grant execute on function public.update_guild(uuid, text, text, text, text, text, text, text, text[], text[]) to authenticated;
grant execute on function public.get_guild_leaderboard(text) to authenticated;

commit;
