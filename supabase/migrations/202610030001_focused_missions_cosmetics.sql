begin;

-- =====================================================================
-- Focused missions + profile cosmetics.
--
-- 1. The Mission Board shrinks to 11 cards in three groups:
--      Individual (weekly)  - what you do, incl. points you earn for your guild
--      Guild (weekly co-op) - what the guild does together (5 missions)
--      Milestones (chains)  - Explorer, Guild Pillar, Guild Level; the higher
--                             steps unlock cosmetics
--    Everything else is deactivated (rows stay so old claims still read).
-- 2. Cosmetics: profile banners and avatar frames. Bought with coins or
--    unlocked by a milestone. Visuals live in lib/cosmetics.ts (COSMETIC_STYLES),
--    keyed by cosmetics.key -- keep the two in sync.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1a. Contribution metrics. Same as 202610010016 plus
--     guild_contribution, guild_active_members, guild_trips_hosted and
--     guild_new_members.
-- ---------------------------------------------------------------------
create or replace function public.guild_mission_progress(p_user_id uuid, p_metric text, p_start timestamptz, p_end timestamptz)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_guild_id uuid := (select guild_id from public.guild_members where user_id = p_user_id);
  v_led_guild uuid := (select id from public.guilds where leader_id = p_user_id);
  v_count bigint := 0;
begin
  case p_metric
    when 'trips' then
      select count(*) into v_count from public.guild_point_events
      where user_id = p_user_id and reason in ('trip_completed', 'trip_hosted') and amount > 0
        and created_at >= p_start and created_at < p_end;
    when 'trips_hosted' then
      select count(*) into v_count from public.guild_point_events
      where user_id = p_user_id and reason = 'trip_hosted' and created_at >= p_start and created_at < p_end;
    when 'carpools' then
      select count(*) into v_count from public.guild_point_events e
      join public.trips t on t.id = e.source_id
      where e.user_id = p_user_id and e.reason in ('trip_completed', 'trip_hosted') and t.trip_type = 'carpool'
        and e.created_at >= p_start and e.created_at < p_end;
    when 'tours' then
      select count(*) into v_count from public.guild_point_events e
      join public.trips t on t.id = e.source_id
      where e.user_id = p_user_id and e.reason in ('trip_completed', 'trip_hosted') and t.trip_type = 'tour'
        and e.created_at >= p_start and e.created_at < p_end;
    when 'destinations' then
      select count(distinct lower(btrim(t.destination))) into v_count from public.guild_point_events e
      join public.trips t on t.id = e.source_id
      where e.user_id = p_user_id and e.reason in ('trip_completed', 'trip_hosted')
        and e.created_at >= p_start and e.created_at < p_end;
    when 'ratings_given' then
      select count(*) into v_count from public.feedback
      where author_id = p_user_id and created_at >= p_start and created_at < p_end;
    when 'five_stars' then
      select count(*) into v_count from public.feedback
      where target_user_id = p_user_id and rating = 5 and created_at >= p_start and created_at < p_end;
    when 'friends' then
      select count(*) into v_count from public.friend_requests
      where status = 'accepted' and (requester_id = p_user_id or recipient_id = p_user_id)
        and coalesce(responded_at, updated_at) >= p_start and coalesce(responded_at, updated_at) < p_end;
    when 'messages' then
      select count(*) into v_count from public.chat_messages
      where sender_id = p_user_id and message_type = 'text' and deleted_at is null
        and created_at >= p_start and created_at < p_end;
    when 'trusted_contacts' then
      select count(*) into v_count from public.trusted_contacts where user_id = p_user_id;
    when 'profile_complete' then
      select case when avatar_url is not null and coalesce(btrim(bio), '') <> '' then 1 else 0 end into v_count
      from public.profiles where id = p_user_id;
    when 'verified' then
      select case when verification_status = 'approved' then 1 else 0 end into v_count
      from public.profiles where id = p_user_id;
    when 'reviews' then
      select count(*) into v_count from public.guild_point_events
      where user_id = p_user_id and reason in ('id_review', 'vehicle_review') and created_at >= p_start and created_at < p_end;
    when 'member_trips' then
      select count(*) into v_count from public.guild_point_events
      where user_id = p_user_id and reason = 'guild_trip_bonus' and created_at >= p_start and created_at < p_end;
    when 'recruits' then
      select count(*) into v_count from public.guild_point_events
      where user_id = p_user_id and reason = 'guild_recruit' and created_at >= p_start and created_at < p_end;
    when 'requests_answered' then
      select count(*) into v_count from public.guild_join_requests
      where handled_by = p_user_id and status in ('accepted', 'declined')
        and handled_at >= p_start and handled_at < p_end;
    when 'announcements' then
      select count(*) into v_count from public.guilds
      where id = v_led_guild and announcement_by = p_user_id
        and announcement_at >= p_start and announcement_at < p_end;
    when 'guild_level' then
      v_count := case when coalesce(v_led_guild, v_guild_id) is null then 0
        else public.guild_lifetime_xp(coalesce(v_led_guild, v_guild_id)) / 500 + 1 end;
    -- Individual contribution: points this user earned for their current guild.
    when 'guild_contribution' then
      select coalesce(sum(amount), 0) into v_count from public.guild_point_events
      where user_id = p_user_id and guild_id = v_guild_id and amount > 0
        and reason not in ('redemption_refund', 'mission_reward')
        and created_at >= p_start and created_at < p_end;
    when 'guild_trips' then
      select count(*) into v_count from public.guild_point_events
      where guild_id = v_guild_id and reason in ('trip_completed', 'trip_hosted') and created_at >= p_start and created_at < p_end;
    -- How many different members traveled.
    when 'guild_active_members' then
      select count(distinct user_id) into v_count from public.guild_point_events
      where guild_id = v_guild_id and reason in ('trip_completed', 'trip_hosted') and created_at >= p_start and created_at < p_end;
    when 'guild_trips_hosted' then
      select count(*) into v_count from public.guild_point_events
      where guild_id = v_guild_id and reason = 'trip_hosted' and created_at >= p_start and created_at < p_end;
    when 'guild_new_members' then
      select count(*) into v_count from public.guild_members
      where guild_id = v_guild_id and joined_at >= p_start and joined_at < p_end;
    when 'guild_points' then
      select coalesce(sum(amount), 0) into v_count from public.guild_point_events
      where guild_id = v_guild_id and amount > 0 and reason not in ('redemption_refund', 'mission_reward')
        and created_at >= p_start and created_at < p_end;
    else
      v_count := 0;
  end case;
  return least(coalesce(v_count, 0), 2147483647)::int;
end;
$$;

revoke all on function public.guild_mission_progress(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1b. The smaller catalog.
-- ---------------------------------------------------------------------
insert into public.guild_missions (key, category, audience, metric, target, reward, title, description, icon, chain, step, needs_guild, sort) values
  -- Individual (weekly)
  ('w_trip_1',        'weekly',    'everyone', 'trips',                 1,   20, 'Weekend Warrior',     'Complete a trip this week',                          'car',    null, 1, false, 10),
  ('w_rate_2',        'weekly',    'everyone', 'ratings_given',         2,   15, 'Fair Critic',         'Rate 2 travel companions',                           'star',   null, 1, false, 11),
  ('w_contrib_60',    'weekly',    'everyone', 'guild_contribution',   60,   30, 'Pull Your Weight',    'Earn 60 pts for your guild this week',               'shield', null, 1, true,  12),
  -- Guild (weekly co-op)
  ('g_trips_5',       'guild',     'everyone', 'guild_trips',           5,   30, 'Guild Expedition',    'Your guild completes 5 trips together this week',    'flag',   null, 1, true,  20),
  ('g_squad_3',       'guild',     'everyone', 'guild_active_members',  3,   30, 'Strength in Numbers', '3 different members finish a trip this week',        'users',  null, 1, true,  21),
  ('g_hosts_2',       'guild',     'everyone', 'guild_trips_hosted',    2,   30, 'Hosts of Honor',      'Guild members host 2 completed trips this week',     'home',      null, 1, true,  22),
  ('g_welcome_1',     'guild',     'everyone', 'guild_new_members',     1,   25, 'Welcome Party',       'Your guild welcomes a new member this week',         'user-plus', null, 1, true,  23),
  ('g_points_300',    'guild',     'everyone', 'guild_points',        300,   40, 'Rally the Guild',     'Your guild earns 300 pts this week',                 'trophy',    null, 1, true,  24),
  -- Milestones
  ('ms_trips_1',      'milestone', 'everyone', 'trips',                 1,   25, 'Explorer I',          'Complete your first trip',                           'route',  'explorer', 1, false, 50),
  ('ms_trips_10',     'milestone', 'everyone', 'trips',                10,   75, 'Explorer II',         'Complete 10 trips',                                  'route',  'explorer', 2, false, 50),
  ('ms_trips_25',     'milestone', 'everyone', 'trips',                25,  150, 'Explorer III',        'Complete 25 trips',                                  'route',  'explorer', 3, false, 50),
  ('ms_trips_50',     'milestone', 'everyone', 'trips',                50,  300, 'Explorer IV',         'Complete 50 trips',                                  'route',  'explorer', 4, false, 50),
  ('ms_contrib_200',  'milestone', 'everyone', 'guild_contribution', 200,   50, 'Guild Pillar I',      'Earn 200 pts for your guild',                        'shield', 'pillar', 1, true, 51),
  ('ms_contrib_750',  'milestone', 'everyone', 'guild_contribution', 750,  120, 'Guild Pillar II',     'Earn 750 pts for your guild',                        'shield', 'pillar', 2, true, 51),
  ('ms_contrib_2000', 'milestone', 'everyone', 'guild_contribution', 2000, 250, 'Guild Pillar III',    'Earn 2,000 pts for your guild',                      'shield', 'pillar', 3, true, 51),
  ('ms_glevel_3',     'milestone', 'everyone', 'guild_level',           3,   75, 'Rising Guild',        'Help your guild reach Level 3',                      'trophy', 'guild_level', 1, true, 52),
  ('ms_glevel_5',     'milestone', 'everyone', 'guild_level',           5,  150, 'Renowned Guild',      'Help your guild reach Level 5',                      'trophy', 'guild_level', 2, true, 52),
  ('ms_glevel_10',    'milestone', 'everyone', 'guild_level',          10,  300, 'Legendary Guild',     'Help your guild reach Level 10',                     'trophy', 'guild_level', 3, true, 52)
on conflict (key) do update set
  category = excluded.category, audience = excluded.audience, metric = excluded.metric, target = excluded.target,
  reward = excluded.reward, title = excluded.title, description = excluded.description, icon = excluded.icon,
  chain = excluded.chain, step = excluded.step, needs_guild = excluded.needs_guild, sort = excluded.sort, is_active = true;

update public.guild_missions
set is_active = key in (
  'w_trip_1', 'w_rate_2', 'w_contrib_60',
  'g_trips_5', 'g_squad_3', 'g_hosts_2', 'g_welcome_1', 'g_points_300',
  'ms_trips_1', 'ms_trips_10', 'ms_trips_25', 'ms_trips_50',
  'ms_contrib_200', 'ms_contrib_750', 'ms_contrib_2000',
  'ms_glevel_3', 'ms_glevel_5', 'ms_glevel_10'
);

-- ---------------------------------------------------------------------
-- 2a. Cosmetics catalog + what each user owns / wears.
--     A cosmetic is either for sale (cost) or a mission unlock
--     (unlock_mission), never both.
-- ---------------------------------------------------------------------
create table if not exists public.cosmetics (
  key text primary key,
  kind text not null check (kind in ('banner', 'frame')),
  name text not null,
  description text,
  cost int check (cost > 0),
  unlock_mission text references public.guild_missions(key) on delete set null,
  min_rank text,
  sort int not null default 0,
  is_active boolean not null default true,
  check ((cost is null) <> (unlock_mission is null))
);

create table if not exists public.user_cosmetics (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cosmetic_key text not null references public.cosmetics(key) on delete cascade,
  kind text not null check (kind in ('banner', 'frame')),
  source text not null check (source in ('purchase', 'mission', 'admin')),
  equipped boolean not null default false,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, cosmetic_key)
);

-- One banner and one frame worn at a time.
create unique index if not exists user_cosmetics_one_equipped_idx
  on public.user_cosmetics(user_id, kind) where equipped;

alter table public.cosmetics enable row level security;
alter table public.user_cosmetics enable row level security;

drop policy if exists "cosmetics readable" on public.cosmetics;
create policy "cosmetics readable" on public.cosmetics for select to authenticated using (true);

-- What someone wears shows on their profile, so ownership is readable.
-- Writes only go through the functions below.
drop policy if exists "user cosmetics readable" on public.user_cosmetics;
create policy "user cosmetics readable" on public.user_cosmetics for select to authenticated using (true);

grant select on public.cosmetics to authenticated;
grant select on public.user_cosmetics to authenticated;
grant all on public.cosmetics to service_role;
grant all on public.user_cosmetics to service_role;

insert into public.cosmetics (key, kind, name, description, cost, unlock_mission, min_rank, sort) values
  -- Banners for sale
  ('banner_sunset',   'banner', 'Sunset Drive',   'Warm orange to pink, rolling hills',      150, null, null,       10),
  ('banner_bay',      'banner', 'Manila Bay',     'Deep blue with gentle waves',             150, null, null,       11),
  ('banner_sierra',   'banner', 'Sierra Madre',   'Forest green mountain ridges',            200, null, null,       12),
  ('banner_night',    'banner', 'Night Market',   'Midnight purple under the stars',         250, null, 'Silver',   13),
  ('banner_golden',   'banner', 'Golden Hour',    'Gold light for seasoned travelers',       400, null, 'Gold',     14),
  -- Banners from milestones
  ('banner_open_road','banner', 'Open Road',      'Earned by finishing Explorer III',        null, 'ms_trips_25',     null, 20),
  ('banner_pillar',   'banner', 'Guild Pillar',   'Earned by finishing Guild Pillar III',    null, 'ms_contrib_2000', null, 21),
  ('banner_legend',   'banner', 'Legendary Guild','Earned when your guild reaches Level 10', null, 'ms_glevel_10',    null, 22),
  -- Frames for sale
  ('frame_silver',    'frame',  'Silver Ring',    'A clean silver ring',                     100, null, null,       30),
  ('frame_sunset',    'frame',  'Sunset Ring',    'Orange fading to pink',                   150, null, null,       31),
  ('frame_emerald',   'frame',  'Emerald Ring',   'Deep green gradient',                     150, null, null,       32),
  ('frame_gilded',    'frame',  'Gilded Ring',    'Polished gold',                           350, null, 'Gold',     33),
  -- Frames from milestones
  ('frame_trail',     'frame',  'Trailblazer',    'Earned by finishing Explorer II',         null, 'ms_trips_10',     null, 40),
  ('frame_loyal',     'frame',  'Guild Loyal',    'Earned by finishing Guild Pillar II',     null, 'ms_contrib_750',  null, 41),
  ('frame_rising',    'frame',  'Rising Star',    'Earned when your guild reaches Level 5',  null, 'ms_glevel_5',     null, 42)
on conflict (key) do update set
  kind = excluded.kind, name = excluded.name, description = excluded.description, cost = excluded.cost,
  unlock_mission = excluded.unlock_mission, min_rank = excluded.min_rank, sort = excluded.sort, is_active = true;

-- Anyone who already finished an unlocking milestone gets its cosmetic.
insert into public.user_cosmetics (user_id, cosmetic_key, kind, source)
select distinct e.user_id, c.key, c.kind, 'mission'
from public.guild_point_events e
join public.cosmetics c on e.source_key = 'mission:' || c.unlock_mission || ':once'
where e.reason = 'mission_reward'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2b. claim_mission: same as 202610020007, plus any cosmetic the mission
--     unlocks.
-- ---------------------------------------------------------------------
create or replace function public.claim_mission(p_key text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.guild_missions;
  w record;
  v_role text := public.current_user_role();
  v_progress int;
  v_amount int;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into m from public.guild_missions where key = p_key and is_active;
  if m.key is null then
    raise exception 'Mission not found';
  end if;
  if not (m.audience = 'everyone' or m.audience = v_role or v_role = 'admin') then
    raise exception 'This mission isn''t for your role';
  end if;
  if m.needs_guild and not exists (select 1 from public.guild_members where user_id = auth.uid()) then
    raise exception 'Join a guild to unlock this mission';
  end if;

  select * into w from public.guild_mission_window(m.category);
  v_progress := public.guild_mission_progress(auth.uid(), m.metric, w.start_at, w.end_at);
  if v_progress < m.target then
    raise exception 'Not done yet (% of %)', v_progress, m.target;
  end if;

  v_amount := m.reward + ceil(m.reward
    * public.guild_perk_mission_bonus(public.guild_level_of(public.user_guild_id(auth.uid()))) / 100.0)::int;

  insert into public.guild_point_events (user_id, guild_id, amount, reason, source_key, note)
  values (
    auth.uid(),
    (select guild_id from public.guild_members where user_id = auth.uid()),
    v_amount, 'mission_reward', 'mission:' || m.key || ':' || w.period_key, m.title
  )
  on conflict (user_id, reason, source_key) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Already claimed';
  end if;

  insert into public.user_cosmetics (user_id, cosmetic_key, kind, source)
  select auth.uid(), c.key, c.kind, 'mission'
  from public.cosmetics c
  where c.unlock_mission = m.key and c.is_active
  on conflict do nothing;

  return v_amount;
end;
$$;

-- ---------------------------------------------------------------------
-- 2c. Buy a cosmetic with coins. Same discount as the reward shop
--     (rank + guild level, capped at 25%). Returns the coins spent.
-- ---------------------------------------------------------------------
create or replace function public.buy_cosmetic(p_key text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.cosmetics;
  v_rank int;
  v_discount int;
  v_cost int;
  v_balance bigint;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Serialize this user's spends so two taps can't double-spend.
  perform pg_advisory_xact_lock(hashtext('guild_coins:' || auth.uid()::text));

  select * into v_item from public.cosmetics where key = p_key;
  if v_item.key is null or not v_item.is_active then
    raise exception 'This item is no longer available';
  end if;
  if v_item.cost is null then
    raise exception 'This item is earned from a mission, not bought';
  end if;
  if exists (select 1 from public.user_cosmetics where user_id = auth.uid() and cosmetic_key = p_key) then
    raise exception 'You already own this';
  end if;

  v_rank := public.guild_rank_index(public.guild_lifetime_points(auth.uid()));
  if v_item.min_rank is not null and v_rank < public.guild_rank_index_of_name(v_item.min_rank) then
    raise exception 'This unlocks at % rank', v_item.min_rank;
  end if;

  v_discount := least(25, public.guild_rank_discount(v_rank)
    + public.guild_perk_discount(public.guild_level_of(public.user_guild_id(auth.uid()))));
  v_cost := greatest(1, ceil(v_item.cost * (100 - v_discount) / 100.0)::int);

  select coalesce(sum(amount), 0) into v_balance from public.guild_point_events where user_id = auth.uid();
  if v_balance < v_cost then
    raise exception 'Not enough coins (you have %, need %)', v_balance, v_cost;
  end if;

  insert into public.guild_point_events (user_id, guild_id, amount, reason, source_key, note)
  values (
    auth.uid(),
    (select guild_id from public.guild_members where user_id = auth.uid()),
    -v_cost, 'redemption', 'cosmetic:' || v_item.key, v_item.name
  );

  insert into public.user_cosmetics (user_id, cosmetic_key, kind, source)
  values (auth.uid(), v_item.key, v_item.kind, 'purchase');

  return v_cost;
end;
$$;

-- ---------------------------------------------------------------------
-- 2d. Wear a cosmetic (or take one off with p_key = null).
-- ---------------------------------------------------------------------
create or replace function public.equip_cosmetic(p_kind text, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_kind not in ('banner', 'frame') then
    raise exception 'Unknown cosmetic type';
  end if;
  if p_key is not null and not exists (
    select 1 from public.user_cosmetics where user_id = auth.uid() and cosmetic_key = p_key and kind = p_kind
  ) then
    raise exception 'You don''t own this yet';
  end if;

  update public.user_cosmetics set equipped = false
  where user_id = auth.uid() and kind = p_kind and equipped;

  if p_key is not null then
    update public.user_cosmetics set equipped = true
    where user_id = auth.uid() and cosmetic_key = p_key;
  end if;
end;
$$;

revoke all on function public.buy_cosmetic(text) from public, anon;
revoke all on function public.equip_cosmetic(text, text) from public, anon;
grant execute on function public.buy_cosmetic(text) to authenticated;
grant execute on function public.equip_cosmetic(text, text) to authenticated;

commit;
