begin;

-- The parts that make up get_trust_score, so the Home tab can show users
-- what they've earned and what's left. trust_score itself still comes from
-- get_trust_score so the formula lives in one place.
create or replace function public.get_trust_breakdown()
returns table (
  verified boolean,
  has_avatar boolean,
  has_bio boolean,
  has_phone boolean,
  has_city boolean,
  completed_trips int,
  trust_score int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.verification_status = 'approved',
    p.avatar_url is not null,
    coalesce(p.bio, '') <> '',
    coalesce(p.phone, '') <> '',
    coalesce(p.city, '') <> '',
    (
      select count(*)::int from public.trip_members tm
      join public.trips t on t.id = tm.trip_id
      where tm.user_id = p.id and tm.status = 'accepted' and t.status = 'completed'
    ),
    public.get_trust_score(p.id)
  from public.profiles p
  where p.id = auth.uid();
$$;

grant execute on function public.get_trust_breakdown() to authenticated;

commit;
