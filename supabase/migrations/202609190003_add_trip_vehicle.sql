begin;

alter table public.trips add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
create index if not exists trips_vehicle_id_idx on public.trips(vehicle_id);

-- create_trip's signature is changing (one new trailing param), so the old
-- overload must be dropped rather than replaced in place.
drop function if exists public.create_trip(
  text, text, text, timestamptz, timestamptz, text, int, numeric, text, numeric, numeric, text, numeric, int, text[], jsonb
);

create or replace function public.create_trip(
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
  p_vehicle_id uuid default null
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

  if p_trip_type = 'tour' and (p_duration_days is null or p_duration_days <= 0) then
    raise exception 'Duration (in days) is required for tours';
  end if;

  v_end_at := p_end_at;
  if p_trip_type = 'tour' and p_end_at is null and p_start_at is not null and p_duration_days is not null then
    v_end_at := p_start_at + ((p_duration_days - 1) || ' days')::interval;
  end if;

  v_member_role := case when p_trip_type = 'tour' then 'coordinator' else 'driver' end;

  loop
    v_code := encode(gen_random_bytes(5), 'hex');
    exit when not exists (select 1 from public.trips where invite_code = v_code);
  end loop;

  insert into public.trips (
    creator_id, title, trip_type, origin, destination, start_at, end_at,
    status, visibility, seats_total, seats_available, total_cost, price_per_person,
    invite_code, notes, destination_lat, destination_lng, duration_days, interest_tags, vehicle_id
  )
  values (
    auth.uid(), trim(p_title), p_trip_type, trim(p_origin), trim(p_destination), p_start_at, v_end_at,
    'open', p_visibility, p_seats_total, p_seats_total, p_total_cost,
    case when p_trip_type = 'tour' then p_price_per_person else null end,
    v_code, nullif(trim(coalesce(p_notes, '')), ''), p_destination_lat, p_destination_lng,
    p_duration_days, coalesce(p_interests, '{}'), p_vehicle_id
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
  text, text, text, timestamptz, timestamptz, text, int, numeric, text, numeric, numeric, text, numeric, int, text[], jsonb, uuid
) to authenticated;

commit;
