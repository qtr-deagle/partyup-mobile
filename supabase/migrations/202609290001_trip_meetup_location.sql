begin;

-- Exact meetup point for carpools and tours. Before this, "origin" / "meeting
-- point" was free text only, so riders had to guess where to go. Now the
-- creator picks a municipality, drops a pin, and names a landmark; trip
-- members see the pin (and each other, near meetup time) on a map.
--
-- trips.origin stays the human-readable label ("Jollibee MacArthur, Malolos")
-- so every existing list screen keeps working unchanged.
alter table public.trips
  add column if not exists meetup_municipality text,
  add column if not exists meetup_landmark text,
  add column if not exists meetup_lat numeric(10,7),
  add column if not exists meetup_lng numeric(10,7);

alter table public.trips drop constraint if exists trips_meetup_coords_check;
alter table public.trips
  add constraint trips_meetup_coords_check check (
    (meetup_lat is null and meetup_lng is null)
    or (meetup_lat between -90 and 90 and meetup_lng between -180 and 180)
  );

drop function if exists public.create_trip(
  text, text, text, timestamptz, timestamptz, text, int, numeric, text, numeric, numeric, text, numeric, int, text[], jsonb, uuid
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
  p_meetup_lng numeric default null
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

  if trim(coalesce(p_title, '')) = '' or trim(coalesce(p_origin, '')) = '' or trim(coalesce(p_destination, '')) = '' then
    raise exception 'Title, origin, and destination are required';
  end if;

  if (p_meetup_lat is null) <> (p_meetup_lng is null) then
    raise exception 'Meetup pin needs both latitude and longitude';
  end if;

  if p_meetup_municipality is not null
    and p_meetup_municipality <> 'Outside Bulacan'
    and not (p_meetup_municipality = any (public.bulacan_municipalities())) then
    raise exception 'Invalid meetup municipality';
  end if;

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
    meetup_municipality, meetup_landmark, meetup_lat, meetup_lng
  )
  values (
    auth.uid(), trim(p_title), p_trip_type, trim(p_origin), trim(p_destination), p_start_at, v_end_at,
    'open', p_visibility, p_seats_total, p_seats_total, p_total_cost,
    case when p_trip_type = 'tour' then p_price_per_person else null end,
    v_code, nullif(trim(coalesce(p_notes, '')), ''), p_destination_lat, p_destination_lng,
    p_duration_days, coalesce(p_interests, '{}'), p_vehicle_id,
    p_meetup_municipality, nullif(trim(coalesce(p_meetup_landmark, '')), ''), p_meetup_lat, p_meetup_lng
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

  select * into v_trip from public.trips where id = v_trip.id;
  return v_trip;
end;
$$;

grant execute on function public.create_trip(
  text, text, text, timestamptz, timestamptz, text, int, numeric, text, numeric, numeric, text, numeric, int, text[], jsonb, uuid,
  text, text, numeric, numeric
) to authenticated;

-- Adds the meetup columns. Also restores trip_type / duration_days /
-- interest_tags, which 202609150002 accidentally dropped when it rebuilt this
-- function from the older carpool-only version.
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
  destination_lat numeric, destination_lng numeric
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
    t.destination_lat, t.destination_lng
  from public.trips t
  join public.profiles d on d.id = t.creator_id
  left join public.trip_members my_tm on my_tm.trip_id = t.id and my_tm.user_id = auth.uid()
  left join public.profiles inviter on inviter.id = my_tm.invited_by_user_id
  where t.id = p_trip_id;
end;
$$;

grant execute on function public.get_trip_detail(uuid) to authenticated;

-- Live positions of the other accepted members, so everyone can see who is
-- already at (or heading to) the meetup point. Only shared from 12 hours
-- before meetup until the trip ends, only for fresh (app-open) locations,
-- and never for anyone in ghost mode (current_locations.is_visible = false).
create or replace function public.get_trip_member_locations(p_trip_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  member_role text,
  latitude numeric,
  longitude numeric,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
begin
  select * into v_trip from public.trips t where t.id = p_trip_id;

  if v_trip.id is null
    or not (v_trip.creator_id = auth.uid() or public.is_trip_member(p_trip_id)) then
    raise exception 'Trip not found';
  end if;

  if v_trip.status not in ('open', 'full', 'ongoing')
    or (v_trip.start_at is not null and v_trip.status <> 'ongoing' and now() < v_trip.start_at - interval '12 hours') then
    return;
  end if;

  return query
  select tm.user_id, p.display_name, p.avatar_url, tm.member_role, cl.latitude, cl.longitude, cl.updated_at
  from public.trip_members tm
  join public.profiles p on p.id = tm.user_id
  join public.current_locations cl on cl.user_id = tm.user_id
  where tm.trip_id = p_trip_id
    and tm.status = 'accepted'
    and tm.user_id <> auth.uid()
    and cl.is_visible
    and cl.updated_at > now() - interval '15 minutes'
    and not public.is_blocked_between(auth.uid(), tm.user_id);
end;
$$;

grant execute on function public.get_trip_member_locations(uuid) to authenticated;

commit;
