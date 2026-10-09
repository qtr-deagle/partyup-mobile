begin;

-- Mobile numbers stay editable (people change SIMs), with guardrails:
--   1. not while you're on an ongoing trip or have an active SOS, so the
--      number the safety team is calling can't change mid-emergency;
--   2. every change is logged (old -> new) for admins, shown in the
--      website's Users drawer;
--   4. at most once every 7 days.
-- (3, the confirm step, is in the app.) Adding a first number is never
-- blocked. Only a traveler changing their own number is checked: admin
-- tools and scripts (service role, no auth.uid()) can still correct one.

alter table public.profiles add column if not exists phone_changed_at timestamptz;

create table if not exists public.profile_phone_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  old_phone text,
  new_phone text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists profile_phone_changes_user_idx on public.profile_phone_changes(user_id, changed_at desc);

alter table public.profile_phone_changes enable row level security;

drop policy if exists "phone changes own or admin" on public.profile_phone_changes;
create policy "phone changes own or admin" on public.profile_phone_changes for select to authenticated
  using (user_id = auth.uid() or public.is_staff_or_admin());

-- Rows only come from the trigger below (security definer); no direct writes.
-- Supabase stopped auto-granting new public relations (2026-10-30), so grant explicitly.
revoke all on public.profile_phone_changes from anon, authenticated;
grant select on public.profile_phone_changes to authenticated;

create or replace function public.guard_phone_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text := nullif(btrim(old.phone), '');
  v_new text := nullif(btrim(new.phone), '');
  v_next date;
begin
  -- The cooldown clock only moves with a real number change; a direct write
  -- to phone_changed_at can't reset it.
  new.phone_changed_at := old.phone_changed_at;

  if v_new is not distinct from v_old then
    return new;
  end if;

  if auth.uid() is not null and auth.uid() = new.id and v_old is not null then
    if exists (
      select 1 from public.trip_members tm
      join public.trips t on t.id = tm.trip_id
      where tm.user_id = new.id and tm.status = 'accepted' and t.status = 'ongoing'
    ) then
      raise exception 'You can''t change your mobile number during an ongoing trip. You can change it once the trip ends.';
    end if;

    if exists (select 1 from public.sos_alerts s where s.user_id = new.id and s.status = 'active') then
      raise exception 'You can''t change your mobile number while your SOS is active.';
    end if;

    if old.phone_changed_at is not null and old.phone_changed_at > now() - interval '7 days' then
      v_next := (old.phone_changed_at + interval '7 days') at time zone 'Asia/Manila';
      raise exception 'You can change your mobile number once every 7 days. Try again on %.', to_char(v_next, 'Mon FMDD');
    end if;
  end if;

  -- Adding a first number doesn't start the cooldown; changing one does.
  if v_old is not null then
    new.phone_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists guard_phone_change on public.profiles;
create trigger guard_phone_change
before update on public.profiles
for each row execute function public.guard_phone_change();

create or replace function public.log_phone_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(new.phone), '') is distinct from nullif(btrim(old.phone), '') then
    insert into public.profile_phone_changes (user_id, old_phone, new_phone, changed_by)
    values (new.id, nullif(btrim(old.phone), ''), nullif(btrim(new.phone), ''), auth.uid());
  end if;
  return null;
end;
$$;

drop trigger if exists log_phone_change on public.profiles;
create trigger log_phone_change
after update of phone on public.profiles
for each row execute function public.log_phone_change();

commit;
