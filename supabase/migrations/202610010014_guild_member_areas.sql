begin;

-- =====================================================================
-- Replace the free-text guild home base with member areas: the Bulacan
-- municipalities a guild recruits from (e.g. only San Jose del Monte and
-- Santa Maria). Empty = all of Bulacan. A traveler's area is their
-- verified profiles.city, so joining checks it against this list.
-- Values come from public.bulacan_municipalities() (lib/bulacan.ts).
-- =====================================================================

-- These reference home_base; recreated below with areas instead.
drop function if exists public.create_guild(text, text, text, text, text, text, int, text, text, text[]);
drop function if exists public.update_guild(uuid, text, text, text, text, text, text, int, text, text, text[]);
drop function if exists public.get_guild_leaderboard(text);

alter table public.guilds drop column if exists home_base;
alter table public.guilds
  add column if not exists areas text[] not null default '{}'
    check (areas <@ public.bulacan_municipalities());

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
  if p_guild.max_members is not null
    and (select count(*) from public.guild_members where guild_id = p_guild.id) >= p_guild.max_members then
    return p_guild.name || ' is full (' || p_guild.max_members || ' members)';
  end if;
  return null;
end;
$$;

revoke all on function public.guild_join_block_reason(public.guilds, uuid) from public, anon, authenticated;

create function public.create_guild(
  p_name text,
  p_tagline text default null,
  p_emblem text default 'shield',
  p_color text default '#2563EB',
  p_join_policy text default 'approval',
  p_min_rank text default null,
  p_max_members int default null,
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
    min_rank, max_members, description, areas, focus
  )
  values (
    btrim(p_name), nullif(btrim(coalesce(p_tagline, '')), ''), coalesce(p_emblem, 'shield'), coalesce(p_color, '#2563EB'), auth.uid(),
    coalesce(p_join_policy, 'approval'),
    p_min_rank, p_max_members,
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
  p_max_members int default null,
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
  v_count bigint;
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
  select count(*) into v_count from public.guild_members where guild_id = p_guild_id;
  if p_max_members is not null and p_max_members < v_count then
    raise exception 'Your guild already has % members; the limit can''t be lower than that', v_count;
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
      max_members = p_max_members,
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
  max_members int,
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
    g.max_members,
    g.areas
  from public.guilds g
  join public.profiles p on p.id = g.leader_id
  order by 9 desc, 8 desc, g.created_at;
$$;

grant execute on function public.create_guild(text, text, text, text, text, text, int, text, text[], text[]) to authenticated;
grant execute on function public.update_guild(uuid, text, text, text, text, text, text, int, text, text[], text[]) to authenticated;
grant execute on function public.get_guild_leaderboard(text) to authenticated;

commit;
