begin;

alter table public.profiles
  add column if not exists date_of_birth date,
  add column if not exists interests text[] not null default '{}'::text[];

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
    null,
    null,
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
    updated_at = now();

  return new;
end;
$$;

commit;
