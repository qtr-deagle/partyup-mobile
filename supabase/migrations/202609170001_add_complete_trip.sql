begin;

create or replace function public.complete_trip(p_trip_id uuid)
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
  set status = 'completed',
      end_at = coalesce(end_at, now())
  where id = p_trip_id
    and creator_id = auth.uid()
    and status = 'ongoing'
  returning * into v_trip;

  if v_trip.id is null then
    raise exception 'Unable to complete this trip';
  end if;

  return v_trip;
end;
$$;

grant execute on function public.complete_trip(uuid) to authenticated;

commit;
