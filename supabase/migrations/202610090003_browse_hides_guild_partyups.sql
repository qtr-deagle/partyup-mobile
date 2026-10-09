-- Guild PartyUps (trips.guild_id) were meant to stay out of public Browse
-- (see 202610030008), but list_browse_trips was never updated. Non-members
-- saw guild tours/carpools there and got "Trip not found" from
-- join_public_trip, which only lets guild members in. Guild members still
-- find them through list_guild_partyups.

begin;

create or replace function public.list_browse_trips(p_trip_type text default 'tour', p_search text default null)
returns table (
  id uuid, title text, origin text, destination text,
  start_at timestamptz, end_at timestamptz, duration_days int,
  status text, visibility text, seats_total int, seats_available int, rider_count int,
  total_cost numeric, price_per_person numeric, interest_tags text[],
  organizer_id uuid, organizer_display_name text, organizer_avatar_url text, organizer_verified boolean,
  is_favorited boolean, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id, t.title, t.origin, t.destination, t.start_at, t.end_at, t.duration_days,
    t.status, t.visibility, t.seats_total, t.seats_available,
    (select count(*) from public.trip_members rm where rm.trip_id = t.id and rm.member_role = 'member' and rm.status = 'accepted')::int,
    t.total_cost, t.price_per_person, t.interest_tags,
    o.id, o.display_name, o.avatar_url, (o.verification_status = 'approved'),
    exists(select 1 from public.trip_favorites f where f.trip_id = t.id and f.user_id = auth.uid()),
    t.created_at
  from public.trips t
  join public.profiles o on o.id = t.creator_id
  where t.trip_type = p_trip_type
    and t.visibility = 'public'
    and t.guild_id is null
    and t.status in ('open', 'full')
    and t.creator_id <> auth.uid()
    and not exists (
      select 1 from public.trip_members tm
      where tm.trip_id = t.id and tm.user_id = auth.uid() and tm.status in ('accepted', 'pending')
    )
    and (p_search is null or trim(p_search) = '' or t.title ilike '%' || trim(p_search) || '%' or t.destination ilike '%' || trim(p_search) || '%')
  order by t.start_at nulls last, t.created_at desc;
$$;

grant execute on function public.list_browse_trips(text, text) to authenticated;

commit;
