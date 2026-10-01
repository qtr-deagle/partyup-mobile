begin;

-- =====================================================================
-- Guild hardening (audit follow-up):
--   1. Leader requirements are enforced again (undoes 202610010012).
--   2. chat_participants is RPC-only: users could insert themselves into
--      any thread (e.g. a guild chat they were removed from).
--   3. Join / officer limits lock the guild row so concurrent calls can't
--      overshoot the member cap or the 2-officer limit.
--   4. Join-request cooldowns, and officers hear about requests too.
--   5. Announcements are for members only.
--   6. Guild level means the same thing everywhere.
--   7. Trip points need a real trip (30+ min) and stop after 3 a day.
--   8. Guild chat moderation (soft delete).
--   9. Leaders can hand over their guild or step down themselves.
--  10. Suspended accounts drop off boards; coin balances are private.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Leader eligibility: same as 202610010011.
-- ---------------------------------------------------------------------
create or replace function public.get_leader_eligibility()
returns table (
  trips_completed bigint,
  trips_hosted bigint,
  verified boolean,
  avg_rating numeric,
  rating_count bigint,
  trips_ok boolean,
  hosted_ok boolean,
  rating_ok boolean,
  eligible boolean,
  pending_application boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      (select count(*) from public.trips t
        where t.status = 'completed'
          and (
            t.creator_id = auth.uid()
            or exists (
              select 1 from public.trip_members tm
              where tm.trip_id = t.id and tm.user_id = auth.uid() and tm.status = 'accepted'
            )
          )) as trips,
      (select count(*) from public.trips t
        where t.status = 'completed' and t.creator_id = auth.uid()) as hosted,
      (select verification_status = 'approved' from public.profiles where id = auth.uid()) as verified,
      (select avg(rating) from public.feedback where target_user_id = auth.uid()) as avg_rating,
      (select count(*) from public.feedback where target_user_id = auth.uid()) as rating_count,
      exists (select 1 from public.guild_leader_applications where user_id = auth.uid() and status = 'pending') as pending
  ),
  checks as (
    select *,
      trips >= 10 as trips_ok,
      hosted >= 2 as hosted_ok,
      rating_count >= 3 and coalesce(avg_rating, 0) >= 4 as rating_ok
    from me
  )
  select
    trips,
    hosted,
    coalesce(verified, false),
    round(avg_rating, 2),
    rating_count,
    trips_ok,
    hosted_ok,
    rating_ok,
    trips_ok and hosted_ok and rating_ok and coalesce(verified, false),
    pending
  from checks;
$$;

-- ---------------------------------------------------------------------
-- 2. chat_participants: read your rows (co-participant reads stay from
--    202609260001), leave non-guild threads, nothing else. Every writer
--    (direct threads, read receipts, guild sync) is security definer.
-- ---------------------------------------------------------------------
drop policy if exists "chat participants access" on public.chat_participants;

drop policy if exists "chat participants own read" on public.chat_participants;
create policy "chat participants own read" on public.chat_participants for select to authenticated
  using (user_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "chat participants leave" on public.chat_participants;
create policy "chat participants leave" on public.chat_participants for delete to authenticated
  using (
    (user_id = auth.uid()
      and not exists (select 1 from public.chat_threads t where t.id = thread_id and t.guild_id is not null))
    or public.is_staff_or_admin()
  );

revoke insert, update on public.chat_participants from authenticated;

-- ---------------------------------------------------------------------
-- 4a. Removal history, for the rejoin cooldown.
-- ---------------------------------------------------------------------
create table if not exists public.guild_removals (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  removed_by uuid references public.profiles(id) on delete set null,
  removed_at timestamptz not null default now()
);

create index if not exists guild_removals_lookup_idx on public.guild_removals(guild_id, user_id, removed_at desc);

alter table public.guild_removals enable row level security;
drop policy if exists "guild removals managers" on public.guild_removals;
create policy "guild removals managers" on public.guild_removals for select to authenticated
  using (user_id = auth.uid() or public.can_manage_guild(guild_id));
grant select on public.guild_removals to authenticated;
grant all on public.guild_removals to service_role;

-- Leader (and officers) of a guild, for request notifications.
create or replace function public.guild_manager_ids(p_guild_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select leader_id from public.guilds where id = p_guild_id
  union
  select user_id from public.guild_members where guild_id = p_guild_id and role = 'officer';
$$;

revoke all on function public.guild_manager_ids(uuid) from public, anon, authenticated;

-- Officers answer requests too, so they can read them (and get them live).
drop policy if exists "join requests own, leader or admin" on public.guild_join_requests;
create policy "join requests own, leader or admin" on public.guild_join_requests for select to authenticated
  using (user_id = auth.uid() or public.can_manage_guild(guild_id));

-- ---------------------------------------------------------------------
-- 3 + 4. join_guild: guild row locked, cooldowns, officers notified.
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

  -- Locked so two joins can't both take the last slot.
  select * into v_guild from public.guilds where id = p_guild_id for update;
  if v_guild.id is null then
    raise exception 'Guild not found';
  end if;

  if exists (
    select 1 from public.guild_removals
    where guild_id = p_guild_id and user_id = auth.uid() and removed_at > now() - interval '7 days'
  ) then
    raise exception 'You were removed from % recently. You can ask again after a week', v_guild.name;
  end if;

  v_block := public.guild_join_block_reason(v_guild, auth.uid());
  if v_block is not null then
    raise exception '%', v_block;
  end if;

  select display_name into v_name from public.profiles where id = auth.uid();

  if v_guild.join_policy = 'approval' then
    if exists (
      select 1 from public.guild_join_requests
      where guild_id = p_guild_id and user_id = auth.uid() and status = 'declined'
        and handled_at > now() - interval '24 hours'
    ) then
      raise exception '% declined your request recently. Try again tomorrow or ask another guild', v_guild.name;
    end if;
    if (select count(*) from public.guild_join_requests
        where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'Too many join requests. Try again in an hour';
    end if;

    update public.guild_join_requests
    set status = 'cancelled', handled_at = now(), handled_by = auth.uid()
    where user_id = auth.uid() and status = 'pending';

    insert into public.guild_join_requests (guild_id, user_id) values (p_guild_id, auth.uid());

    insert into public.notifications (user_id, type, title, message, data)
    select m, 'system', 'New join request',
      coalesce(v_name, 'A traveler') || ' wants to join ' || v_guild.name || '.',
      jsonb_build_object('guild_id', v_guild.id, 'route', '/guild')
    from public.guild_manager_ids(v_guild.id) m;
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

-- Same as 202610010015 with the guild row locked.
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

-- Same as 202610010007 with the guild row locked for the officer count.
create or replace function public.set_guild_officer(p_user_id uuid, p_officer boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
begin
  select g.* into v_guild
  from public.guild_members gm join public.guilds g on g.id = gm.guild_id
  where gm.user_id = p_user_id;

  if v_guild.id is null then
    raise exception 'They''re not in a guild';
  end if;
  if not (v_guild.leader_id = auth.uid() or public.current_user_role() = 'admin') then
    raise exception 'Only the Guild Leader can appoint officers';
  end if;
  if p_user_id = v_guild.leader_id then
    raise exception 'The leader can''t also be an officer';
  end if;

  perform 1 from public.guilds where id = v_guild.id for update;
  if p_officer and (select count(*) from public.guild_members where guild_id = v_guild.id and role = 'officer' and user_id <> p_user_id) >= 2 then
    raise exception 'A guild can have at most 2 officers';
  end if;

  update public.guild_members set role = case when p_officer then 'officer' else 'member' end
  where user_id = p_user_id;

  insert into public.notifications (user_id, type, title, message, data)
  values (p_user_id, 'system',
    case when p_officer then 'You''re now an officer!' else 'Officer role removed' end,
    case when p_officer
      then 'You can now answer join requests and post announcements for ' || v_guild.name || '.'
      else 'You''re back to a regular member of ' || v_guild.name || '.'
    end,
    jsonb_build_object('route', '/guild'));
end;
$$;

-- Same as 202610010001, plus the removal record for the cooldown.
create or replace function public.remove_guild_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
begin
  select g.* into v_guild
  from public.guild_members gm
  join public.guilds g on g.id = gm.guild_id
  where gm.user_id = p_user_id;

  if v_guild.id is null then
    return;
  end if;
  if not (v_guild.leader_id = auth.uid() or public.current_user_role() = 'admin') then
    raise exception 'Only this guild''s leader can remove members';
  end if;
  if p_user_id = v_guild.leader_id then
    raise exception 'The leader can''t be removed';
  end if;

  delete from public.guild_members where user_id = p_user_id;
  insert into public.guild_removals (guild_id, user_id, removed_by) values (v_guild.id, p_user_id, auth.uid());

  insert into public.notifications (user_id, type, title, message, data)
  values (p_user_id, 'system', 'Removed from guild',
    'You were removed from ' || v_guild.name || '. You can join another guild any time.',
    jsonb_build_object('route', '/guild'));
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Announcements: hidden from the table for everyone, served to
--    members (and admins) by RPC. New guilds columns need adding to the
--    column grant below to be readable.
-- ---------------------------------------------------------------------
revoke select on public.guilds from authenticated;
grant select (
  id, name, tagline, emblem, color, leader_id, created_at, updated_at,
  join_policy, min_rank, description, focus, areas
) on public.guilds to authenticated;

create or replace function public.get_guild_announcement(p_guild_id uuid)
returns table (announcement text, announcement_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select g.announcement, g.announcement_at
  from public.guilds g
  where g.id = p_guild_id
    and (
      public.is_admin()
      or g.leader_id = auth.uid()
      or exists (select 1 from public.guild_members gm where gm.guild_id = g.id and gm.user_id = auth.uid())
    );
$$;

grant execute on function public.get_guild_announcement(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. One guild XP number: leaderboard lifetime, member cap and the
--    guild_level mission all use it (the mission used to skip
--    mission_reward, so it lagged the level the app showed).
-- ---------------------------------------------------------------------
create or replace function public.guild_lifetime_xp(p_guild_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::bigint
  from public.guild_point_events
  where guild_id = p_guild_id and amount > 0 and reason <> 'redemption_refund';
$$;

grant execute on function public.guild_lifetime_xp(uuid) to authenticated;

create or replace function public.guild_member_cap(p_guild_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select least(50, 20 + 5 * (public.guild_lifetime_xp(p_guild_id) / 500))::int;
$$;

-- Same as 202610010009 except guild_level.
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

-- ---------------------------------------------------------------------
-- 7. Trip points need a real trip.
--    started_at is stamped by the server whenever a trip goes ongoing,
--    and a completed trip's type/destination are frozen (missions read
--    them).
-- ---------------------------------------------------------------------
alter table public.trips add column if not exists started_at timestamptz;

create or replace function public.guard_trip_progress_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.started_at := case when new.status = 'ongoing' then now() end;
    return new;
  end if;

  if new.status = 'ongoing' and old.status is distinct from 'ongoing' then
    new.started_at := now();
  else
    new.started_at := old.started_at;
  end if;

  if old.status = 'completed' and not public.is_admin()
    and (new.trip_type is distinct from old.trip_type or new.destination is distinct from old.destination) then
    raise exception 'A completed trip''s type and destination can''t be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_trip_progress_fields on public.trips;
create trigger guard_trip_progress_fields
before insert or update on public.trips
for each row execute function public.guard_trip_progress_fields();

-- Paid trips per user per Manila day.
create or replace function public.trip_points_capped(p_user_id uuid, p_reasons text[], p_limit int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) >= p_limit from public.guild_point_events
  where user_id = p_user_id and reason = any (p_reasons) and amount > 0
    and created_at >= (date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila');
$$;

revoke all on function public.trip_points_capped(uuid, text[], int) from public, anon, authenticated;

-- Same as 202610010001 plus: the trip has to have run 30+ minutes (trips
-- already ongoing before this migration have no started_at and still pay),
-- 3 paid trips a day per traveler, 10 member-trip bonuses a day per leader.
create or replace function public.guild_points_on_trip_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
  v_leader record;
  v_trip_reasons text[] := array['trip_completed', 'trip_hosted'];
begin
  if not (new.status = 'completed' and old.status = 'ongoing') then
    return new;
  end if;

  if new.started_at is not null and now() - new.started_at < interval '30 minutes' then
    return new;
  end if;

  if not exists (
    select 1 from public.trip_members tm
    where tm.trip_id = new.id and tm.status = 'accepted' and tm.user_id <> new.creator_id
  ) then
    return new;
  end if;

  if not public.trip_points_capped(new.creator_id, v_trip_reasons, 3) then
    perform public.award_guild_points(new.creator_id, 30, 'trip_hosted', 'trip:' || new.id, new.id, new.title);
  end if;

  for v_member in
    select tm.user_id from public.trip_members tm
    where tm.trip_id = new.id and tm.status = 'accepted' and tm.user_id <> new.creator_id
  loop
    if not public.trip_points_capped(v_member.user_id, v_trip_reasons, 3) then
      perform public.award_guild_points(v_member.user_id, 20, 'trip_completed', 'trip:' || new.id, new.id, new.title);
    end if;
  end loop;

  for v_leader in
    select distinct g.leader_id
    from public.guild_members gm
    join public.guilds g on g.id = gm.guild_id
    where gm.user_id in (
      select new.creator_id
      union
      select tm.user_id from public.trip_members tm where tm.trip_id = new.id and tm.status = 'accepted'
    )
  loop
    if not public.trip_points_capped(v_leader.leader_id, array['guild_trip_bonus'], 10) then
      perform public.award_guild_points(v_leader.leader_id, 5, 'guild_trip_bonus', 'trip:' || new.id, new.id, new.title);
    end if;
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Guild chat moderation: soft delete, so the UPDATE reaches every
--    member over realtime (RLS-filtered, unlike DELETE events).
-- ---------------------------------------------------------------------
alter table public.chat_messages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

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
    raise exception 'Only the sender, the Guild Leader or officers can delete this message';
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

-- ---------------------------------------------------------------------
-- 9. Leader self-service. Demoting yourself needs the profile guard to
--    allow guild_leader -> traveler; it only does so inside these RPCs
--    (the flag is transaction-local and clients can't set it).
--    Same as 202609290002 plus that one exception.
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id and not public.is_staff_or_admin() then
    if not (
      current_setting('partyup.leader_handover', true) = 'on'
      and old.role = 'guild_leader'
      and new.role = 'traveler'
    ) then
      new.role := old.role;
    end if;
    new.is_active := old.is_active;
    if not (
      current_setting('partyup.id_submission', true) = 'on'
      and old.verification_status in ('unverified', 'rejected')
      and new.verification_status = 'pending'
    ) then
      new.verification_status := old.verification_status;
    end if;
    if new.city is distinct from old.city
      and not (old.verification_status in ('unverified', 'rejected') or old.city is null) then
      new.city := old.city;
    end if;
    if not (old.verification_status in ('unverified', 'rejected') or old.last_name is null) then
      new.first_name := old.first_name;
      new.middle_name := old.middle_name;
      new.last_name := old.last_name;
      new.name_suffix := old.name_suffix;
    end if;
  end if;

  return new;
end;
$$;

-- The caller hands their guild to a member and stays on as a traveler.
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
  update public.guild_members set role = 'member' where user_id in (p_successor_id, auth.uid());
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

-- Step down: the officer with the most points takes over. Returns their name.
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
  join public.guild_members gm on gm.guild_id = g.id and gm.role = 'officer'
  join public.profiles p on p.id = gm.user_id
  where g.leader_id = auth.uid()
    and p.role = 'traveler' and p.is_active and p.verification_status = 'approved'
  order by public.guild_lifetime_points(gm.user_id) desc, gm.joined_at
  limit 1;

  if v_successor is null then
    raise exception 'Make someone an officer first, or pick a member with "Make leader"';
  end if;

  perform public.transfer_guild_leadership(v_successor);
  return (select display_name from public.profiles where id = v_successor);
end;
$$;

grant execute on function public.transfer_guild_leadership(uuid) to authenticated;
grant execute on function public.step_down_as_leader() to authenticated;

-- ---------------------------------------------------------------------
-- 10a. Suspended accounts drop off the boards and out of season medals.
-- ---------------------------------------------------------------------
create or replace function public.get_player_leaderboard(p_period text default 'week', p_limit int default 50)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  role text,
  guild_id uuid,
  guild_name text,
  guild_emblem text,
  guild_color text,
  points bigint,
  lifetime_points bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with earned as (
    select
      e.user_id,
      sum(e.amount) filter (where e.created_at >= public.guild_period_start(p_period)) as period_points,
      sum(e.amount) as all_points
    from public.guild_point_events e
    where e.amount > 0 and e.reason <> 'redemption_refund'
    group by e.user_id
  )
  select
    p.id, p.display_name, p.avatar_url, p.role,
    g.id, g.name, g.emblem, g.color,
    coalesce(earned.period_points, 0)::bigint,
    coalesce(earned.all_points, 0)::bigint
  from earned
  join public.profiles p on p.id = earned.user_id
  left join public.guild_members gm on gm.user_id = p.id
  left join public.guilds g on g.id = gm.guild_id
  where p.role in ('traveler', 'guild_leader')
    and p.is_active
    and coalesce(earned.period_points, 0) > 0
  order by 9 desc, 10 desc, p.display_name
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function public.get_guild_member_board(p_guild_id uuid, p_period text default 'all')
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  is_leader boolean,
  joined_at timestamptz,
  points bigint,
  lifetime_points bigint,
  member_role text
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
    ), 0)::bigint,
    gm.role
  from public.guild_members gm
  join public.guilds g on g.id = gm.guild_id
  join public.profiles p on p.id = gm.user_id
  where gm.guild_id = p_guild_id
    and (p.is_active or g.leader_id = gm.user_id)
  order by 6 desc, 7 desc, gm.joined_at;
$$;

-- Same as 202610010003 with suspended players skipped.
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
      and p.is_active
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

-- ---------------------------------------------------------------------
-- 10b. Coin balances are private: other people's summaries return null
--      coins (lifetime points and badges stay public).
-- ---------------------------------------------------------------------
create or replace function public.get_points_summary(p_user_id uuid default null)
returns table (
  user_id uuid,
  lifetime_points bigint,
  coins bigint,
  week_points bigint,
  month_points bigint,
  reason_counts jsonb,
  guild_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (select coalesce(p_user_id, auth.uid()) as id),
  earned as (
    select e.* from public.guild_point_events e, target
    where e.user_id = target.id
  )
  select
    target.id,
    coalesce((select sum(amount) from earned where amount > 0 and reason <> 'redemption_refund'), 0)::bigint,
    case when target.id = auth.uid() or public.is_admin()
      then coalesce((select sum(amount) from earned), 0)::bigint
    end,
    coalesce((select sum(amount) from earned where amount > 0 and reason <> 'redemption_refund'
      and created_at >= date_trunc('week', now())), 0)::bigint,
    coalesce((select sum(amount) from earned where amount > 0 and reason <> 'redemption_refund'
      and created_at >= date_trunc('month', now())), 0)::bigint,
    coalesce((select jsonb_object_agg(reason, n) from (
      select reason, count(*) as n from earned where amount > 0 group by reason
    ) c), '{}'::jsonb),
    (select gm.guild_id from public.guild_members gm where gm.user_id = target.id)
  from target;
$$;

commit;
