begin;

-- "I am" (travel_plans.gender) decides who sees you in Discover, including
-- "female buddies only" searches, so it can't be flipped freely:
--   * setting it the first time is free;
--   * one more change after that is free too (fixing a wrong first pick);
--   * after that, at most one change every 30 days.
-- Clearing it counts as a change. "Preferred travel buddy" stays free to
-- change: it only affects what you see. Only a user editing their own plan
-- is checked; admin tools and seed scripts (no auth.uid()) are not.

alter table public.travel_plans add column if not exists gender_changed_at timestamptz;

-- Deleting and re-creating the row would reset the cooldown, and the app
-- never deletes plans (it upserts), so users can't delete them any more.
drop policy if exists "travel plans own delete" on public.travel_plans;

create or replace function public.guard_gender_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_gender text := case when tg_op = 'UPDATE' then old.gender end;
  v_changed_at timestamptz := case when tg_op = 'UPDATE' then old.gender_changed_at end;
  v_next date;
begin
  -- Only this trigger moves the clock; a direct write to it is ignored.
  new.gender_changed_at := v_changed_at;

  if new.gender is not distinct from v_old_gender then
    return new;
  end if;

  -- The very first pick (no gender yet, never changed) is free and doesn't
  -- start the clock.
  if v_old_gender is null and v_changed_at is null then
    return new;
  end if;

  if auth.uid() is not null and auth.uid() = new.user_id
     and v_changed_at is not null and v_changed_at > now() - interval '30 days' then
    v_next := (v_changed_at + interval '30 days') at time zone 'Asia/Manila';
    raise exception 'You can change "I am" once every 30 days. Try again on %.', to_char(v_next, 'Mon FMDD');
  end if;

  new.gender_changed_at := now();
  return new;
end;
$$;

drop trigger if exists guard_gender_change on public.travel_plans;
create trigger guard_gender_change
before insert or update on public.travel_plans
for each row execute function public.guard_gender_change();

commit;
