begin;

-- Match Preferences gets an "Others" option alongside Male and Female, for
-- both "I am" and "Preferred travel buddy". Scoring needs no change: it only
-- checks whether a gender is in the other person's preferred list.

alter table public.travel_plans drop constraint if exists travel_plans_gender_check;
alter table public.travel_plans
  add constraint travel_plans_gender_check check (gender in ('male', 'female', 'other'));

alter table public.travel_plans drop constraint if exists travel_plans_preferred_gender_check;
alter table public.travel_plans
  add constraint travel_plans_preferred_gender_check check (preferred_gender <@ array['male', 'female', 'other']);

commit;
