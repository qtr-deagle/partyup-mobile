begin;

-- Discover "Create Plan": every user picks from fixed choices (no free text)
-- so plans can be compared. One row per user. The description is display-only
-- and never scored. gender / preferred_gender are edited from Edit Profile but
-- live here so Discover can read everything in one query.

create table if not exists public.travel_plans (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  ride text[] not null default '{}'
    check (ride <@ array['motor', 'car'] and cardinality(ride) <= 2),
  destination text[] not null default '{}'
    check (destination <@ array['beach', 'mountain', 'cities'] and cardinality(destination) <= 2),
  food text[] not null default '{}'
    check (food <@ array['food_finding', 'resto_search', 'drink_search'] and cardinality(food) <= 2),
  missions boolean not null default false,
  description text check (char_length(description) <= 200),
  gender text check (gender in ('male', 'female')),
  preferred_gender text[] not null default '{}'
    check (preferred_gender <@ array['male', 'female']),
  updated_at timestamptz not null default now()
);

alter table public.travel_plans enable row level security;

drop policy if exists "travel plans readable" on public.travel_plans;
create policy "travel plans readable" on public.travel_plans for select to authenticated
using (true);

drop policy if exists "travel plans own insert" on public.travel_plans;
create policy "travel plans own insert" on public.travel_plans for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "travel plans own update" on public.travel_plans;
create policy "travel plans own update" on public.travel_plans for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "travel plans own delete" on public.travel_plans;
create policy "travel plans own delete" on public.travel_plans for delete to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.travel_plans to authenticated;
grant all on public.travel_plans to service_role;

commit;
