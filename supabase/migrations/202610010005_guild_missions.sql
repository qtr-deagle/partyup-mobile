begin;

-- =====================================================================
-- Missions. A catalog of goals (weekly, monthly, milestone chains, and
-- guild co-op), with progress measured server-side from real activity and
-- rewards paid as 'mission_reward' point events when claimed. A claim is
-- just that point event, keyed by mission + period, so it can't repeat.
-- =====================================================================

-- Allow the new point reason.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.guild_point_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%reason%'
  loop
    execute format('alter table public.guild_point_events drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.guild_point_events
  add constraint guild_point_events_reason_check check (reason in (
    'id_review', 'vehicle_review', 'report_resolved', 'report_dismissed', 'sos_resolved',
    'trip_completed', 'trip_hosted', 'guild_trip_bonus', 'guild_joined', 'guild_founded',
    'id_verified', 'redemption', 'redemption_refund', 'admin_adjustment', 'mission_reward'
  ));

create table if not exists public.guild_missions (
  key text primary key,
  -- weekly / monthly reset; milestone is once ever; guild = weekly co-op.
  category text not null check (category in ('weekly', 'monthly', 'milestone', 'guild')),
  audience text not null default 'everyone' check (audience in ('everyone', 'traveler', 'guild_leader')),
  metric text not null,
  target int not null check (target > 0),
  reward int not null check (reward > 0),
  title text not null,
  description text not null,
  icon text not null default 'flag',
  -- Milestone chains: same chain, increasing step.
  chain text,
  step int not null default 1,
  needs_guild boolean not null default false,
  sort int not null default 0,
  is_active boolean not null default true
);

alter table public.guild_missions enable row level security;
drop policy if exists "missions readable" on public.guild_missions;
create policy "missions readable" on public.guild_missions for select to authenticated using (true);
grant select on public.guild_missions to authenticated;
grant all on public.guild_missions to service_role;

-- Window for a category: [start, end) plus a key that names the period.
create or replace function public.guild_mission_window(p_category text, out start_at timestamptz, out end_at timestamptz, out period_key text)
language sql
stable
as $$
  select
    case p_category
      when 'monthly' then date_trunc('month', now())
      when 'milestone' then '-infinity'::timestamptz
      else date_trunc('week', now())
    end,
    case p_category
      when 'monthly' then date_trunc('month', now()) + interval '1 month'
      when 'milestone' then 'infinity'::timestamptz
      else date_trunc('week', now()) + interval '7 days'
    end,
    case p_category
      when 'monthly' then 'm:' || to_char(date_trunc('month', now()), 'YYYY-MM')
      when 'milestone' then 'once'
      else 'w:' || to_char(date_trunc('week', now()), 'YYYY-MM-DD')
    end;
$$;

-- How far a user is on one metric inside a window. Everything is counted
-- from real rows, never from client input.
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
      where sender_id = p_user_id and message_type = 'text' and created_at >= p_start and created_at < p_end;
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
      select count(*) into v_count from public.guild_members
      where guild_id = v_led_guild and user_id <> p_user_id and joined_at >= p_start and joined_at < p_end;
    when 'guild_level' then
      select floor(coalesce(sum(amount), 0) / 500.0) + 1 into v_count from public.guild_point_events
      where guild_id = coalesce(v_led_guild, v_guild_id) and amount > 0 and reason not in ('redemption_refund', 'mission_reward');
    -- Guild co-op: what the whole guild did together.
    when 'guild_trips' then
      select count(*) into v_count from public.guild_point_events
      where guild_id = v_guild_id and reason in ('trip_completed', 'trip_hosted') and created_at >= p_start and created_at < p_end;
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

-- Every mission for the caller with live progress and claim state.
create or replace function public.get_my_missions()
returns table (
  key text,
  category text,
  title text,
  description text,
  icon text,
  target int,
  reward int,
  progress int,
  claimed boolean,
  locked boolean,
  chain text,
  step int,
  resets_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_in_guild boolean := exists (select 1 from public.guild_members where user_id = auth.uid());
  m public.guild_missions;
  w record;
begin
  if auth.uid() is null then
    return;
  end if;

  -- Qualified columns: key/chain/step are also this function's output names.
  for m in
    select gm.* from public.guild_missions gm
    where gm.is_active and (gm.audience = 'everyone' or gm.audience = v_role or v_role = 'admin')
    order by gm.sort, gm.chain nulls first, gm.step
  loop
    select * into w from public.guild_mission_window(m.category);
    key := m.key;
    category := m.category;
    title := m.title;
    description := m.description;
    icon := m.icon;
    target := m.target;
    reward := m.reward;
    locked := m.needs_guild and not v_in_guild;
    progress := case when locked then 0 else public.guild_mission_progress(auth.uid(), m.metric, w.start_at, w.end_at) end;
    claimed := exists (
      select 1 from public.guild_point_events e
      where e.user_id = auth.uid() and e.reason = 'mission_reward' and e.source_key = 'mission:' || m.key || ':' || w.period_key
    );
    chain := m.chain;
    step := m.step;
    resets_at := case when m.category = 'milestone' then null else w.end_at end;
    return next;
  end loop;
end;
$$;

-- Claim a finished mission. Re-checks progress here, then pays out once
-- per period (the ledger's unique key stops double claims).
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

  insert into public.guild_point_events (user_id, guild_id, amount, reason, source_key, note)
  values (
    auth.uid(),
    (select guild_id from public.guild_members where user_id = auth.uid()),
    m.reward, 'mission_reward', 'mission:' || m.key || ':' || w.period_key, m.title
  )
  on conflict (user_id, reason, source_key) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Already claimed';
  end if;
  return m.reward;
end;
$$;

grant execute on function public.get_my_missions() to authenticated;
grant execute on function public.claim_mission(text) to authenticated;

-- ---------------------------------------------------------------------
-- Catalog. Rewards are bonuses on top of the normal per-action points.
-- ---------------------------------------------------------------------
insert into public.guild_missions (key, category, audience, metric, target, reward, title, description, icon, chain, step, needs_guild, sort) values
  -- Traveler weekly
  ('w_trip_1',      'weekly', 'traveler', 'trips',         1, 20, 'Weekend Warrior',      'Complete a trip this week',                     'car',      null, 1, false, 10),
  ('w_trip_3',      'weekly', 'traveler', 'trips',         3, 45, 'Road Regular',         'Complete 3 trips this week',                    'route',    null, 1, false, 11),
  ('w_rate_2',      'weekly', 'everyone', 'ratings_given', 2, 15, 'Fair Critic',          'Rate 2 travel companions',                      'star',     null, 1, false, 12),
  ('w_friend_1',    'weekly', 'everyone', 'friends',       1, 15, 'Squad Up',             'Make a new friend on PartyUp',                  'users',    null, 1, false, 13),
  ('w_chat_10',     'weekly', 'everyone', 'messages',     10, 10, 'Ice Breaker',          'Send 10 messages to your travel buddies',       'message',  null, 1, false, 14),
  -- Guild Leader weekly
  ('lw_reviews_5',  'weekly', 'guild_leader', 'reviews',      5, 40, 'Gatekeeper''s Watch', 'Review 5 IDs or vehicles this week',          'clipboard', null, 1, false, 15),
  ('lw_members_3',  'weekly', 'guild_leader', 'member_trips', 3, 30, 'Proud Leader',        'Guild members finish 3 trips this week',      'crown',     null, 1, false, 16),
  -- Guild co-op (weekly, shared goal)
  ('g_trips_5',     'guild', 'everyone', 'guild_trips',    5,  30, 'Guild Expedition',    'Your guild completes 5 trips together this week', 'flag',  null, 1, true, 20),
  ('g_points_300',  'guild', 'everyone', 'guild_points', 300,  40, 'Rally the Guild',     'Your guild earns 300 pts this week',              'trophy', null, 1, true, 21),
  -- Traveler monthly
  ('m_dest_3',      'monthly', 'traveler', 'destinations', 3, 60, 'Bulacan Explorer',     'Visit 3 different destinations this month',     'map',      null, 1, false, 30),
  ('m_host_2',      'monthly', 'traveler', 'trips_hosted', 2, 60, 'Host with the Most',   'Host 2 completed trips this month',             'home',     null, 1, false, 31),
  ('m_carpool_5',   'monthly', 'traveler', 'carpools',     5, 75, 'Carpool Champ',        'Ride in 5 carpools this month',                 'car',      null, 1, false, 32),
  ('m_5star_3',     'monthly', 'everyone', 'five_stars',   3, 50, 'Crowd Favorite',       'Get three 5-star ratings this month',           'heart',    null, 1, false, 33),
  -- Guild Leader monthly
  ('lm_recruit_3',  'monthly', 'guild_leader', 'recruits', 3, 80,  'Recruiter',           'Welcome 3 new members to your guild this month', 'user-plus', null, 1, false, 34),
  ('lm_reviews_20', 'monthly', 'guild_leader', 'reviews', 20, 100, 'Border Patrol',       'Review 20 IDs or vehicles this month',           'shield',    null, 1, false, 35),
  -- Milestones: getting started
  ('ms_verified',   'milestone', 'traveler', 'verified',         1, 25, 'Trusted Traveler',  'Get your ID verified',                        'badge',    null, 1, false, 40),
  ('ms_profile',    'milestone', 'everyone', 'profile_complete', 1, 20, 'Looking Good',      'Add a profile photo and a bio',               'camera',   null, 1, false, 41),
  ('ms_safety',     'milestone', 'everyone', 'trusted_contacts', 1, 30, 'Safety First',      'Add someone to your Trusted Circle',          'shield',   null, 1, false, 42),
  -- Milestone chains
  ('ms_trips_1',    'milestone', 'traveler', 'trips',  1,  25, 'Explorer I',   'Complete your first trip',   'route', 'explorer', 1, false, 50),
  ('ms_trips_10',   'milestone', 'traveler', 'trips', 10,  75, 'Explorer II',  'Complete 10 trips',          'route', 'explorer', 2, false, 50),
  ('ms_trips_25',   'milestone', 'traveler', 'trips', 25, 150, 'Explorer III', 'Complete 25 trips',          'route', 'explorer', 3, false, 50),
  ('ms_trips_50',   'milestone', 'traveler', 'trips', 50, 300, 'Explorer IV',  'Complete 50 trips',          'route', 'explorer', 4, false, 50),
  ('ms_dest_5',     'milestone', 'traveler', 'destinations',  5,  50, 'Globetrotter I',   'Visit 5 different destinations',  'map', 'globetrotter', 1, false, 51),
  ('ms_dest_15',    'milestone', 'traveler', 'destinations', 15, 100, 'Globetrotter II',  'Visit 15 different destinations', 'map', 'globetrotter', 2, false, 51),
  ('ms_dest_30',    'milestone', 'traveler', 'destinations', 30, 200, 'Globetrotter III', 'Visit 30 different destinations', 'map', 'globetrotter', 3, false, 51),
  ('ms_host_1',     'milestone', 'traveler', 'trips_hosted',  1,  30, 'Host I',   'Host your first completed trip', 'home', 'host', 1, false, 52),
  ('ms_host_5',     'milestone', 'traveler', 'trips_hosted',  5,  80, 'Host II',  'Host 5 completed trips',         'home', 'host', 2, false, 52),
  ('ms_host_15',    'milestone', 'traveler', 'trips_hosted', 15, 200, 'Host III', 'Host 15 completed trips',        'home', 'host', 3, false, 52),
  ('ms_friends_5',  'milestone', 'everyone', 'friends',  5,  25, 'Social Butterfly I',   'Make 5 friends',  'users', 'social', 1, false, 53),
  ('ms_friends_15', 'milestone', 'everyone', 'friends', 15,  60, 'Social Butterfly II',  'Make 15 friends', 'users', 'social', 2, false, 53),
  ('ms_friends_30', 'milestone', 'everyone', 'friends', 30, 120, 'Social Butterfly III', 'Make 30 friends', 'users', 'social', 3, false, 53),
  ('ms_reviews_10',  'milestone', 'guild_leader', 'reviews',  10,  50, 'Gatekeeper I',   'Review 10 IDs or vehicles',  'clipboard', 'gatekeeper', 1, false, 54),
  ('ms_reviews_50',  'milestone', 'guild_leader', 'reviews',  50, 150, 'Gatekeeper II',  'Review 50 IDs or vehicles',  'clipboard', 'gatekeeper', 2, false, 54),
  ('ms_reviews_150', 'milestone', 'guild_leader', 'reviews', 150, 300, 'Gatekeeper III', 'Review 150 IDs or vehicles', 'clipboard', 'gatekeeper', 3, false, 54),
  ('ms_glevel_3',   'milestone', 'guild_leader', 'guild_level',  3,  75, 'Rising Guild',    'Grow your guild to Level 3',  'trophy', 'guild_level', 1, false, 55),
  ('ms_glevel_5',   'milestone', 'guild_leader', 'guild_level',  5, 150, 'Renowned Guild',  'Grow your guild to Level 5',  'trophy', 'guild_level', 2, false, 55),
  ('ms_glevel_10',  'milestone', 'guild_leader', 'guild_level', 10, 300, 'Legendary Guild', 'Grow your guild to Level 10', 'trophy', 'guild_level', 3, false, 55)
on conflict (key) do update set
  category = excluded.category, audience = excluded.audience, metric = excluded.metric, target = excluded.target,
  reward = excluded.reward, title = excluded.title, description = excluded.description, icon = excluded.icon,
  chain = excluded.chain, step = excluded.step, needs_guild = excluded.needs_guild, sort = excluded.sort;

commit;
