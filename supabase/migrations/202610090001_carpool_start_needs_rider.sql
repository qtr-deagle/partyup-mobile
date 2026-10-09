begin;

-- A carpool can't start with only the driver on board: at least one accepted
-- rider is required. Same as 202609030003 otherwise. Tours keep the old rule.

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

  select * into v_trip
  from public.trips
  where id = p_trip_id
    and creator_id = auth.uid()
    and status in ('open', 'full')
  for update;

  if v_trip.id is null then
    raise exception 'Unable to start this trip';
  end if;

  if v_trip.trip_type = 'carpool' and not exists (
    select 1 from public.trip_members tm
    where tm.trip_id = v_trip.id
      and tm.status = 'accepted'
      and tm.user_id <> v_trip.creator_id
  ) then
    raise exception 'Accept at least one rider before starting the carpool';
  end if;

  update public.trips
  set status = 'ongoing'
  where id = v_trip.id
  returning * into v_trip;

  return v_trip;
end;
$$;

grant execute on function public.start_trip(uuid) to authenticated;

commit;
