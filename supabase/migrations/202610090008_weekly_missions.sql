begin;

-- =====================================================================
-- More weekly missions, for everyone and for Guild Leaders.
--
-- 1. Individual weeklies grow from 3 to 10: carpools, new destinations,
--    hosting, friends, chat, 5-star ratings and guild PartyUps.
-- 2. A new 'leader' category on the Mission Board, shown only to guild
--    leaders. It resets every Monday like the other weekly missions
--    (guild_mission_window() treats any non-monthly, non-milestone
--    category as weekly).
-- Three new metrics count Let's PartyUp hangouts: ones a leader plans,
-- the RSVPs they get, and ones a member says "I'm going" to.
-- =====================================================================

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.guild_missions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.guild_missions drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.guild_missions
  add constraint guild_missions_category_check check (category in ('weekly', 'monthly', 'milestone', 'guild', 'leader'));

-- ---------------------------------------------------------------------
-- Progress metrics: same as 202610030001 plus partyups_hosted,
-- partyup_rsvps and partyups_joined.
-- ---------------------------------------------------------------------
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
    -- Let's PartyUp hangouts this leader planned (cancelled ones don't count).
    when 'partyups_hosted' then
      select count(*) into v_count from public.guild_partyups
      where created_by = p_user_id and status = 'open' and created_at >= p_start and created_at < p_end;
    -- Members who tapped "I'm going" on this leader's hangouts (not the leader).
    when 'partyup_rsvps' then
      select count(*) into v_count from public.guild_partyup_members pm
      join public.guild_partyups p on p.id = pm.partyup_id
      where p.created_by = p_user_id and p.status = 'open' and pm.user_id <> p_user_id
        and pm.joined_at >= p_start and pm.joined_at < p_end;
    -- Guild PartyUps this user said "I'm going" to (not their own).
    when 'partyups_joined' then
      select count(*) into v_count from public.guild_partyup_members pm
      join public.guild_partyups p on p.id = pm.partyup_id
      where pm.user_id = p_user_id and p.created_by <> p_user_id and p.status = 'open'
        and pm.joined_at >= p_start and pm.joined_at < p_end;
    else
      v_count := 0;
  end case;
  return least(coalesce(v_count, 0), 2147483647)::int;
end;
$$;

revoke all on function public.guild_mission_progress(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Individual weeklies for everyone (w_trip_1, w_rate_2 and w_contrib_60
-- stay as they are). w_friend_1 and w_chat_10 come back from 202610010005.
-- ---------------------------------------------------------------------
insert into public.guild_missions (key, category, audience, metric, target, reward, title, description, icon, chain, step, needs_guild, sort) values
  ('w_carpool_1',  'weekly', 'everyone', 'carpools',        1, 20, 'Share the Ride',  'Finish a carpool this week',                     'car',       null, 1, false, 13),
  ('w_dest_2',     'weekly', 'everyone', 'destinations',    2, 25, 'New Horizons',    'Travel to 2 different destinations this week',   'map',       null, 1, false, 14),
  ('w_host_1',     'weekly', 'everyone', 'trips_hosted',    1, 25, 'Trip Host',       'Host a trip that gets completed this week',      'home',      null, 1, false, 15),
  ('w_fivestar_1', 'weekly', 'everyone', 'five_stars',      1, 20, 'Crowd Favorite',  'Get a 5-star rating from a travel companion',    'heart',     null, 1, false, 16),
  ('w_friend_1',   'weekly', 'everyone', 'friends',         1, 15, 'Squad Up',        'Make a new friend on PartyUp',                   'user-plus', null, 1, false, 17),
  ('w_chat_10',    'weekly', 'everyone', 'messages',       10, 10, 'Ice Breaker',     'Send 10 messages to your travel buddies',        'message',   null, 1, false, 18),
  ('w_partyup_1',  'weekly', 'everyone', 'partyups_joined', 1, 20, 'Party Goer',      'Say "I''m going" to a guild PartyUp this week',  'users',     null, 1, true,  19)
on conflict (key) do update set
  category = excluded.category, audience = excluded.audience, metric = excluded.metric, target = excluded.target,
  reward = excluded.reward, title = excluded.title, description = excluded.description, icon = excluded.icon,
  chain = excluded.chain, step = excluded.step, needs_guild = excluded.needs_guild, sort = excluded.sort, is_active = true;

-- ---------------------------------------------------------------------
-- The leader catalog. Old leader weeklies (lw_*) come back under the new
-- category; lw_requests_3 is replaced by an easier lw_requests_2.
-- ---------------------------------------------------------------------
insert into public.guild_missions (key, category, audience, metric, target, reward, title, description, icon, chain, step, needs_guild, sort) values
  ('lw_partyup_1',   'leader', 'guild_leader', 'partyups_hosted',   1, 30, 'Rally Point',  'Plan a Let''s PartyUp for your guild this week',       'flag',      null, 1, true, 30),
  ('lw_rsvp_5',      'leader', 'guild_leader', 'partyup_rsvps',     5, 35, 'Full House',   'Get 5 "I''m going" replies on your PartyUps',           'users',     null, 1, true, 31),
  ('lw_members_3',   'leader', 'guild_leader', 'member_trips',      3, 30, 'Proud Leader', 'Guild members finish 3 trips this week',               'crown',     null, 1, true, 32),
  ('lw_recruit_1',   'leader', 'guild_leader', 'recruits',          1, 25, 'Fresh Blood',  'Welcome a new member to your guild this week',         'user-plus', null, 1, true, 33),
  ('lw_requests_2',  'leader', 'guild_leader', 'requests_answered', 2, 15, 'Open Doors',   'Answer 2 join requests this week',                     'clipboard', null, 1, true, 34),
  ('lw_announce_1',  'leader', 'guild_leader', 'announcements',     1, 15, 'Town Crier',   'Post a guild announcement this week',                  'message',   null, 1, true, 35)
on conflict (key) do update set
  category = excluded.category, audience = excluded.audience, metric = excluded.metric, target = excluded.target,
  reward = excluded.reward, title = excluded.title, description = excluded.description, icon = excluded.icon,
  chain = excluded.chain, step = excluded.step, needs_guild = excluded.needs_guild, sort = excluded.sort, is_active = true;

update public.guild_missions set is_active = false where key = 'lw_requests_3';

commit;
