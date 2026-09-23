begin;

-- Exclude blocked pairs (in either direction) from people search.
create or replace function public.search_profiles(p_query text default '')
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  interests text[],
  bio text,
  date_of_birth date,
  verification_status text,
  city text,
  country text,
  trust_score numeric,
  trust_count bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.display_name, p.avatar_url, p.interests, p.bio, p.date_of_birth, p.verification_status, p.city, p.country,
    trust.avg_rating, trust.rating_count, p.updated_at
  from public.profiles p
  left join lateral (
    select avg(f.rating)::numeric(3,2) as avg_rating, count(*) as rating_count
    from public.feedback f
    where f.target_user_id = p.id
  ) trust on true
  where p.is_active
    and p.id <> auth.uid()
    and not public.is_blocked_between(auth.uid(), p.id)
    and (
      nullif(trim(p_query), '') is null
      or p.display_name ilike '%' || trim(p_query) || '%'
      or exists (
        select 1 from unnest(coalesce(p.interests, '{}'::text[])) interest
        where interest ilike '%' || trim(p_query) || '%'
      )
    )
  order by p.display_name asc
  limit 50;
$$;

grant execute on function public.search_profiles(text) to authenticated;

-- Exclude blocked pairs from nearby-traveler discovery.
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
      and not public.is_blocked_between(auth.uid(), cl.user_id)
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

-- Exclude blocked pairs from seeing each other's live location.
drop policy if exists "current locations access" on public.current_locations;
create policy "current locations access"
on public.current_locations
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_staff_or_admin()
  or (
    not public.is_blocked_between(auth.uid(), current_locations.user_id)
    and (
      (trip_id is not null and public.is_trip_member(trip_id))
      or exists (
        select 1
        from public.friend_requests fr
        where fr.status = 'accepted'
          and (
            (fr.requester_id = auth.uid() and fr.recipient_id = current_locations.user_id)
            or (fr.recipient_id = auth.uid() and fr.requester_id = current_locations.user_id)
          )
      )
    )
  )
);

commit;
