begin;

create extension if not exists cube;
create extension if not exists earthdistance;

create index if not exists current_locations_earth_idx
on public.current_locations
using gist (ll_to_earth(latitude, longitude));

create or replace function public.get_nearby_travelers(p_radius_km numeric default 5)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  distance_km numeric,
  is_friend boolean,
  latitude numeric,
  longitude numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select cl.latitude, cl.longitude
    from public.current_locations cl
    where cl.user_id = auth.uid()
      and cl.is_visible
  ),
  candidates as (
    select
      cl.user_id,
      p.display_name,
      p.avatar_url,
      cl.latitude,
      cl.longitude,
      earth_distance(ll_to_earth(me.latitude, me.longitude), ll_to_earth(cl.latitude, cl.longitude)) as distance_m,
      exists (
        select 1
        from public.friend_requests fr
        where fr.status = 'accepted'
          and (
            (fr.requester_id = auth.uid() and fr.recipient_id = cl.user_id)
            or (fr.recipient_id = auth.uid() and fr.requester_id = cl.user_id)
          )
      ) as is_friend
    from public.current_locations cl
    cross join me
    join public.profiles p on p.id = cl.user_id
    where cl.user_id <> auth.uid()
      and cl.is_visible
      and p.is_active
      and earth_box(ll_to_earth(me.latitude, me.longitude), p_radius_km * 1000) @> ll_to_earth(cl.latitude, cl.longitude)
  )
  select
    c.user_id,
    c.display_name,
    c.avatar_url,
    round((c.distance_m / 1000)::numeric, 1) as distance_km,
    c.is_friend,
    case when c.is_friend then c.latitude else null end as latitude,
    case when c.is_friend then c.longitude else null end as longitude
  from candidates c
  where c.distance_m <= p_radius_km * 1000
  order by c.distance_m asc
  limit 100;
$$;

grant execute on function public.get_nearby_travelers(numeric) to authenticated;

create or replace function public.set_location_visibility(p_is_visible boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.current_locations
  set is_visible = p_is_visible, updated_at = now()
  where user_id = auth.uid();
$$;

grant execute on function public.set_location_visibility(boolean) to authenticated;

drop policy if exists "current locations access" on public.current_locations;
create policy "current locations access"
on public.current_locations
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_staff_or_admin()
  or (trip_id is not null and public.is_trip_member(trip_id))
  or exists (
    select 1
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (fr.requester_id = auth.uid() and fr.recipient_id = current_locations.user_id)
        or (fr.recipient_id = auth.uid() and fr.requester_id = current_locations.user_id)
      )
  )
);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'current_locations') then
    alter publication supabase_realtime add table public.current_locations;
  end if;
end;
$$;

commit;
