begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('system', 'trip', 'message', 'match', 'safety')),
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.list_notifications()
returns setof public.notifications
language sql
security definer
set search_path = public
as $$
  select *
  from public.notifications
  where user_id = auth.uid()
  order by created_at desc;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set read = true
  where id = p_notification_id
    and user_id = auth.uid();
end;
$$;

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

commit;
