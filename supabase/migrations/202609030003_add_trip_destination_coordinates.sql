begin;

alter table public.trips
  add column if not exists destination_lat numeric(10,7),
  add column if not exists destination_lng numeric(10,7);

-- create_trip's signature is changing (two new trailing params), so the old
-- overload must be dropped rather than replaced in place -- otherwise both
-- the 9-arg and 11-arg versions would coexist and calls with only the
-- original 9 named args would become ambiguous.
drop function if exists public.create_trip(text, text, text, timestamptz, timestamptz, text, int, numeric, text);

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
  p_destination_lng numeric default null
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.profiles where id = auth.uid() and verification_status = 'approved'
  ) then
    raise exception 'You must complete ID verification before creating a trip';
  end if;

  if p_visibility not in ('public', 'trusted_circle', 'private') then
    raise exception 'Invalid visibility';
  end if;

  if trim(coalesce(p_title, '')) = '' or trim(coalesce(p_origin, '')) = '' or trim(coalesce(p_destination, '')) = '' then
    raise exception 'Title, origin, and destination are required';
  end if;

  loop
    v_code := encode(gen_random_bytes(5), 'hex');
    exit when not exists (select 1 from public.trips where invite_code = v_code);
  end loop;

  insert into public.trips (
    creator_id, title, trip_type, origin, destination, start_at, end_at,
    status, visibility, seats_total, seats_available, total_cost, invite_code, notes,
    destination_lat, destination_lng
  )
  values (
    auth.uid(), trim(p_title), 'carpool', trim(p_origin), trim(p_destination), p_start_at, p_end_at,
    'open', p_visibility, p_seats_total, p_seats_total, p_total_cost, v_code, nullif(trim(coalesce(p_notes, '')), ''),
    p_destination_lat, p_destination_lng
  )
  returning * into v_trip;

  insert into public.trip_members (trip_id, user_id, member_role, status, joined_at)
  values (v_trip.id, auth.uid(), 'driver', 'accepted', now());

  select * into v_trip from public.trips where id = v_trip.id;

  return v_trip;
end;
$$;

grant execute on function public.create_trip(text, text, text, timestamptz, timestamptz, text, int, numeric, text, numeric, numeric) to authenticated;

-- Driver transitions their trip from open/full into ongoing. Riders never
-- start a trip -- only the creator/driver can.
create or replace function public.start_trip(p_trip_id uuid)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.trips
  set status = 'ongoing'
  where id = p_trip_id
    and creator_id = auth.uid()
    and status in ('open', 'full')
  returning * into v_trip;

  if v_trip.id is null then
    raise exception 'Unable to start this trip';
  end if;

  return v_trip;
end;
$$;

grant execute on function public.start_trip(uuid) to authenticated;

commit;
