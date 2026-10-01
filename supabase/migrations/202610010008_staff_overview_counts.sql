begin;

-- Counts for Leader HQ / the operations view. Leaders can no longer read
-- every profile or report row (202610010006), so the dashboard gets plain
-- numbers from here instead of counting rows itself.
create or replace function public.get_staff_overview_counts()
returns table (
  pending_ids bigint,
  pending_vehicles bigint,
  open_reports bigint,
  total_travelers bigint,
  verified_travelers bigint,
  new_travelers_today bigint,
  open_trips bigint,
  ongoing_trips bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.id_verifications where status = 'pending'),
    (select count(*) from public.vehicles where verification_status = 'pending'),
    (select count(*) from public.reports where status in ('open', 'reviewing')),
    (select count(*) from public.profiles where role = 'traveler'),
    (select count(*) from public.profiles where role = 'traveler' and verification_status = 'approved'),
    -- "Today" in Manila (UTC+8).
    (select count(*) from public.profiles where role = 'traveler'
      and created_at >= (date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')),
    (select count(*) from public.trips where status in ('open', 'full')),
    (select count(*) from public.trips where status = 'ongoing')
  where public.is_guild_leader_or_admin();
$$;

grant execute on function public.get_staff_overview_counts() to authenticated;

commit;
