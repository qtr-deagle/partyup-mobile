begin;

-- PartyUp is for Bulacan residents only; where they travel is unrestricted.
-- Residency = profiles.city holds one of Bulacan's 24 cities/municipalities,
-- confirmed by staff against the address on the user's ID. Every trip/tour
-- RPC already requires an approved ID, so tying approval to residency is
-- enough -- no trip RPC checks coordinates.

-- Keep in sync with lib/bulacan.ts (BULACAN_MUNICIPALITIES).
create or replace function public.bulacan_municipalities()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'Angat', 'Balagtas', 'Baliwag', 'Bocaue', 'Bulakan', 'Bustos', 'Calumpit',
    'Doña Remedios Trinidad', 'Guiguinto', 'Hagonoy', 'Malolos', 'Marilao',
    'Meycauayan', 'Norzagaray', 'Obando', 'Pandi', 'Paombong', 'Plaridel',
    'Pulilan', 'San Ildefonso', 'San Jose del Monte', 'San Miguel',
    'San Rafael', 'Santa Maria'
  ]::text[];
$$;

grant execute on function public.bulacan_municipalities() to anon, authenticated, service_role;

-- Clear any legacy free-text city that isn't a Bulacan LGU so the
-- constraint validates; affected users get the municipality picker.
update public.profiles
set city = null
where city is not null and not (city = any (public.bulacan_municipalities()));

alter table public.profiles drop constraint if exists profiles_city_bulacan_check;
alter table public.profiles
  add constraint profiles_city_bulacan_check
  check (city is null or city = any (public.bulacan_municipalities()));

-- New sign-ups carry their municipality in auth metadata. Invalid values
-- become null rather than failing sign-up; the app gate catches them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text := new.raw_user_meta_data ->> 'municipality';
begin
  if v_city is not null and not (v_city = any (public.bulacan_municipalities())) then
    v_city := null;
  end if;

  insert into public.profiles (
    id,
    display_name,
    email,
    date_of_birth,
    interests,
    avatar_url,
    bio,
    phone,
    city,
    country,
    role,
    verification_status,
    is_active
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    case
      when new.raw_user_meta_data ->> 'date_of_birth' is not null
        then to_date(new.raw_user_meta_data ->> 'date_of_birth', 'MM/DD/YYYY')
      else null
    end,
    coalesce(array(select jsonb_array_elements_text(new.raw_user_meta_data -> 'interests')), '{}'::text[]),
    new.raw_user_meta_data ->> 'avatar_url',
    null,
    new.raw_user_meta_data ->> 'phone',
    v_city,
    'Philippines',
    'traveler',
    'unverified',
    true
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    email = excluded.email,
    date_of_birth = excluded.date_of_birth,
    interests = excluded.interests,
    avatar_url = excluded.avatar_url,
    phone = excluded.phone,
    city = coalesce(excluded.city, public.profiles.city),
    country = excluded.country,
    updated_at = now();

  insert into public.notifications (user_id, type, title, message)
  values (
    new.id,
    'system',
    'Welcome to PartyUp!',
    'Glad you''re here. Add friends, plan a trip, and set up your trusted circle to get started.'
  );

  return new;
end;
$$;

-- Owners may set their municipality while unverified/rejected (it's checked
-- at review), or once if it's still empty (accounts from before this rule).
-- After that, moving towns goes through staff.
create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id and not public.is_staff_or_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
    if not (
      current_setting('partyup.id_submission', true) = 'on'
      and old.verification_status in ('unverified', 'rejected')
      and new.verification_status = 'pending'
    ) then
      new.verification_status := old.verification_status;
    end if;
    if new.city is distinct from old.city
      and not (old.verification_status in ('unverified', 'rejected') or old.city is null) then
      new.city := old.city;
    end if;
  end if;

  return new;
end;
$$;

-- No approval without a declared Bulacan municipality, whoever approves.
create or replace function public.require_city_for_approval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.verification_status = 'approved'
    and old.verification_status is distinct from 'approved'
    and new.city is null then
    raise exception 'Cannot approve: this user has not declared a Bulacan city/municipality';
  end if;

  return new;
end;
$$;

drop trigger if exists require_city_for_approval on public.profiles;
create trigger require_city_for_approval
before update of verification_status on public.profiles
for each row execute function public.require_city_for_approval();

commit;
