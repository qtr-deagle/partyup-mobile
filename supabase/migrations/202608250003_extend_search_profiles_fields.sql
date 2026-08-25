begin;

drop function if exists public.search_profiles(text);

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

commit;
