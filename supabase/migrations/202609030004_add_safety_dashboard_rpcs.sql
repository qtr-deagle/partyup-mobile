begin;

create or replace function public.get_trust_score(p_user_id uuid default auth.uid())
returns int
language sql
stable
security definer
set search_path = public
as $$
  select least(100,
    coalesce((select 50 from public.profiles where id = p_user_id and verification_status = 'approved'), 0)
    + least(20,
        (case when (select avatar_url from public.profiles where id = p_user_id) is not null then 5 else 0 end)
        + (case when coalesce((select bio from public.profiles where id = p_user_id), '') <> '' then 5 else 0 end)
        + (case when coalesce((select phone from public.profiles where id = p_user_id), '') <> '' then 5 else 0 end)
        + (case when coalesce((select city from public.profiles where id = p_user_id), '') <> '' then 5 else 0 end)
      )
    + least(30, 5 * (
        select count(*)::int from public.trip_members tm
        join public.trips t on t.id = tm.trip_id
        where tm.user_id = p_user_id and tm.status = 'accepted' and t.status = 'completed'
      ))
  )::int;
$$;

grant execute on function public.get_trust_score(uuid) to authenticated;

-- The caller's current ongoing trip, or else their soonest upcoming
-- open/full trip they're an accepted member of.
create or replace function public.get_active_trip_id(p_user_id uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from public.trips t
  join public.trip_members tm on tm.trip_id = t.id
  where tm.user_id = p_user_id
    and tm.status = 'accepted'
    and t.status in ('ongoing', 'open', 'full')
  order by
    case when t.status = 'ongoing' then 0 else 1 end,
    t.start_at asc nulls last,
    t.created_at asc
  limit 1;
$$;

grant execute on function public.get_active_trip_id(uuid) to authenticated;

create or replace function public.get_active_trip_summary()
returns table (
  trip_id uuid,
  title text,
  destination text,
  destination_lat numeric,
  destination_lng numeric,
  status text,
  start_at timestamptz,
  is_driver boolean,
  buddy_user_id uuid,
  buddy_display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.title,
    t.destination,
    t.destination_lat,
    t.destination_lng,
    t.status,
    t.start_at,
    (t.creator_id = auth.uid()),
    buddy.user_id,
    buddy.display_name
  from public.trips t
  left join lateral (
    select tm.user_id, p.display_name
    from public.trip_members tm
    join public.profiles p on p.id = tm.user_id
    where tm.trip_id = t.id
      and tm.status = 'accepted'
      and tm.user_id <> auth.uid()
    order by tm.joined_at asc nulls last, tm.created_at asc
    limit 1
  ) buddy on true
  where t.id = public.get_active_trip_id(auth.uid());
$$;

grant execute on function public.get_active_trip_summary() to authenticated;

-- Trust score, verification, geofence status against the active trip's
-- destination, and distance to the trip buddy (only surfaced when the buddy
-- is an accepted friend, reusing the same visibility rule current_locations
-- already enforces for friends).
create or replace function public.get_safety_overview()
returns table (
  trust_score int,
  verification_status text,
  geofence_status text,
  geofence_distance_km numeric,
  geofence_label text,
  buddy_distance_km numeric,
  buddy_display_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_trip record;
  v_my_loc record;
  v_geofence_status text := 'unavailable';
  v_geofence_distance numeric := null;
  v_buddy_distance numeric := null;
  v_buddy_name text := null;
  v_buddy_loc record;
  v_buddy_is_friend boolean;
begin
  select * into v_trip from public.get_active_trip_summary();
  select latitude, longitude into v_my_loc from public.current_locations where user_id = auth.uid();

  if v_trip.trip_id is not null and v_trip.destination_lat is not null and v_trip.destination_lng is not null and v_my_loc.latitude is not null then
    v_geofence_distance := round((earth_distance(
      ll_to_earth(v_my_loc.latitude, v_my_loc.longitude),
      ll_to_earth(v_trip.destination_lat, v_trip.destination_lng)
    ) / 1000)::numeric, 1);
    v_geofence_status := case when v_geofence_distance <= 5 then 'in_zone' else 'out_of_zone' end;
  end if;

  if v_trip.buddy_user_id is not null then
    v_buddy_is_friend := exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and (
          (fr.requester_id = auth.uid() and fr.recipient_id = v_trip.buddy_user_id)
          or (fr.recipient_id = auth.uid() and fr.requester_id = v_trip.buddy_user_id)
        )
    );

    if v_buddy_is_friend and v_my_loc.latitude is not null then
      select latitude, longitude into v_buddy_loc from public.current_locations where user_id = v_trip.buddy_user_id;
      if v_buddy_loc.latitude is not null then
        v_buddy_distance := round((earth_distance(
          ll_to_earth(v_my_loc.latitude, v_my_loc.longitude),
          ll_to_earth(v_buddy_loc.latitude, v_buddy_loc.longitude)
        ) / 1000)::numeric, 1);
        v_buddy_name := v_trip.buddy_display_name;
      end if;
    end if;
  end if;

  return query
  select
    public.get_trust_score(auth.uid()),
    (select p.verification_status from public.profiles p where p.id = auth.uid()),
    v_geofence_status,
    v_geofence_distance,
    case
      when v_geofence_status = 'in_zone' then 'Within 5km safe zone'
      when v_geofence_status = 'out_of_zone' then 'Outside safe zone'
      else 'Geofence unavailable'
    end,
    v_buddy_distance,
    v_buddy_name;
end;
$$;

grant execute on function public.get_safety_overview() to authenticated;

commit;
