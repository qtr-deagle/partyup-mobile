-- Only list travelers whose location was refreshed recently (i.e. app open).
-- The app heartbeats current_locations every minute while in the foreground,
-- so anything older than 5 minutes is treated as offline.
-- Also restores the blocked-pair filter dropped by 202609250001.

create or replace function public.get_nearby_travelers(p_radius_km numeric default 5)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  distance_km numeric,
  is_friend boolean,
  latitude numeric,
  longitude numeric,
  share_kind text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select cl.latitude, cl.longitude
    from public.current_locations cl
    where cl.user_id = auth.uid() and cl.is_visible
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
        select 1 from public.friend_requests fr
        where fr.status = 'accepted'
          and ((fr.requester_id = auth.uid() and fr.recipient_id = cl.user_id)
            or (fr.recipient_id = auth.uid() and fr.requester_id = cl.user_id))
      ) as is_friend,
      public.location_share_kind(auth.uid(), cl.user_id) as share_kind
    from public.current_locations cl
    cross join me
    join public.profiles p on p.id = cl.user_id
    where cl.user_id <> auth.uid()
      and cl.is_visible
      and p.is_active
      and cl.updated_at > now() - interval '5 minutes'
      and not public.is_blocked_between(auth.uid(), cl.user_id)
      and earth_box(ll_to_earth(me.latitude, me.longitude), p_radius_km * 1000) @> ll_to_earth(cl.latitude, cl.longitude)
  )
  select
    c.user_id,
    c.display_name,
    c.avatar_url,
    round((c.distance_m / 1000)::numeric, 1) as distance_km,
    c.is_friend,
    case when c.share_kind is not null then c.latitude else null end as latitude,
    case when c.share_kind is not null then c.longitude else null end as longitude,
    c.share_kind
  from candidates c
  where c.distance_m <= p_radius_km * 1000
  order by c.distance_m asc
  limit 100;
$$;

grant execute on function public.get_nearby_travelers(numeric) to authenticated;
