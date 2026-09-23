begin;

-- Tours (trip_type = 'tour') collect an organizer-entered duration in days
-- (the create-tour form asks for a raw number, not a date-range picker) and
-- a fixed set of theme/interest tags, same loose-array pattern already used
-- by profiles.interests.
alter table public.trips
  add column if not exists duration_days int check (duration_days is null or duration_days > 0),
  add column if not exists interest_tags text[] not null default '{}'::text[];

alter table public.trips
  drop constraint if exists trips_interest_tags_valid;
alter table public.trips
  add constraint trips_interest_tags_valid check (
    interest_tags <@ array[
      'Hiking','Beaches','Museums','Food','Photography','History',
      'Nature','Shopping','Nightlife','Adventure','Art','Relaxation'
    ]::text[]
  );

-- Daily itinerary builder: ordered, per-day free text. Only tours use this,
-- but it's not restricted at the schema level.
create table if not exists public.trip_itinerary_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_number int not null check (day_number > 0),
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, day_number)
);

create index if not exists trip_itinerary_days_trip_id_idx on public.trip_itinerary_days(trip_id);

-- Favorites / wishlist for the "Interested" tours sub-tab.
create table if not exists public.trip_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, trip_id)
);

create index if not exists trip_favorites_user_id_idx on public.trip_favorites(user_id);
create index if not exists trip_favorites_trip_id_idx on public.trip_favorites(trip_id);

drop trigger if exists set_trip_itinerary_days_updated_at on public.trip_itinerary_days;
create trigger set_trip_itinerary_days_updated_at
before update on public.trip_itinerary_days
for each row execute function public.set_updated_at();

alter table public.trip_itinerary_days enable row level security;
alter table public.trip_favorites enable row level security;

-- Itinerary is visible to whoever can already see the parent trip (public
-- tours, creator, members, staff) -- mirrors "trips read access".
drop policy if exists "trip itinerary read access" on public.trip_itinerary_days;
create policy "trip itinerary read access"
on public.trip_itinerary_days
for select
to authenticated
using (
  exists (
    select 1 from public.trips t
    where t.id = trip_itinerary_days.trip_id
      and (t.visibility = 'public' or t.creator_id = auth.uid() or public.is_trip_member(t.id) or public.is_staff_or_admin())
  )
);

-- All itinerary writes go through create_trip -- same lockdown pattern used
-- for trip_members in 202608300003_tighten_trip_rls_for_carpool.sql.
revoke insert, update, delete on public.trip_itinerary_days from authenticated;

-- Favorites are simple, low-risk, user-owned rows -- direct RLS ownership is
-- fine here (no capacity/trust invariant to protect), same shape as
-- trusted_contacts.
drop policy if exists "trip favorites own access" on public.trip_favorites;
create policy "trip favorites own access"
on public.trip_favorites
for all
to authenticated
using (user_id = auth.uid() or public.is_staff_or_admin())
with check (user_id = auth.uid() or public.is_staff_or_admin());

commit;
