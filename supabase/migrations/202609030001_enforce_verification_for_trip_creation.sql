begin;

-- create_trip previously let any authenticated user create a trip regardless
-- of ID verification status, even though the app's UI has always promised
-- that verification "unlocks trip creation". Enforce it server-side so the
-- rule can't be bypassed by calling the RPC directly.
create or replace function public.create_trip(
  p_title text,
  p_origin text,
  p_destination text,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_visibility text default 'public',
  p_seats_total int default null,
  p_total_cost numeric default null,
  p_notes text default null
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
    status, visibility, seats_total, seats_available, total_cost, invite_code, notes
  )
  values (
    auth.uid(), trim(p_title), 'carpool', trim(p_origin), trim(p_destination), p_start_at, p_end_at,
    'open', p_visibility, p_seats_total, p_seats_total, p_total_cost, v_code, nullif(trim(coalesce(p_notes, '')), '')
  )
  returning * into v_trip;

  insert into public.trip_members (trip_id, user_id, member_role, status, joined_at)
  values (v_trip.id, auth.uid(), 'driver', 'accepted', now());

  select * into v_trip from public.trips where id = v_trip.id;

  return v_trip;
end;
$$;

commit;
