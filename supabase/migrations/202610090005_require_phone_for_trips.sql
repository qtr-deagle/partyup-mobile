begin;

-- Mobile numbers are now required to create, join or request a seat on a
-- trip, so the safety team (SOS Center, Trip Monitoring) can always call.
-- Sign-up collects one; travelers who signed up earlier are prompted in the
-- app and blocked here until they add it. Not SMS-verified (zero-cost until
-- December 2026), only format-checked in the app.
--
-- Triggers rather than edits to each RPC, so every path is covered:
-- create_trip, join_public_trip, join_trip_via_invite, request_carpool_seat,
-- join_guild_partyup and any future one. Only the person acting on their own
-- behalf is checked (auth.uid() = the member / creator): a driver accepting
-- someone, admin tools and the seed scripts (no auth.uid()) aren't blocked.

create or replace function public.has_phone_on_file(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and nullif(btrim(p.phone), '') is not null
  );
$$;

revoke all on function public.has_phone_on_file(uuid) from public, anon;
grant execute on function public.has_phone_on_file(uuid) to authenticated;

create or replace function public.require_phone_to_create_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.creator_id = auth.uid() and not public.has_phone_on_file(auth.uid()) then
    raise exception 'Add your mobile number in Edit Profile before creating a trip';
  end if;
  return new;
end;
$$;

drop trigger if exists require_phone_to_create_trip on public.trips;
create trigger require_phone_to_create_trip
before insert on public.trips
for each row execute function public.require_phone_to_create_trip();

-- Joining = a new member row for yourself, or your own row moving back into
-- pending / accepted (e.g. rejoining after leaving).
create or replace function public.require_phone_to_join_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.user_id <> auth.uid() or new.status not in ('pending', 'accepted') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('pending', 'accepted') then
    return new;
  end if;
  if not public.has_phone_on_file(auth.uid()) then
    raise exception 'Add your mobile number in Edit Profile before joining a trip';
  end if;
  return new;
end;
$$;

drop trigger if exists require_phone_to_join_trip on public.trip_members;
create trigger require_phone_to_join_trip
before insert or update of status on public.trip_members
for each row execute function public.require_phone_to_join_trip();

commit;
