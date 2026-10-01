begin;

-- Legal name as printed on a Philippine government ID, so staff can match
-- it against the ID at review. display_name stays the friendly name shown
-- around the app; sign-up fills it with "First Last".
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists name_suffix text;

alter table public.profiles drop constraint if exists profiles_legal_name_length;
alter table public.profiles add constraint profiles_legal_name_length check (
  char_length(first_name) <= 80
  and char_length(middle_name) <= 80
  and char_length(last_name) <= 80
  and char_length(name_suffix) <= 10
);

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
    first_name,
    middle_name,
    last_name,
    name_suffix,
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
    nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'middle_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name_suffix'), ''),
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
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    name_suffix = excluded.name_suffix,
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

-- Same rule as city: owners may set their legal name while unverified or
-- rejected (it's checked against the ID at review), or once if it's still
-- empty (accounts from before this migration). After that, name changes go
-- through staff.
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
    if not (old.verification_status in ('unverified', 'rejected') or old.last_name is null) then
      new.first_name := old.first_name;
      new.middle_name := old.middle_name;
      new.last_name := old.last_name;
      new.name_suffix := old.name_suffix;
    end if;
  end if;

  return new;
end;
$$;

commit;
