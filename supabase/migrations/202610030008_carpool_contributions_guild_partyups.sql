begin;

-- =====================================================================
-- 1. Carpool as fuel-sharing, ride-hailing style.
--    * The driver posts a route: coming from (origin pin), up to
--      (destination pin), departure time (start_at), main pickup point
--      (meetup_*), and stops along the way (route_stops) where they can
--      pick riders up.
--    * Riders don't instantly join: they pick a pickup stop and offer a
--      small fuel contribution within a suggested range. The driver
--      accepts or declines each request.
--    * PartyUp adds a 10% platform fee on top of the agreed contribution.
--
-- 2. Tour categories: tours pick one category, stored as the first
--    interest tag (so Browse/Discover filters keep working unchanged).
--
-- 3. Guild "Let's PartyUp": a guild leader posts a carpool or tour for
--    their guild (trips.guild_id). It stays out of public Browse, members
--    are notified, and only guild members can join or request a seat.
-- =====================================================================

alter table public.trips
  add column if not exists origin_lat numeric(10,7),
  add column if not exists origin_lng numeric(10,7),
  add column if not exists route_stops jsonb not null default '[]'::jsonb,
  add column if not exists guild_id uuid references public.guilds(id) on delete set null;

create index if not exists trips_guild_id_idx on public.trips(guild_id) where guild_id is not null;

alter table public.trip_members
  add column if not exists pickup_label text,
  add column if not exists pickup_lat numeric(10,7),
  add column if not exists pickup_lng numeric(10,7),
  add column if not exists offered_amount numeric(10,2) check (offered_amount is null or offered_amount > 0),
  add column if not exists platform_fee numeric(10,2) check (platform_fee is null or platform_fee >= 0);

alter table public.trips drop constraint if exists trips_interest_tags_valid;
alter table public.trips
  add constraint trips_interest_tags_valid check (
    interest_tags <@ array[
      'Hiking','Beaches','Museums','Food','Photography','History',
      'Nature','Shopping','Nightlife','Adventure','Art','Relaxation',
      -- Tour categories (lib/tours.ts TOUR_CATEGORIES)
      'Beach','Mountain & Hiking','Food Trip','Heritage & Churches',
      'Nature & Falls','City & Nightlife','Pilgrimage','Road Trip'
    ]::text[]
  );

-- ---------------------------------------------------------------------
-- Pricing helpers
-- ---------------------------------------------------------------------
create or replace function public.carpool_platform_fee_rate()
returns numeric
language sql
immutable
as $$ select 0.10::numeric $$;

-- Straight-line km between two points.
create or replace function public.haversine_km(p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
    else (2 * 6371 * asin(sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
    )))::numeric
  end;
$$;

-- Suggested fuel contribution for one rider picked up at (lat, lng):
--   road km ~= straight-line km x 1.3
--   fuel cost = km x P6.50 (P65/L at ~10 km/L)
--   shared by everyone in the car (rider seats + the driver)
-- The rider may offer anything from half to 1.5x the suggestion. These
-- constants are starting values for the capstone, not market rates.
create or replace function public.carpool_contribution_range(p_trip public.trips, p_lat numeric, p_lng numeric)
returns table (min_amount numeric, suggested_amount numeric, max_amount numeric)
language plpgsql
stable
as $$
declare
  v_km numeric;
  v_share_count int;
  v_suggested numeric;
begin
  v_km := public.haversine_km(p_lat, p_lng, p_trip.destination_lat, p_trip.destination_lng) * 1.3;
  v_share_count := coalesce(p_trip.seats_total, 3) + 1;

  if v_km is null then
    v_suggested := 100;
  else
    v_suggested := greatest(20, round((v_km * 6.5) / v_share_count / 5) * 5);
  end if;

  min_amount := greatest(10, round(v_suggested * 0.5));
  suggested_amount := v_suggested;
  max_amount := greatest(50, ceil(v_suggested * 1.5));
  return next;
end;
$$;

-- Pickup choices for a carpool: index 0 is the main pickup point, 1..n are
-- the driver's route stops in order.
create or replace function public.carpool_pickup_points(p_trip public.trips)
returns table (stop_index int, label text, lat numeric, lng numeric)
language sql
stable
as $$
  select 0, coalesce(p_trip.meetup_landmark || coalesce(', ' || p_trip.meetup_municipality, ''), p_trip.origin),
         p_trip.meetup_lat, p_trip.meetup_lng
  union all
  select s.ordinality::int, s.value ->> 'label', (s.value ->> 'lat')::numeric, (s.value ->> 'lng')::numeric
  from jsonb_array_elements(coalesce(p_trip.route_stops, '[]'::jsonb)) with ordinality as s(value, ordinality);
$$;

create or replace function public.is_guild_member_of(p_guild_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_guild_id is not null and (
    exists (select 1 from public.guild_members gm where gm.guild_id = p_guild_id and gm.user_id = auth.uid())
    or exists (select 1 from public.guilds g where g.id = p_guild_id and g.leader_id = auth.uid())
  );
$$;

grant execute on function public.is_guild_member_of(uuid) to authenticated;

-- Who may request a seat on (or join) a trip without an invite link.
create or replace function public.can_request_trip(p_trip public.trips)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_trip.guild_id is not null then public.is_guild_member_of(p_trip.guild_id)
    else p_trip.visibility = 'public'
  end;
$$;

-- Pickup stops plus the allowed offer range at each, for the request sheet.
create or replace function public.get_carpool_request_options(p_trip_id uuid)
returns table (
  stop_index int, label text, lat numeric, lng numeric,
  min_amount numeric, suggested_amount numeric, max_amount numeric,
  fee_rate numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
begin
  select * into v_trip from public.trips t where t.id = p_trip_id and t.trip_type = 'carpool';
  if v_trip.id is null or not (public.can_request_trip(v_trip) or public.is_trip_member(p_trip_id) or v_trip.creator_id = auth.uid()) then
    raise exception 'Trip not found';
  end if;

  return query
  select p.stop_index, p.label, p.lat, p.lng, r.min_amount, r.suggested_amount, r.max_amount, public.carpool_platform_fee_rate()
  from public.carpool_pickup_points(v_trip) p
  cross join lateral public.carpool_contribution_range(v_trip, p.lat, p.lng) r
  order by p.stop_index;
end;
$$;

grant execute on function public.get_carpool_request_options(uuid) to authenticated;

-- Rider asks for a seat with a pickup stop and a fuel contribution offer.
create or replace function public.request_carpool_seat(p_trip_id uuid, p_stop_index int, p_offer numeric)
returns public.trip_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_stop record;
  v_range record;
  v_existing public.trip_members;
  v_member public.trip_members;
  v_offer numeric(10,2);
  v_fee numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.profiles where id = auth.uid() and verification_status = 'approved') then
    raise exception 'You must complete ID verification before joining a trip';
  end if;

  select * into v_trip from public.trips t where t.id = p_trip_id and t.trip_type = 'carpool';
  if v_trip.id is null or not public.can_request_trip(v_trip) then
    raise exception 'Trip not found';
  end if;

  if v_trip.creator_id = auth.uid() then
    raise exception 'You created this trip';
  end if;

  if v_trip.status <> 'open' then
    raise exception 'This carpool is no longer accepting riders';
  end if;

  select * into v_stop from public.carpool_pickup_points(v_trip) p where p.stop_index = p_stop_index;
  if not found then
    raise exception 'Pick a pickup point on the driver''s route';
  end if;

  select * into v_range from public.carpool_contribution_range(v_trip, v_stop.lat, v_stop.lng);
  v_offer := round(coalesce(p_offer, 0), 2);
  if v_offer < v_range.min_amount or v_offer > v_range.max_amount then
    raise exception 'Offer between ₱% and ₱% for this pickup point', v_range.min_amount, v_range.max_amount;
  end if;
  v_fee := round(v_offer * public.carpool_platform_fee_rate(), 2);

  select tm.* into v_existing from public.trip_members tm where tm.trip_id = v_trip.id and tm.user_id = auth.uid();
  if v_existing.id is not null and v_existing.status in ('accepted', 'pending') then
    raise exception 'You already have a % seat on this carpool', case when v_existing.status = 'pending' then 'requested' else 'confirmed' end;
  end if;

  if v_existing.id is not null then
    -- Declined or left before: a fresh request replaces the old row.
    update public.trip_members
    set status = 'pending', member_role = 'member', joined_at = null,
        pickup_label = v_stop.label, pickup_lat = v_stop.lat, pickup_lng = v_stop.lng,
        offered_amount = v_offer, platform_fee = v_fee,
        payment_status = 'unpaid', payment_amount = null
    where id = v_existing.id
    returning * into v_member;
  else
    insert into public.trip_members (
      trip_id, user_id, member_role, status, pickup_label, pickup_lat, pickup_lng, offered_amount, platform_fee
    )
    values (v_trip.id, auth.uid(), 'member', 'pending', v_stop.label, v_stop.lat, v_stop.lng, v_offer, v_fee)
    returning * into v_member;
  end if;

  insert into public.notifications (user_id, type, title, message)
  values (
    v_trip.creator_id, 'trip', 'New seat request',
    (select display_name from public.profiles where id = auth.uid()) || ' offered ₱' || v_offer
      || ' for fuel on "' || v_trip.title || '", pickup at ' || v_stop.label || '. Accept or decline.'
  );

  return v_member;
end;
$$;

grant execute on function public.request_carpool_seat(uuid, int, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Joining: carpools go through request_carpool_seat now.
-- ---------------------------------------------------------------------
create or replace function public.join_public_trip(p_trip_id uuid)
returns table (trip_id uuid, member_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_existing public.trip_members;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.profiles where id = auth.uid() and verification_status = 'approved'
  ) then
    raise exception 'You must complete ID verification before joining a trip';
  end if;

  select * into v_trip from public.trips t where t.id = p_trip_id;
  if v_trip.id is null or not public.can_request_trip(v_trip) then
    raise exception 'Trip not found';
  end if;

  if v_trip.trip_type = 'carpool' then
    raise exception 'Request a seat and offer a fuel contribution to join this carpool';
  end if;

  if v_trip.creator_id = auth.uid() then
    raise exception 'You created this trip';
  end if;

  select tm.* into v_existing from public.trip_members tm where tm.trip_id = v_trip.id and tm.user_id = auth.uid();
  if v_existing.id is not null then
    return query select v_trip.id, v_existing.status;
    return;
  end if;

  if v_trip.status <> 'open' then
    raise exception 'This trip is no longer accepting participants';
  end if;

  if v_trip.seats_total is not null and coalesce(v_trip.seats_available, 0) <= 0 then
    raise exception 'This trip is full';
  end if;

  insert into public.trip_members (trip_id, user_id, member_role, status, joined_at)
  values (v_trip.id, auth.uid(), 'member', 'accepted', now());

  insert into public.notifications (user_id, type, title, message)
  values (
    v_trip.creator_id, 'trip', 'New participant joined',
    (select display_name from public.profiles where id = auth.uid()) || ' joined "' || v_trip.title || '".'
  );

  return query select v_trip.id, 'accepted'::text;
end;
$$;

grant execute on function public.join_public_trip(uuid) to authenticated;

-- Invite links: carpools always become a pending request, defaulting the
-- offer to the suggested contribution at the main pickup point (the rider
-- was invited by the driver or a rider, so the driver still decides).
create or replace function public.join_trip_via_invite(p_invite_code text, p_referrer_user_id uuid default null)
returns table (trip_id uuid, member_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_existing public.trip_members;
  v_referrer uuid;
  v_new_status text;
  v_stop record;
  v_range record;
  v_offer numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.profiles where id = auth.uid() and verification_status = 'approved'
  ) then
    raise exception 'You must complete ID verification before joining a trip';
  end if;

  select * into v_trip from public.trips t where t.invite_code = p_invite_code;
  if v_trip.id is null then
    raise exception 'Invite not found';
  end if;

  if v_trip.creator_id = auth.uid() then
    raise exception 'You created this trip';
  end if;

  select tm.* into v_existing from public.trip_members tm where tm.trip_id = v_trip.id and tm.user_id = auth.uid();
  if v_existing.id is not null then
    return query select v_trip.id, v_existing.status;
    return;
  end if;

  if v_trip.status <> 'open' then
    raise exception 'This trip is no longer accepting riders';
  end if;

  if v_trip.seats_total is not null and coalesce(v_trip.seats_available, 0) <= 0 then
    raise exception 'This trip is full';
  end if;

  v_referrer := null;
  if p_referrer_user_id is not null and exists (
    select 1 from public.trip_members tm where tm.trip_id = v_trip.id and tm.user_id = p_referrer_user_id and tm.status = 'accepted'
  ) then
    v_referrer := p_referrer_user_id;
  end if;

  if v_trip.trip_type = 'carpool' then
    v_new_status := 'pending';
    select * into v_stop from public.carpool_pickup_points(v_trip) p where p.stop_index = 0;
    select * into v_range from public.carpool_contribution_range(v_trip, v_stop.lat, v_stop.lng);
    v_offer := v_range.suggested_amount;

    insert into public.trip_members (
      trip_id, user_id, member_role, status, invited_by_user_id,
      pickup_label, pickup_lat, pickup_lng, offered_amount, platform_fee
    )
    values (
      v_trip.id, auth.uid(), 'member', 'pending', v_referrer,
      v_stop.label, v_stop.lat, v_stop.lng, v_offer, round(v_offer * public.carpool_platform_fee_rate(), 2)
    );
  else
    v_new_status := case when v_trip.visibility = 'public' and v_trip.guild_id is null then 'accepted' else 'pending' end;

    insert into public.trip_members (trip_id, user_id, member_role, status, invited_by_user_id, joined_at)
    values (v_trip.id, auth.uid(), 'member', v_new_status, v_referrer, case when v_new_status = 'accepted' then now() else null end);
  end if;

  insert into public.notifications (user_id, type, title, message)
  select
    v_trip.creator_id, 'trip',
    case when v_new_status = 'accepted' then 'New rider joined' else 'Join request received' end,
    (select display_name from public.profiles where id = auth.uid()) ||
      case when v_new_status = 'accepted' then ' joined your trip "' || v_trip.title || '".'
           else ' requested to join your trip "' || v_trip.title || '".' end;

  return query select v_trip.id, v_new_status;
end;
$$;

grant execute on function public.join_trip_via_invite(text, uuid) to authenticated;

-- Guild members join a guild tour in one tap (carpools use request_carpool_seat).
create or replace function public.join_guild_partyup(p_trip_id uuid)
returns table (trip_id uuid, member_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
begin
  select * into v_trip from public.trips t where t.id = p_trip_id and t.guild_id is not null;
  if v_trip.id is null or not public.is_guild_member_of(v_trip.guild_id) then
    raise exception 'PartyUp not found';
  end if;

  return query select * from public.join_public_trip(p_trip_id);
end;
$$;

grant execute on function public.join_guild_partyup(uuid) to authenticated;

-- Driver accepts/declines. Accepting locks the rider's fare: their offered
-- contribution plus the platform fee.
create or replace function public.respond_to_join_request(p_trip_member_id uuid, p_status text)
returns public.trip_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.trip_members;
  v_trip public.trips;
begin
  if p_status not in ('accepted', 'rejected') then
    raise exception 'Invalid status';
  end if;

  select tm.* into v_member from public.trip_members tm where tm.id = p_trip_member_id and tm.status = 'pending';
  if v_member.id is null then
    raise exception 'Join request not found';
  end if;

  select * into v_trip from public.trips where id = v_member.trip_id and creator_id = auth.uid();
  if v_trip.id is null then
    raise exception 'Not authorized';
  end if;

  if p_status = 'accepted' and v_trip.seats_total is not null and coalesce(v_trip.seats_available, 0) <= 0 then
    raise exception 'This trip is full';
  end if;

  update public.trip_members
  set status = p_status,
      joined_at = case when p_status = 'accepted' then now() else joined_at end,
      payment_amount = case
        when p_status = 'accepted' and offered_amount is not null then offered_amount + coalesce(platform_fee, 0)
        else payment_amount
      end
  where id = p_trip_member_id
  returning * into v_member;

  insert into public.notifications (user_id, type, title, message)
  values (
    v_member.user_id, 'trip',
    case when p_status = 'accepted' then 'Seat request accepted' else 'Seat request declined' end,
    case when p_status = 'accepted' then 'You''re in! The driver accepted your request for "' || v_trip.title || '"'
           || case when v_member.pickup_label is not null then '. Pickup: ' || v_member.pickup_label || '.' else '.' end
         else 'Your request to join "' || v_trip.title || '" was declined.' end
  );

  return v_member;
end;
$$;

grant execute on function public.respond_to_join_request(uuid, text) to authenticated;

-- Off-platform payment report: carpool riders owe their accepted offer + fee.
create or replace function public.report_payment(p_trip_id uuid, p_reference text default null)
returns public.trip_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.trip_members;
  v_trip public.trips;
  v_amount numeric(10,2);
  v_payment_id uuid;
begin
  select * into v_member from public.trip_members
    where trip_id = p_trip_id and user_id = auth.uid() and member_role = 'member' and status = 'accepted';
  if v_member.id is null then
    raise exception 'You are not an accepted rider on this trip';
  end if;

  select * into v_trip from public.trips where id = p_trip_id;
  v_amount := coalesce(
    v_member.offered_amount + coalesce(v_member.platform_fee, 0),
    v_trip.price_per_person, v_trip.total_cost, 0
  );

  insert into public.payment_history (user_id, trip_id, trip_member_id, amount, currency, status, reference)
  values (auth.uid(), p_trip_id, v_member.id, v_amount, 'PHP', 'pending', nullif(trim(coalesce(p_reference, '')), ''))
  returning id into v_payment_id;

  update public.trip_members
  set payment_status = 'pending',
      payment_amount = v_amount,
      payment_reference = nullif(trim(coalesce(p_reference, '')), ''),
      payment_reported_at = now(),
      last_payment_id = v_payment_id
  where id = v_member.id
  returning * into v_member;

  insert into public.notifications (user_id, type, title, message)
  values (
    v_trip.creator_id, 'trip', 'Payment reported',
    (select display_name from public.profiles where id = auth.uid()) || ' reported a payment of ₱' || v_amount || ' for "' || v_trip.title || '". Confirm once received.'
  );

  return v_member;
end;
$$;

grant execute on function public.report_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- create_trip: route fields for carpools, guild PartyUps.
-- ---------------------------------------------------------------------
drop function if exists public.create_trip(
  text, text, text, timestamptz, timestamptz, text, int, numeric, text, numeric, numeric, text, numeric, int, text[], jsonb, uuid,
  text, text, numeric, numeric
);

create function public.create_trip(
  p_title text,
  p_origin text,
  p_destination text,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_visibility text default 'public',
  p_seats_total int default null,
  p_total_cost numeric default null,
  p_notes text default null,
  p_destination_lat numeric default null,
  p_destination_lng numeric default null,
  p_trip_type text default 'carpool',
  p_price_per_person numeric default null,
  p_duration_days int default null,
  p_interests text[] default '{}',
  p_itinerary jsonb default '[]'::jsonb,
  p_vehicle_id uuid default null,
  p_meetup_municipality text default null,
  p_meetup_landmark text default null,
  p_meetup_lat numeric default null,
  p_meetup_lng numeric default null,
  p_origin_lat numeric default null,
  p_origin_lng numeric default null,
  p_route_stops jsonb default '[]'::jsonb,
  p_guild_id uuid default null
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_code text;
  v_member_role text;
  v_end_at timestamptz;
  v_day jsonb;
  v_stop jsonb;
  v_visibility text;
  v_guild public.guilds;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.profiles where id = auth.uid() and verification_status = 'approved'
  ) then
    raise exception 'You must complete ID verification before creating a trip';
  end if;

  if p_trip_type not in ('carpool', 'tour') then
    raise exception 'Invalid trip type';
  end if;

  if p_trip_type = 'carpool' then
    if p_vehicle_id is null then
      raise exception 'Select a vehicle before creating a carpool trip';
    end if;
    if not exists (
      select 1 from public.vehicles
      where id = p_vehicle_id and user_id = auth.uid() and verification_status = 'approved'
    ) then
      raise exception 'Selected vehicle is not an approved vehicle on your account';
    end if;
  end if;

  if p_visibility not in ('public', 'trusted_circle', 'private') then
    raise exception 'Invalid visibility';
  end if;
  v_visibility := p_visibility;

  -- Guild PartyUp: leader only, hidden from public Browse.
  if p_guild_id is not null then
    select * into v_guild from public.guilds g where g.id = p_guild_id and g.leader_id = auth.uid();
    if v_guild.id is null then
      raise exception 'Only the guild leader can post a PartyUp for this guild';
    end if;
    v_visibility := 'private';
  end if;

  if trim(coalesce(p_title, '')) = '' or trim(coalesce(p_origin, '')) = '' or trim(coalesce(p_destination, '')) = '' then
    raise exception 'Title, origin, and destination are required';
  end if;

  if (p_meetup_lat is null) <> (p_meetup_lng is null) or (p_origin_lat is null) <> (p_origin_lng is null) then
    raise exception 'Map pins need both latitude and longitude';
  end if;

  if p_meetup_municipality is not null
    and p_meetup_municipality <> 'Outside Bulacan'
    and not (p_meetup_municipality = any (public.bulacan_municipalities())) then
    raise exception 'Invalid meetup municipality';
  end if;

  if jsonb_typeof(coalesce(p_route_stops, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_route_stops, '[]'::jsonb)) > 8 then
    raise exception 'Add up to 8 stops along your route';
  end if;
  for v_stop in select * from jsonb_array_elements(coalesce(p_route_stops, '[]'::jsonb)) loop
    if trim(coalesce(v_stop ->> 'label', '')) = ''
      or (v_stop ->> 'lat') is null or (v_stop ->> 'lng') is null
      or (v_stop ->> 'lat')::numeric not between -90 and 90
      or (v_stop ->> 'lng')::numeric not between -180 and 180 then
      raise exception 'Each route stop needs a name and a map pin';
    end if;
  end loop;

  if p_trip_type = 'tour' and (p_duration_days is null or p_duration_days <= 0) then
    raise exception 'Duration (in days) is required for tours';
  end if;

  v_end_at := p_end_at;
  if p_trip_type = 'tour' and p_end_at is null and p_start_at is not null and p_duration_days is not null then
    v_end_at := p_start_at + ((p_duration_days - 1) || ' days')::interval;
  end if;

  v_member_role := case when p_trip_type = 'tour' then 'coordinator' else 'driver' end;

  loop
    v_code := public.generate_invite_code();
    exit when not exists (select 1 from public.trips where invite_code = v_code);
  end loop;

  insert into public.trips (
    creator_id, title, trip_type, origin, destination, start_at, end_at,
    status, visibility, seats_total, seats_available, total_cost, price_per_person,
    invite_code, notes, destination_lat, destination_lng, duration_days, interest_tags, vehicle_id,
    meetup_municipality, meetup_landmark, meetup_lat, meetup_lng,
    origin_lat, origin_lng, route_stops, guild_id
  )
  values (
    auth.uid(), trim(p_title), p_trip_type, trim(p_origin), trim(p_destination), p_start_at, v_end_at,
    'open', v_visibility, p_seats_total, p_seats_total,
    -- Carpools are priced per rider by their accepted offers now.
    case when p_trip_type = 'tour' then p_total_cost else null end,
    case when p_trip_type = 'tour' then p_price_per_person else null end,
    v_code, nullif(trim(coalesce(p_notes, '')), ''), p_destination_lat, p_destination_lng,
    p_duration_days, coalesce(p_interests, '{}'), p_vehicle_id,
    p_meetup_municipality, nullif(trim(coalesce(p_meetup_landmark, '')), ''), p_meetup_lat, p_meetup_lng,
    p_origin_lat, p_origin_lng,
    case when p_trip_type = 'carpool' then coalesce(p_route_stops, '[]'::jsonb) else '[]'::jsonb end,
    p_guild_id
  )
  returning * into v_trip;

  insert into public.trip_members (trip_id, user_id, member_role, status, joined_at)
  values (v_trip.id, auth.uid(), v_member_role, 'accepted', now());

  if p_trip_type = 'tour' and jsonb_typeof(p_itinerary) = 'array' then
    for v_day in select * from jsonb_array_elements(p_itinerary) loop
      insert into public.trip_itinerary_days (trip_id, day_number, description)
      values (
        v_trip.id,
        (v_day ->> 'day_number')::int,
        trim(coalesce(v_day ->> 'description', ''))
      );
    end loop;
  end if;

  if v_guild.id is not null then
    insert into public.notifications (user_id, type, title, message)
    select gm.user_id, 'trip', 'Let''s PartyUp! ' || v_guild.name,
      'Your guild leader posted a ' || case when p_trip_type = 'tour' then 'tour' else 'carpool' end
        || ': "' || v_trip.title || '" to ' || v_trip.destination || '. Open your guild to join.'
    from public.guild_members gm
    where gm.guild_id = v_guild.id and gm.user_id <> auth.uid();
  end if;

  select * into v_trip from public.trips where id = v_trip.id;
  return v_trip;
end;
$$;

grant execute on function public.create_trip(
  text, text, text, timestamptz, timestamptz, text, int, numeric, text, numeric, numeric, text, numeric, int, text[], jsonb, uuid,
  text, text, numeric, numeric, numeric, numeric, jsonb, uuid
) to authenticated;

-- Upcoming PartyUps for a guild, visible to its members.
create or replace function public.list_guild_partyups(p_guild_id uuid)
returns table (
  id uuid, title text, trip_type text, origin text, destination text,
  start_at timestamptz, duration_days int, status text,
  seats_total int, seats_available int, rider_count int,
  price_per_person numeric, interest_tags text[],
  creator_id uuid, my_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_guild_member_of(p_guild_id) and not public.is_admin() then
    raise exception 'Guild not found';
  end if;

  return query
  select
    t.id, t.title, t.trip_type, t.origin, t.destination, t.start_at, t.duration_days, t.status,
    t.seats_total, t.seats_available,
    (select count(*) from public.trip_members rm where rm.trip_id = t.id and rm.member_role = 'member' and rm.status = 'accepted')::int,
    t.price_per_person, t.interest_tags, t.creator_id,
    case when t.creator_id = auth.uid() then 'creator' else my_tm.status end
  from public.trips t
  left join public.trip_members my_tm on my_tm.trip_id = t.id and my_tm.user_id = auth.uid()
  where t.guild_id = p_guild_id
    and t.status in ('open', 'full', 'ongoing')
  order by t.start_at nulls last, t.created_at desc;
end;
$$;

grant execute on function public.list_guild_partyups(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Detail + members expose the new fields. Riders with a pending request
-- can open the trip too (to see their request status).
-- ---------------------------------------------------------------------
drop function if exists public.get_trip_detail(uuid);

create function public.get_trip_detail(p_trip_id uuid)
returns table (
  id uuid, title text, trip_type text, origin text, destination text,
  start_at timestamptz, end_at timestamptz, duration_days int,
  status text, visibility text, seats_total int, seats_available int, notes text,
  total_cost numeric, price_per_person numeric, rider_count int, interest_tags text[],
  invite_code text,
  driver_id uuid, driver_display_name text, driver_avatar_url text,
  driver_gcash_handle text, driver_paymaya_handle text,
  is_driver boolean, my_status text, my_payment_status text, my_payment_amount numeric,
  my_payment_channel text, my_invited_by_display_name text,
  meetup_municipality text, meetup_landmark text, meetup_lat numeric, meetup_lng numeric,
  destination_lat numeric, destination_lng numeric,
  origin_lat numeric, origin_lng numeric, route_stops jsonb, guild_id uuid,
  my_pickup_label text, my_offered_amount numeric, my_platform_fee numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (
        t.creator_id = auth.uid()
        or public.is_trip_member(p_trip_id)
        or exists (select 1 from public.trip_members tm where tm.trip_id = t.id and tm.user_id = auth.uid() and tm.status = 'pending')
        or public.is_staff_or_admin()
      )
  ) then
    raise exception 'Trip not found';
  end if;

  return query
  select
    t.id, t.title, t.trip_type, t.origin, t.destination, t.start_at, t.end_at, t.duration_days,
    t.status, t.visibility, t.seats_total, t.seats_available, t.notes,
    t.total_cost, t.price_per_person,
    (select count(*) from public.trip_members rm where rm.trip_id = t.id and rm.member_role = 'member' and rm.status = 'accepted')::int,
    t.interest_tags,
    t.invite_code,
    d.id, d.display_name, d.avatar_url, d.gcash_handle, d.paymaya_handle,
    (t.creator_id = auth.uid()),
    my_tm.status,
    my_tm.payment_status,
    my_tm.payment_amount,
    my_tm.payment_channel,
    inviter.display_name,
    t.meetup_municipality, t.meetup_landmark, t.meetup_lat, t.meetup_lng,
    t.destination_lat, t.destination_lng,
    t.origin_lat, t.origin_lng, t.route_stops, t.guild_id,
    my_tm.pickup_label, my_tm.offered_amount, my_tm.platform_fee
  from public.trips t
  join public.profiles d on d.id = t.creator_id
  left join public.trip_members my_tm on my_tm.trip_id = t.id and my_tm.user_id = auth.uid()
  left join public.profiles inviter on inviter.id = my_tm.invited_by_user_id
  where t.id = p_trip_id;
end;
$$;

grant execute on function public.get_trip_detail(uuid) to authenticated;

drop function if exists public.list_trip_members(uuid);

create function public.list_trip_members(p_trip_id uuid)
returns table (
  id uuid, user_id uuid, display_name text, avatar_url text, member_role text, status text,
  invited_by_user_id uuid, invited_by_display_name text,
  payment_status text, payment_amount numeric, payment_reference text,
  payment_channel text, payment_intent_id text,
  payment_reported_at timestamptz, payment_confirmed_at timestamptz,
  joined_at timestamptz, created_at timestamptz,
  pickup_label text, offered_amount numeric, platform_fee numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (t.creator_id = auth.uid() or public.is_trip_member(p_trip_id) or public.is_staff_or_admin())
  ) then
    raise exception 'Trip not found';
  end if;

  return query
  select
    tm.id, tm.user_id, p.display_name, p.avatar_url, tm.member_role, tm.status,
    tm.invited_by_user_id, inviter.display_name,
    tm.payment_status, tm.payment_amount, tm.payment_reference,
    tm.payment_channel, tm.payment_intent_id,
    tm.payment_reported_at, tm.payment_confirmed_at, tm.joined_at, tm.created_at,
    tm.pickup_label, tm.offered_amount, tm.platform_fee
  from public.trip_members tm
  join public.profiles p on p.id = tm.user_id
  left join public.profiles inviter on inviter.id = tm.invited_by_user_id
  where tm.trip_id = p_trip_id
    and tm.status <> 'left'
  order by
    case tm.member_role when 'driver' then 0 else 1 end,
    case tm.status when 'pending' then 0 else 1 end,
    tm.joined_at nulls last,
    tm.created_at;
end;
$$;

grant execute on function public.list_trip_members(uuid) to authenticated;

commit;
