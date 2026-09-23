-- Backs the staff/admin Pairing History pages, which previously rendered
-- hardcoded mock rows. public.pairing_history exists in the base schema but
-- nothing ever writes to it (no swipe/match flow persists there), so instead
-- of reading from that empty table we derive real "pairings" from the actual
-- data: the trip creator paired with each other accepted trip_members row.
-- That mirrors what the mock UI showed (two named travelers per trip) using
-- data that genuinely exists.

-- Interest overlap (Jaccard similarity, case-insensitive) between two
-- profiles.interests arrays -- the same signal the in-app Discover swipe
-- compatibility score uses client-side (see mobile lib/compatibility.ts
-- scoreInterestOverlap), reused here as the "Compatibility" metric since
-- there is no stored match_score anywhere for a pair to draw from.
create or replace function public.interest_overlap_pct(a text[], b text[])
returns int
language sql
immutable
as $$
  select case
    when a is null or b is null or array_length(a, 1) is null or array_length(b, 1) is null then 50
    else round(
      100.0 *
      (select count(*) from (select distinct lower(x) as x from unnest(a) x) ua
         join (select distinct lower(x) as x from unnest(b) x) ub on ua.x = ub.x)
      /
      (select count(*) from (
         select distinct lower(x) as x from unnest(a) x
         union
         select distinct lower(x) as x from unnest(b) x
       ) uu)
    )::int
  end;
$$;

grant execute on function public.interest_overlap_pct(text[], text[]) to authenticated;

create or replace function public.list_pairing_history()
returns table (
  id uuid,
  trip_id uuid,
  user1_id uuid,
  user1_name text,
  user2_id uuid,
  user2_name text,
  trip_type text,
  destination text,
  start_at timestamptz,
  status text,
  compatibility int,
  rating numeric,
  rating_count int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff_or_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    tm.id,
    t.id as trip_id,
    t.creator_id as user1_id,
    p1.display_name as user1_name,
    tm.user_id as user2_id,
    p2.display_name as user2_name,
    t.trip_type,
    t.destination,
    t.start_at,
    case when t.status = 'completed' then 'completed' else 'active' end as status,
    public.interest_overlap_pct(p1.interests, p2.interests) as compatibility,
    (
      select avg(f.rating)::numeric(3, 1)
      from public.feedback f
      where f.trip_id = t.id
        and f.feedback_type = 'user'
        and ((f.author_id = t.creator_id and f.target_user_id = tm.user_id)
          or (f.author_id = tm.user_id and f.target_user_id = t.creator_id))
    ) as rating,
    (
      select count(*)::int
      from public.feedback f
      where f.trip_id = t.id
        and f.feedback_type = 'user'
        and ((f.author_id = t.creator_id and f.target_user_id = tm.user_id)
          or (f.author_id = tm.user_id and f.target_user_id = t.creator_id))
    ) as rating_count
  from public.trips t
  join public.trip_members tm
    on tm.trip_id = t.id and tm.status = 'accepted' and tm.user_id <> t.creator_id
  join public.profiles p1 on p1.id = t.creator_id
  join public.profiles p2 on p2.id = tm.user_id
  where t.status in ('open', 'full', 'ongoing', 'completed')
  order by t.start_at desc nulls last, t.created_at desc;
end;
$$;

grant execute on function public.list_pairing_history() to authenticated;
