begin;

-- =====================================================================
-- ID and vehicle verification is the admins' job now. Guild Leaders lead
-- guilds; they don't review documents. This takes back the narrow review
-- grants from 202610010006 and gives leaders guild-based points instead.
-- =====================================================================

-- 1. Reviews: admins only.
drop policy if exists "id verifications leader read" on public.id_verifications;
drop policy if exists "vehicles leader read" on public.vehicles;
drop policy if exists "id verifications storage leader read" on storage.objects;
drop policy if exists "vehicle verifications storage leader read" on storage.objects;

-- Leaders still see who's in an active SOS (the SOS map), nothing else.
drop policy if exists "profiles leader read" on public.profiles;
create policy "profiles leader read" on public.profiles for select to authenticated
  using (
    public.is_guild_leader_or_admin()
    and exists (select 1 from public.sos_alerts s where s.user_id = profiles.id and s.status = 'active')
  );

create or replace function public.review_id_verification(
  p_verification_id uuid,
  p_decision text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review ID verifications';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  select user_id into v_user_id
  from public.id_verifications
  where id = p_verification_id
  for update;

  if v_user_id is null then
    raise exception 'Verification not found';
  end if;

  update public.id_verifications
  set
    status = p_decision,
    reviewer_id = auth.uid(),
    reviewer_notes = p_notes,
    reviewed_at = now()
  where id = p_verification_id;

  update public.profiles
  set verification_status = p_decision
  where id = v_user_id;

  insert into public.notifications (user_id, type, title, message)
  values (
    v_user_id,
    'system',
    case when p_decision = 'approved' then 'ID verification approved' else 'ID verification rejected' end,
    case
      when p_decision = 'approved' then 'Your identity has been verified. You can now create and join trips!'
      else coalesce('Your ID verification was rejected: ' || p_notes, 'Your ID verification was rejected. Please resubmit with clearer documents.')
    end
  );
end;
$$;

create or replace function public.review_vehicle_verification(
  p_vehicle_id uuid,
  p_decision text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review vehicle verifications';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  select user_id into v_user_id
  from public.vehicles
  where id = p_vehicle_id
  for update;

  if v_user_id is null then
    raise exception 'Vehicle not found';
  end if;

  update public.vehicles
  set
    verification_status = p_decision,
    reviewer_id = auth.uid(),
    reviewer_notes = p_notes,
    reviewed_at = now()
  where id = p_vehicle_id;

  insert into public.notifications (user_id, type, title, message)
  values (
    v_user_id,
    'system',
    case when p_decision = 'approved' then 'Vehicle verification approved' else 'Vehicle verification rejected' end,
    case
      when p_decision = 'approved' then 'Your vehicle has been verified. You can now use it to create carpool trips!'
      else coalesce('Your vehicle verification was rejected: ' || p_notes, 'Your vehicle verification was rejected. Please resubmit clearer photos.')
    end
  );
end;
$$;

create or replace function public.guard_vehicle_verification_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verification_status <> 'unverified' then
      raise exception 'New vehicles must start as unverified';
    end if;
    return new;
  end if;

  if old.verification_status in ('pending', 'approved') and (
    new.make is distinct from old.make
    or new.model is distinct from old.model
    or new.year is distinct from old.year
    or new.color is distinct from old.color
    or new.plate_number is distinct from old.plate_number
    or new.ownership_type is distinct from old.ownership_type
    or new.exterior_image_path is distinct from old.exterior_image_path
    or new.orcr_image_path is distinct from old.orcr_image_path
    or new.plate_image_path is distinct from old.plate_image_path
    or new.authorization_letter_path is distinct from old.authorization_letter_path
    or new.owner_id_front_path is distinct from old.owner_id_front_path
    or new.owner_id_back_path is distinct from old.owner_id_back_path
    or new.owner_signatures_path is distinct from old.owner_signatures_path
  ) then
    raise exception 'This vehicle can''t be edited while it is under review or verified';
  end if;

  if new.verification_status is distinct from old.verification_status
    and not (old.verification_status in ('unverified', 'rejected') and new.verification_status = 'pending') then
    raise exception 'Only admins can change a vehicle''s verification status';
  end if;

  if new.reviewer_id is distinct from old.reviewer_id
    or new.reviewer_notes is distinct from old.reviewer_notes
    or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Only admins can change review details';
  end if;

  return new;
end;
$$;

-- Leaders can't review anymore, so the leader-review guardrails go.
drop trigger if exists guard_leader_review_conflict_id on public.id_verifications;
drop trigger if exists guard_leader_review_conflict_vehicle on public.vehicles;
drop function if exists public.guard_leader_review_conflict();

-- =====================================================================
-- 2. Leaders earn from leading: +5 when someone new joins their guild.
--    Once per person per guild, so kick-and-rejoin can't farm it.
-- =====================================================================
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
    'id_verified', 'redemption', 'redemption_refund', 'admin_adjustment', 'mission_reward',
    'review_overturned', 'guild_recruit'
  ));

create or replace function public.guild_points_on_new_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
begin
  select * into v_guild from public.guilds where id = new.guild_id;
  if v_guild.id is not null and new.user_id <> v_guild.leader_id then
    perform public.award_guild_points(v_guild.leader_id, 5, 'guild_recruit',
      'recruit:' || v_guild.id || ':' || new.user_id, new.user_id,
      (select display_name from public.profiles where id = new.user_id));
  end if;
  return new;
end;
$$;

drop trigger if exists guild_points_new_member on public.guild_members;
create trigger guild_points_new_member
after insert on public.guild_members
for each row execute function public.guild_points_on_new_member();

-- =====================================================================
-- 3. Missions: review missions out, leadership missions in.
-- =====================================================================
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
      select floor(coalesce(sum(amount), 0) / 500.0) + 1 into v_count from public.guild_point_events
      where guild_id = coalesce(v_led_guild, v_guild_id) and amount > 0 and reason not in ('redemption_refund', 'mission_reward');
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

update public.guild_missions set is_active = false
where key in ('lw_reviews_5', 'lm_reviews_20', 'ms_reviews_10', 'ms_reviews_50', 'ms_reviews_150');

insert into public.guild_missions (key, category, audience, metric, target, reward, title, description, icon, chain, step, needs_guild, sort) values
  ('lw_recruit_1',   'weekly',    'guild_leader', 'recruits',            1,   25, 'Fresh Blood',       'Welcome a new member to your guild this week',     'user-plus', null, 1, false, 15),
  ('lw_requests_3',  'weekly',    'guild_leader', 'requests_answered',   3,   20, 'Open Doors',        'Answer 3 join requests this week',                  'flag',      null, 1, false, 16),
  ('lw_announce_1',  'weekly',    'guild_leader', 'announcements',       1,   10, 'Town Crier',        'Post a guild announcement this week',               'message',   null, 1, false, 17),
  ('lm_guild_1500',  'monthly',   'guild_leader', 'guild_points',     1500,  100, 'Guild Powerhouse',  'Your guild earns 1,500 pts this month',             'trophy',    null, 1, true,  35),
  ('ms_recruit_5',   'milestone', 'guild_leader', 'recruits',            5,   50, 'Recruiter I',       'Welcome 5 members to your guild',                   'user-plus', 'recruiter', 1, false, 54),
  ('ms_recruit_15',  'milestone', 'guild_leader', 'recruits',           15,  120, 'Recruiter II',      'Welcome 15 members to your guild',                  'user-plus', 'recruiter', 2, false, 54),
  ('ms_recruit_40',  'milestone', 'guild_leader', 'recruits',           40,  250, 'Recruiter III',     'Welcome 40 members to your guild',                  'user-plus', 'recruiter', 3, false, 54)
on conflict (key) do update set
  category = excluded.category, audience = excluded.audience, metric = excluded.metric, target = excluded.target,
  reward = excluded.reward, title = excluded.title, description = excluded.description, icon = excluded.icon,
  chain = excluded.chain, step = excluded.step, needs_guild = excluded.needs_guild, sort = excluded.sort, is_active = true;

-- Monthly "Recruiter" now counts the same recruit points the chain does.
update public.guild_missions set title = 'Recruitment Drive' where key = 'lm_recruit_3';

-- =====================================================================
-- 4. Scorecards: how each leader's guild is doing.
-- =====================================================================
drop function if exists public.get_leader_scorecards();

create function public.get_leader_scorecards()
returns table (
  user_id uuid,
  display_name text,
  guild_id uuid,
  guild_name text,
  member_count bigint,
  new_members_30d bigint,
  member_trips_30d bigint,
  guild_points_30d bigint,
  pending_requests bigint,
  avg_response_hours numeric,
  lifetime_points bigint,
  last_active timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.display_name, g.id, g.name,
    (select count(*) from public.guild_members gm where gm.guild_id = g.id),
    (select count(*) from public.guild_members gm where gm.guild_id = g.id and gm.user_id <> p.id and gm.joined_at >= now() - interval '30 days'),
    (select count(*) from public.guild_point_events e where e.guild_id = g.id and e.reason in ('trip_completed', 'trip_hosted') and e.created_at >= now() - interval '30 days'),
    (select coalesce(sum(e.amount), 0) from public.guild_point_events e where e.guild_id = g.id and e.amount > 0
      and e.reason not in ('redemption_refund', 'mission_reward') and e.created_at >= now() - interval '30 days')::bigint,
    (select count(*) from public.guild_join_requests r where r.guild_id = g.id and r.status = 'pending'),
    (select round(avg(extract(epoch from (r.handled_at - r.created_at)) / 3600.0)::numeric, 1)
      from public.guild_join_requests r
      where r.guild_id = g.id and r.status in ('accepted', 'declined') and r.handled_at >= now() - interval '30 days'),
    public.guild_lifetime_points(p.id),
    (select max(created_at) from public.guild_point_events e where e.user_id = p.id)
  from public.profiles p
  left join public.guilds g on g.leader_id = p.id
  where public.is_admin() and p.role = 'guild_leader'
  order by 8 desc nulls last, p.display_name;
$$;

grant execute on function public.get_leader_scorecards() to authenticated;

commit;
