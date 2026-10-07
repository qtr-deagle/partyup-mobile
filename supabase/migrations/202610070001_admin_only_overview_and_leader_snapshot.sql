begin;

-- Platform-wide numbers (review queues, traveler totals, trips) are for
-- admins only. Guild leaders get their own guild's numbers from
-- get_leader_guild_snapshot() below instead.

create or replace function public.get_staff_overview_counts()
returns table (
  pending_ids bigint,
  pending_vehicles bigint,
  open_reports bigint,
  total_travelers bigint,
  verified_travelers bigint,
  new_travelers_today bigint,
  open_trips bigint,
  ongoing_trips bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.id_verifications where status = 'pending'),
    (select count(*) from public.vehicles where verification_status = 'pending'),
    (select count(*) from public.reports where status in ('open', 'reviewing')),
    (select count(*) from public.profiles where role = 'traveler'),
    (select count(*) from public.profiles where role = 'traveler' and verification_status = 'approved'),
    -- "Today" in Manila (UTC+8).
    (select count(*) from public.profiles where role = 'traveler'
      and created_at >= (date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')),
    (select count(*) from public.trips where status in ('open', 'full')),
    (select count(*) from public.trips where status = 'ongoing')
  where public.is_admin();
$$;

grant execute on function public.get_staff_overview_counts() to authenticated;

-- The calling leader's guild at a glance: size, this month's points and
-- rank, and what's waiting on them. No row if the caller leads no guild.
create or replace function public.get_leader_guild_snapshot()
returns table (
  guild_id uuid,
  name text,
  emblem text,
  color text,
  member_count bigint,
  member_cap int,
  points_this_month bigint,
  month_rank bigint,
  guild_count bigint,
  open_reports bigint,
  pending_join_requests bigint,
  upcoming_partyups bigint,
  next_partyup_title text,
  next_partyup_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with board as (
    select b.guild_id, b.member_count, b.points, b.member_cap,
      row_number() over (order by b.points desc, b.member_count desc) as month_rank,
      count(*) over () as guild_count
    from public.get_guild_leaderboard('month') b
  ),
  next_partyup as (
    select p.guild_id, p.title, p.meet_at
    from public.guild_partyups p
    join public.guilds g on g.id = p.guild_id and g.leader_id = auth.uid()
    where p.status = 'open' and p.meet_at >= now()
    order by p.meet_at
    limit 1
  )
  select
    g.id, g.name, g.emblem, g.color,
    b.member_count, b.member_cap, b.points, b.month_rank, b.guild_count,
    (select count(*) from public.guild_reports r where r.guild_id = g.id and r.status = 'open'),
    (select count(*) from public.guild_join_requests j where j.guild_id = g.id and j.status = 'pending'),
    (select count(*) from public.guild_partyups p where p.guild_id = g.id and p.status = 'open' and p.meet_at >= now()),
    n.title, n.meet_at
  from public.guilds g
  join board b on b.guild_id = g.id
  left join next_partyup n on n.guild_id = g.id
  where g.leader_id = auth.uid();
$$;

grant execute on function public.get_leader_guild_snapshot() to authenticated;

commit;
