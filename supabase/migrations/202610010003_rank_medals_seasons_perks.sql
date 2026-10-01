begin;

-- =====================================================================
-- 1. Rank helpers. Thresholds mirror RANKS in the app's lib/guilds.ts
--    (Rookie 0, Bronze 100, Silver 300, Gold 750, Platinum 1500,
--    Legend 3000). Keep both in sync.
-- =====================================================================
create or replace function public.guild_lifetime_points(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::bigint
  from public.guild_point_events
  where user_id = p_user_id and amount > 0 and reason <> 'redemption_refund';
$$;

-- 0 Rookie .. 5 Legend.
create or replace function public.guild_rank_index(p_points bigint)
returns int
language sql
immutable
as $$
  select case
    when p_points >= 3000 then 5
    when p_points >= 1500 then 4
    when p_points >= 750 then 3
    when p_points >= 300 then 2
    when p_points >= 100 then 1
    else 0
  end;
$$;

create or replace function public.guild_rank_index_of_name(p_rank text)
returns int
language sql
immutable
as $$
  select case p_rank
    when 'Legend' then 5
    when 'Platinum' then 4
    when 'Gold' then 3
    when 'Silver' then 2
    when 'Bronze' then 1
    else 0
  end;
$$;

-- Reward discount (percent) a rank gets: Platinum 10%, Legend 20%.
create or replace function public.guild_rank_discount(p_rank_index int)
returns int
language sql
immutable
as $$
  select case when p_rank_index >= 5 then 20 when p_rank_index >= 4 then 10 else 0 end;
$$;

revoke all on function public.guild_lifetime_points(uuid) from public, anon;
grant execute on function public.guild_lifetime_points(uuid) to authenticated;

-- Role + lifetime points for a batch of users, so lists (friends, riders,
-- leaderboards) can show everyone's rank medal in one request.
create or replace function public.get_rank_info(p_user_ids uuid[])
returns table (user_id uuid, role text, lifetime_points bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.role, public.guild_lifetime_points(p.id)
  from public.profiles p
  where p.id = any(p_user_ids[1:200]);
$$;

grant execute on function public.get_rank_info(uuid[]) to authenticated;

-- =====================================================================
-- 2. Season medals. At the end of each month the top 3 players and top
--    3 guilds get a permanent dated medal.
-- =====================================================================
create table if not exists public.guild_season_awards (
  id uuid primary key default gen_random_uuid(),
  season date not null,
  board text not null check (board in ('player', 'guild')),
  place int not null check (place between 1 and 3),
  user_id uuid references public.profiles(id) on delete cascade,
  guild_id uuid references public.guilds(id) on delete cascade,
  -- Name snapshot so the medal still reads right after a rename.
  name text not null,
  points bigint not null,
  created_at timestamptz not null default now(),
  unique (season, board, place),
  check ((board = 'player' and user_id is not null) or (board = 'guild' and guild_id is not null))
);

create index if not exists guild_season_awards_user_idx on public.guild_season_awards(user_id);
create index if not exists guild_season_awards_guild_idx on public.guild_season_awards(guild_id);

alter table public.guild_season_awards enable row level security;

drop policy if exists "season awards readable" on public.guild_season_awards;
create policy "season awards readable" on public.guild_season_awards for select to authenticated using (true);

grant select on public.guild_season_awards to authenticated;
grant all on public.guild_season_awards to service_role;

-- Awards one finished month (default: last month). Idempotent: places that
-- already have a medal are skipped, and only new medals send notifications,
-- so it's safe for both the monthly cron and the app's on-open catch-up.
create or replace function public.award_season_medals(p_season date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz := date_trunc('month', coalesce(p_season, (now() - interval '1 month')::date)::timestamptz);
  v_end timestamptz := v_start + interval '1 month';
  v_label text := to_char(v_start, 'FMMonth YYYY');
  v_place_word text[] := array['1st', '2nd', '3rd'];
  v_count int := 0;
  v_id uuid;
  r record;
begin
  if v_end > now() then
    raise exception 'That season isn''t over yet';
  end if;

  for r in
    select e.user_id, p.display_name, sum(e.amount)::bigint as pts,
      row_number() over (order by sum(e.amount) desc, p.display_name)::int as place
    from public.guild_point_events e
    join public.profiles p on p.id = e.user_id
    where e.amount > 0 and e.reason <> 'redemption_refund'
      and e.created_at >= v_start and e.created_at < v_end
      and p.role in ('traveler', 'guild_leader')
    group by e.user_id, p.display_name
    order by pts desc, p.display_name
    limit 3
  loop
    v_id := null;
    insert into public.guild_season_awards (season, board, place, user_id, name, points)
    values (v_start::date, 'player', r.place, r.user_id, r.display_name, r.pts)
    on conflict (season, board, place) do nothing
    returning id into v_id;

    if v_id is not null then
      v_count := v_count + 1;
      insert into public.notifications (user_id, type, title, message, data)
      values (r.user_id, 'system', 'You won a season medal!',
        'You finished ' || v_place_word[r.place] || ' on the ' || v_label || ' player leaderboard with ' || r.pts || ' pts.',
        jsonb_build_object('route', '/guild'));
    end if;
  end loop;

  for r in
    select g.id as guild_id, g.name, g.leader_id, sum(e.amount)::bigint as pts,
      row_number() over (order by sum(e.amount) desc, g.name)::int as place
    from public.guild_point_events e
    join public.guilds g on g.id = e.guild_id
    where e.amount > 0 and e.reason <> 'redemption_refund'
      and e.created_at >= v_start and e.created_at < v_end
    group by g.id, g.name, g.leader_id
    order by pts desc, g.name
    limit 3
  loop
    v_id := null;
    insert into public.guild_season_awards (season, board, place, guild_id, name, points)
    values (v_start::date, 'guild', r.place, r.guild_id, r.name, r.pts)
    on conflict (season, board, place) do nothing
    returning id into v_id;

    if v_id is not null then
      v_count := v_count + 1;
      insert into public.notifications (user_id, type, title, message, data)
      select gm.user_id, 'system', 'Your guild won a season medal!',
        r.name || ' finished ' || v_place_word[r.place] || ' on the ' || v_label || ' guild leaderboard.',
        jsonb_build_object('route', '/guild')
      from public.guild_members gm
      where gm.guild_id = r.guild_id;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.award_season_medals(date) to authenticated;

-- A user's own season medals plus the ones their current guild won.
create or replace function public.get_season_awards(p_user_id uuid default null)
returns table (
  id uuid,
  season date,
  board text,
  place int,
  name text,
  points bigint,
  guild_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (select coalesce(p_user_id, auth.uid()) as id)
  select a.id, a.season, a.board, a.place, a.name, a.points, a.guild_id
  from public.guild_season_awards a, target
  where a.user_id = target.id
     or (a.board = 'guild' and a.guild_id = (select gm.guild_id from public.guild_members gm where gm.user_id = target.id))
  order by a.season desc, a.board, a.place;
$$;

grant execute on function public.get_season_awards(uuid) to authenticated;

-- Run on the 1st of every month (00:05 UTC). pg_cron is free on Supabase;
-- if it isn't available the app's catch-up call still awards medals.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'award-season-medals';
  perform cron.schedule('award-season-medals', '5 0 1 * *', 'select public.award_season_medals()');
exception when others then
  raise notice 'pg_cron unavailable, skipping schedule: %', sqlerrm;
end;
$$;

-- =====================================================================
-- 3. Rank perks: rank-gated rewards and rank discounts, enforced here
--    (the app's rank math is display-only).
-- =====================================================================
alter table public.guild_rewards
  add column if not exists min_rank text
  check (min_rank is null or min_rank in ('Bronze', 'Silver', 'Gold', 'Platinum', 'Legend'));

create or replace function public.redeem_guild_reward(p_reward_id uuid)
returns public.guild_reward_redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward public.guild_rewards;
  v_role text;
  v_balance bigint;
  v_rank int;
  v_cost int;
  v_redemption public.guild_reward_redemptions;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Serialize this user's spends so two taps can't double-spend.
  perform pg_advisory_xact_lock(hashtext('guild_coins:' || auth.uid()::text));

  select * into v_reward from public.guild_rewards where id = p_reward_id for update;
  if v_reward.id is null or not v_reward.is_active then
    raise exception 'This reward is no longer available';
  end if;

  v_role := public.current_user_role();
  if v_reward.audience = 'guild_leader' and v_role <> 'guild_leader' then
    raise exception 'This reward is for Guild Leaders only';
  end if;
  if v_reward.audience = 'traveler' and v_role <> 'traveler' then
    raise exception 'This reward is for travelers only';
  end if;
  if v_reward.stock is not null and v_reward.stock <= 0 then
    raise exception 'This reward is out of stock';
  end if;

  v_rank := public.guild_rank_index(public.guild_lifetime_points(auth.uid()));
  if v_reward.min_rank is not null and v_rank < public.guild_rank_index_of_name(v_reward.min_rank) then
    raise exception 'This reward unlocks at % rank', v_reward.min_rank;
  end if;

  v_cost := greatest(1, ceil(v_reward.cost * (100 - public.guild_rank_discount(v_rank)) / 100.0)::int);

  select coalesce(sum(amount), 0) into v_balance from public.guild_point_events where user_id = auth.uid();
  if v_balance < v_cost then
    raise exception 'Not enough coins (you have %, need %)', v_balance, v_cost;
  end if;

  if v_reward.stock is not null then
    update public.guild_rewards set stock = stock - 1 where id = v_reward.id;
  end if;

  insert into public.guild_reward_redemptions (reward_id, user_id, cost)
  values (v_reward.id, auth.uid(), v_cost)
  returning * into v_redemption;

  insert into public.guild_point_events (user_id, guild_id, amount, reason, source_id, source_key, note)
  values (
    auth.uid(),
    (select guild_id from public.guild_members where user_id = auth.uid()),
    -v_cost, 'redemption', v_redemption.id, 'redemption:' || v_redemption.id, v_reward.title
  );

  return v_redemption;
end;
$$;

-- Rank-exclusive starter rewards (hand-fulfilled, zero cost to run).
insert into public.guild_rewards (title, description, cost, audience, min_rank)
select * from (values
  ('Gold Explorer Spotlight', 'Your profile is featured in Discover''s suggested buddies for a week.', 400, 'everyone', 'Gold'),
  ('Platinum Trip Planner Session', 'A one-on-one chat with the PartyUp team to plan your next group trip.', 600, 'everyone', 'Platinum'),
  ('Legend Hall of Fame', 'Your name added to the PartyUp Legends wall, forever.', 1000, 'everyone', 'Legend')
) as seed(title, description, cost, audience, min_rank)
where not exists (select 1 from public.guild_rewards where min_rank is not null);

-- Live updates for season medals.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guild_season_awards'
  ) then
    alter publication supabase_realtime add table public.guild_season_awards;
  end if;
end;
$$;

commit;
