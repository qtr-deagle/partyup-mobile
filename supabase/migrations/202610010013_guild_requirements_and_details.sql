begin;

-- =====================================================================
-- Guild settings: a minimum rank to join (e.g. "Gold and up only") and a
-- member cap, plus profile details shown in the Guild Hall: an About
-- blurb, a home base and the kinds of trips the guild runs.
-- Rank names mirror RANKS in lib/guilds.ts; guild_rank_index() and
-- guild_rank_index_of_name() (migration 202610010003) do the comparison.
-- =====================================================================
alter table public.guilds
  add column if not exists min_rank text
    check (min_rank is null or min_rank in ('Bronze', 'Silver', 'Gold', 'Platinum', 'Legend')),
  add column if not exists max_members int
    check (max_members is null or max_members between 5 and 100),
  add column if not exists description text
    check (description is null or char_length(description) <= 300),
  add column if not exists home_base text
    check (home_base is null or char_length(home_base) <= 40),
  add column if not exists focus text[] not null default '{}'
    check (
      cardinality(focus) <= 4
      and focus <@ array['carpool', 'tours', 'mountains', 'beaches', 'food', 'roadtrips', 'city', 'camping']::text[]
    );

-- Shared by join_guild and respond_guild_join_request.
create or replace function public.guild_join_block_reason(p_guild public.guilds, p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_points bigint;
begin
  if p_guild.min_rank is not null then
    v_points := public.guild_lifetime_points(p_user_id);
    if public.guild_rank_index(v_points) < public.guild_rank_index_of_name(p_guild.min_rank) then
      return p_guild.name || ' only accepts ' || p_guild.min_rank || ' rank and up';
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

-- ---------------------------------------------------------------------
-- join_guild: same as 202610010004 plus the rank / cap check.
-- ---------------------------------------------------------------------
create or replace function public.join_guild(p_guild_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
  v_name text;
  v_block text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if public.current_user_role() <> 'traveler' then
    raise exception 'Guild Leaders and admins can''t join another guild';
  end if;
  if (select verification_status from public.profiles where id = auth.uid()) is distinct from 'approved' then
    raise exception 'Verify your ID before joining a guild';
  end if;
  if exists (select 1 from public.guild_members where user_id = auth.uid()) then
    raise exception 'Leave your current guild first';
  end if;

  select * into v_guild from public.guilds where id = p_guild_id;
  if v_guild.id is null then
    raise exception 'Guild not found';
  end if;

  v_block := public.guild_join_block_reason(v_guild, auth.uid());
  if v_block is not null then
    raise exception '%', v_block;
  end if;

  select display_name into v_name from public.profiles where id = auth.uid();

  if v_guild.join_policy = 'approval' then
    update public.guild_join_requests
    set status = 'cancelled', handled_at = now(), handled_by = auth.uid()
    where user_id = auth.uid() and status = 'pending';

    insert into public.guild_join_requests (guild_id, user_id) values (p_guild_id, auth.uid());

    insert into public.notifications (user_id, type, title, message, data)
    values (v_guild.leader_id, 'system', 'New join request',
      coalesce(v_name, 'A traveler') || ' wants to join ' || v_guild.name || '.',
      jsonb_build_object('guild_id', v_guild.id, 'route', '/guild'));
    return 'requested';
  end if;

  update public.guild_join_requests
  set status = 'cancelled', handled_at = now(), handled_by = auth.uid()
  where user_id = auth.uid() and status = 'pending';

  insert into public.guild_members (user_id, guild_id) values (auth.uid(), p_guild_id);
  perform public.award_guild_points(auth.uid(), 10, 'guild_joined', 'once', p_guild_id, v_guild.name);

  insert into public.notifications (user_id, type, title, message, data)
  values (v_guild.leader_id, 'system', 'New guild member',
    coalesce(v_name, 'A traveler') || ' joined ' || v_guild.name || '.',
    jsonb_build_object('guild_id', v_guild.id, 'route', '/guild'));
  return 'joined';
end;
$$;

-- ---------------------------------------------------------------------
-- respond_guild_join_request: same as 202610010007, but accepting checks
-- the member cap. Rank isn't rechecked: the request already passed it,
-- and a leader raising the bar later shouldn't strand pending requests.
-- ---------------------------------------------------------------------
create or replace function public.respond_guild_join_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.guild_join_requests;
  v_guild public.guilds;
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
    if v_guild.max_members is not null
      and (select count(*) from public.guild_members where guild_id = v_guild.id) >= v_guild.max_members then
      raise exception 'Your guild is full (% members). Raise the member limit in guild settings first', v_guild.max_members;
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

-- ---------------------------------------------------------------------
-- create_guild / update_guild take the new settings.
-- ---------------------------------------------------------------------
drop function if exists public.create_guild(text, text, text, text, text);

create function public.create_guild(
  p_name text,
  p_tagline text default null,
  p_emblem text default 'shield',
  p_color text default '#2563EB',
  p_join_policy text default 'approval',
  p_min_rank text default null,
  p_max_members int default null,
  p_description text default null,
  p_home_base text default null,
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
    min_rank, max_members, description, home_base, focus
  )
  values (
    btrim(p_name), nullif(btrim(coalesce(p_tagline, '')), ''), coalesce(p_emblem, 'shield'), coalesce(p_color, '#2563EB'), auth.uid(),
    coalesce(p_join_policy, 'approval'),
    p_min_rank, p_max_members,
    nullif(btrim(coalesce(p_description, '')), ''), nullif(btrim(coalesce(p_home_base, '')), ''), coalesce(p_focus, '{}')
  )
  returning * into v_guild;

  delete from public.guild_members where user_id = auth.uid();
  insert into public.guild_members (user_id, guild_id) values (auth.uid(), v_guild.id);

  perform public.award_guild_points(auth.uid(), 50, 'guild_founded', 'once', v_guild.id, v_guild.name);

  return v_guild;
end;
$$;

drop function if exists public.update_guild(uuid, text, text, text, text, text);

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
  p_home_base text default null,
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

  -- min_rank / max_members are always written (null = no limit), so the
  -- form sends the full current settings.
  update public.guilds
  set name = btrim(p_name),
      tagline = nullif(btrim(coalesce(p_tagline, '')), ''),
      emblem = coalesce(p_emblem, emblem),
      color = coalesce(p_color, color),
      join_policy = coalesce(p_join_policy, join_policy),
      min_rank = p_min_rank,
      max_members = p_max_members,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      home_base = nullif(btrim(coalesce(p_home_base, '')), ''),
      focus = coalesce(p_focus, '{}')
  where id = p_guild_id
  returning * into v_guild;

  return v_guild;
end;
$$;

-- ---------------------------------------------------------------------
-- Leaderboard rows carry the requirements so Join buttons can say
-- "Gold+" or "Full" without opening the guild.
-- ---------------------------------------------------------------------
drop function if exists public.get_guild_leaderboard(text);

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
  home_base text
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
    g.home_base
  from public.guilds g
  join public.profiles p on p.id = g.leader_id
  order by 9 desc, 8 desc, g.created_at;
$$;

grant execute on function public.create_guild(text, text, text, text, text, text, int, text, text, text[]) to authenticated;
grant execute on function public.update_guild(uuid, text, text, text, text, text, text, int, text, text, text[]) to authenticated;
grant execute on function public.get_guild_leaderboard(text) to authenticated;

commit;
