begin;

-- Backs the Profile tab, which previously rendered a hardcoded rating, bio,
-- travel stats and review list. The feedback RLS policy only lets authors
-- read their own rows, so a user can't select the ratings written *about*
-- them directly -- these security definer RPCs expose just the aggregate
-- stats and the public-facing review fields.

-- Travel stats are derived from completed trips the user created or was an
-- accepted member of. Trips don't store a country, so "places visited" is
-- the count of distinct destinations.
create or replace function public.get_profile_stats(p_user_id uuid)
returns table (
  avg_rating numeric,
  rating_count int,
  trips_completed int,
  carpools_completed int,
  tours_completed int,
  places_visited int
)
language sql
stable
security definer
set search_path = public
as $$
  with my_trips as (
    select t.id, t.trip_type, t.destination
    from public.trips t
    where t.status = 'completed'
      and (
        t.creator_id = p_user_id
        or exists (
          select 1 from public.trip_members tm
          where tm.trip_id = t.id and tm.user_id = p_user_id and tm.status = 'accepted'
        )
      )
  )
  select
    (select avg(f.rating)::numeric(3, 2) from public.feedback f
      where f.target_user_id = p_user_id and f.feedback_type = 'user') as avg_rating,
    (select count(*)::int from public.feedback f
      where f.target_user_id = p_user_id and f.feedback_type = 'user') as rating_count,
    (select count(*)::int from my_trips) as trips_completed,
    (select count(*)::int from my_trips where trip_type = 'carpool') as carpools_completed,
    (select count(*)::int from my_trips where trip_type = 'tour') as tours_completed,
    (select count(distinct lower(trim(destination)))::int from my_trips) as places_visited;
$$;

grant execute on function public.get_profile_stats(uuid) to authenticated;

-- Most recent ratings a user has received, with the author's name. Authors
-- the caller has blocked (or who blocked the caller) are left out.
create or replace function public.list_user_reviews(p_user_id uuid, p_limit int default 10)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  rating int,
  comment text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.author_id, p.display_name, p.avatar_url, f.rating, f.comment, f.created_at
  from public.feedback f
  join public.profiles p on p.id = f.author_id
  where f.target_user_id = p_user_id
    and f.feedback_type = 'user'
    and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = auth.uid() and b.blocked_id = f.author_id)
         or (b.blocker_id = f.author_id and b.blocked_id = auth.uid())
    )
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

grant execute on function public.list_user_reviews(uuid, int) to authenticated;

commit;
