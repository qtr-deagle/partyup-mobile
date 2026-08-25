begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  avatar_url text,
  bio text,
  phone text,
  city text,
  country text,
  role text not null default 'traveler' check (role in ('traveler', 'staff', 'admin')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'approved', 'rejected')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text,
  relationship text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trusted_contacts_user_id_idx on public.trusted_contacts(user_id);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  make text not null,
  model text not null,
  year int,
  color text,
  plate_number text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'approved', 'rejected')),
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicles_user_id_idx on public.vehicles(user_id);

create table if not exists public.id_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  document_type text not null check (document_type in ('passport', 'driver_license', 'national_id', 'other')),
  document_country text,
  document_last4 text,
  front_image_path text,
  back_image_path text,
  selfie_image_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'resubmitted')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists id_verifications_user_id_idx on public.id_verifications(user_id);
create index if not exists id_verifications_status_idx on public.id_verifications(status);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  trip_type text not null check (trip_type in ('carpool', 'tour')),
  origin text not null,
  destination text not null,
  start_at timestamptz,
  end_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'open', 'full', 'ongoing', 'completed', 'cancelled')),
  visibility text not null default 'public' check (visibility in ('public', 'trusted_circle', 'private')),
  seats_total int check (seats_total is null or seats_total > 0),
  seats_available int check (seats_available is null or seats_available >= 0),
  price_per_person numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trips_creator_id_idx on public.trips(creator_id);
create index if not exists trips_status_idx on public.trips(status);

create table if not exists public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('member', 'driver', 'coordinator')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'left')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create index if not exists trip_members_trip_id_idx on public.trip_members(trip_id);
create index if not exists trip_members_user_id_idx on public.trip_members(user_id);

create table if not exists public.pairing_history (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  matched_user_id uuid not null references public.profiles(id) on delete cascade,
  match_score numeric(5,2),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists pairing_history_user_id_idx on public.pairing_history(user_id);
create index if not exists pairing_history_matched_user_id_idx on public.pairing_history(matched_user_id);

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  thread_type text not null default 'direct' check (thread_type in ('direct', 'group', 'trip')),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_threads_trip_id_idx on public.chat_threads(trip_id);
create index if not exists chat_threads_created_by_idx on public.chat_threads(created_by);

create table if not exists public.chat_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

create index if not exists chat_participants_thread_id_idx on public.chat_participants(thread_id);
create index if not exists chat_participants_user_id_idx on public.chat_participants(user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message_type text not null default 'text' check (message_type in ('text', 'system', 'location')),
  body text not null,
  location jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_thread_id_idx on public.chat_messages(thread_id);
create index if not exists chat_messages_sender_id_idx on public.chat_messages(sender_id);

create table if not exists public.current_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  accuracy_m numeric(10,2),
  is_visible boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists current_locations_trip_id_idx on public.current_locations(trip_id);

create table if not exists public.location_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  accuracy_m numeric(10,2),
  captured_at timestamptz not null default now()
);

create index if not exists location_history_user_id_idx on public.location_history(user_id);
create index if not exists location_history_trip_id_idx on public.location_history(trip_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  trip_id uuid references public.trips(id) on delete set null,
  report_type text not null check (report_type in ('safety', 'behavior', 'payment', 'feedback', 'other')),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  details text not null,
  resolution_notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_reporter_id_idx on public.reports(reporter_id);
create index if not exists reports_status_idx on public.reports(status);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  trip_id uuid references public.trips(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  feedback_type text not null default 'trip' check (feedback_type in ('trip', 'user', 'service')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_author_id_idx on public.feedback(author_id);
create index if not exists feedback_target_user_id_idx on public.feedback(target_user_id);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_actor_id_idx on public.audit_logs(actor_id);

create table if not exists public.payment_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  amount numeric(10,2) not null default 0,
  currency text not null default 'PHP',
  status text not null default 'demo' check (status in ('demo', 'pending', 'paid', 'refunded')),
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_history_user_id_idx on public.payment_history(user_id);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'traveler');
$$;

create or replace function public.is_staff_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('staff', 'admin');
$$;

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
      and tm.status in ('accepted', 'driver', 'coordinator')
  );
$$;

create or replace function public.is_thread_participant(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_participants cp
    where cp.thread_id = p_thread_id
      and cp.user_id = auth.uid()
  );
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
    avatar_url = excluded.avatar_url,
    phone = excluded.phone,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id and not public.is_staff_or_admin() then
    new.role := old.role;
    new.verification_status := old.verification_status;
    new.is_active := old.is_active;
  end if;

  return new;
end;
$$;

create or replace function public.create_user_profile(p_display_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_email text;
  v_profile_id uuid;
begin
  -- Get the current authenticated user's ID and email
  v_user_id := auth.uid();
  
  if v_user_id is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  -- Get user email from auth.users
  select email into v_user_email
  from auth.users
  where id = v_user_id;

  if v_user_email is null then
    return json_build_object('error', 'User not found');
  end if;

  -- Insert the profile
  insert into public.profiles (
    id,
    email,
    display_name,
    role,
    verification_status,
    is_active
  )
  values (
    v_user_id,
    v_user_email,
    p_display_name,
    'traveler',
    'unverified',
    true
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    email = excluded.email,
    updated_at = now()
  returning id into v_profile_id;

  return json_build_object(
    'success', true,
    'profile_id', v_profile_id
  );
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists protect_profile_sensitive_fields on public.profiles;
create trigger protect_profile_sensitive_fields
before update on public.profiles
for each row execute function public.protect_profile_sensitive_fields();

drop trigger if exists set_trusted_contacts_updated_at on public.trusted_contacts;
create trigger set_trusted_contacts_updated_at
before update on public.trusted_contacts
for each row execute function public.set_updated_at();

drop trigger if exists set_vehicles_updated_at on public.vehicles;
create trigger set_vehicles_updated_at
before update on public.vehicles
for each row execute function public.set_updated_at();

drop trigger if exists set_id_verifications_updated_at on public.id_verifications;
create trigger set_id_verifications_updated_at
before update on public.id_verifications
for each row execute function public.set_updated_at();

drop trigger if exists set_trips_updated_at on public.trips;
create trigger set_trips_updated_at
before update on public.trips
for each row execute function public.set_updated_at();

drop trigger if exists set_trip_members_updated_at on public.trip_members;
create trigger set_trip_members_updated_at
before update on public.trip_members
for each row execute function public.set_updated_at();

drop trigger if exists set_chat_threads_updated_at on public.chat_threads;
create trigger set_chat_threads_updated_at
before update on public.chat_threads
for each row execute function public.set_updated_at();

drop trigger if exists set_chat_participants_updated_at on public.chat_participants;
create trigger set_chat_participants_updated_at
before update on public.chat_participants
for each row execute function public.set_updated_at();

drop trigger if exists set_reports_updated_at on public.reports;
create trigger set_reports_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

drop trigger if exists set_feedback_updated_at on public.feedback;
create trigger set_feedback_updated_at
before update on public.feedback
for each row execute function public.set_updated_at();

drop trigger if exists set_payment_history_updated_at on public.payment_history;
create trigger set_payment_history_updated_at
before update on public.payment_history
for each row execute function public.set_updated_at();

drop trigger if exists set_system_settings_updated_at on public.system_settings;
create trigger set_system_settings_updated_at
before update on public.system_settings
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.trusted_contacts enable row level security;
alter table public.vehicles enable row level security;
alter table public.id_verifications enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.pairing_history enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.current_locations enable row level security;
alter table public.location_history enable row level security;
alter table public.reports enable row level security;
alter table public.feedback enable row level security;
alter table public.audit_logs enable row level security;
alter table public.payment_history enable row level security;
alter table public.system_settings enable row level security;

drop policy if exists "profiles select own or staff" on public.profiles;
create policy "profiles select own or staff"
on public.profiles
for select
to authenticated
using (auth.uid() = id or public.is_staff_or_admin());

drop policy if exists "profiles insert own or staff" on public.profiles;
create policy "profiles insert own or staff"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id or public.is_staff_or_admin());

drop policy if exists "profiles update own or staff" on public.profiles;
create policy "profiles update own or staff"
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.is_staff_or_admin())
with check (auth.uid() = id or public.is_staff_or_admin());

drop policy if exists "trusted contacts own access" on public.trusted_contacts;
create policy "trusted contacts own access"
on public.trusted_contacts
for all
to authenticated
using (user_id = auth.uid() or public.is_staff_or_admin())
with check (user_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "vehicles own access" on public.vehicles;
create policy "vehicles own access"
on public.vehicles
for all
to authenticated
using (user_id = auth.uid() or public.is_staff_or_admin())
with check (user_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "id verifications own select" on public.id_verifications;
create policy "id verifications own select"
on public.id_verifications
for select
to authenticated
using (user_id = auth.uid() or submitted_by = auth.uid() or public.is_staff_or_admin());

drop policy if exists "id verifications own insert" on public.id_verifications;
create policy "id verifications own insert"
on public.id_verifications
for insert
to authenticated
with check ((user_id = auth.uid() and submitted_by = auth.uid()) or public.is_staff_or_admin());

drop policy if exists "id verifications staff update" on public.id_verifications;
create policy "id verifications staff update"
on public.id_verifications
for update
to authenticated
using (public.is_staff_or_admin())
with check (public.is_staff_or_admin());

drop policy if exists "trips read access" on public.trips;
create policy "trips read access"
on public.trips
for select
to authenticated
using (visibility = 'public' or creator_id = auth.uid() or public.is_trip_member(id) or public.is_staff_or_admin());

drop policy if exists "trips write access" on public.trips;
create policy "trips write access"
on public.trips
for insert
to authenticated
with check (creator_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "trips update access" on public.trips;
create policy "trips update access"
on public.trips
for update
to authenticated
using (creator_id = auth.uid() or public.is_staff_or_admin())
with check (creator_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "trip members access" on public.trip_members;
create policy "trip members access"
on public.trip_members
for all
to authenticated
using (
  user_id = auth.uid()
  or public.is_staff_or_admin()
  or exists (select 1 from public.trips t where t.id = trip_id and t.creator_id = auth.uid())
)
with check (
  user_id = auth.uid()
  or public.is_staff_or_admin()
  or exists (select 1 from public.trips t where t.id = trip_id and t.creator_id = auth.uid())
);

drop policy if exists "pairing history access" on public.pairing_history;
create policy "pairing history access"
on public.pairing_history
for select
to authenticated
using (user_id = auth.uid() or matched_user_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "pairing history write" on public.pairing_history;
create policy "pairing history write"
on public.pairing_history
for insert
to authenticated
with check (user_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "chat threads access" on public.chat_threads;
create policy "chat threads access"
on public.chat_threads
for select
to authenticated
using (public.is_staff_or_admin() or public.is_thread_participant(id));

drop policy if exists "chat threads create" on public.chat_threads;
create policy "chat threads create"
on public.chat_threads
for insert
to authenticated
with check (created_by = auth.uid() or public.is_staff_or_admin());

drop policy if exists "chat participants access" on public.chat_participants;
create policy "chat participants access"
on public.chat_participants
for all
to authenticated
using (user_id = auth.uid() or public.is_staff_or_admin())
with check (user_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "chat messages access" on public.chat_messages;
create policy "chat messages access"
on public.chat_messages
for select
to authenticated
using (public.is_staff_or_admin() or public.is_thread_participant(thread_id));

drop policy if exists "chat messages insert" on public.chat_messages;
create policy "chat messages insert"
on public.chat_messages
for insert
to authenticated
with check (sender_id = auth.uid() and public.is_thread_participant(thread_id) or public.is_staff_or_admin());

drop policy if exists "current locations access" on public.current_locations;
create policy "current locations access"
on public.current_locations
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_staff_or_admin()
  or (trip_id is not null and public.is_trip_member(trip_id))
);

drop policy if exists "current locations write" on public.current_locations;
create policy "current locations write"
on public.current_locations
for insert
to authenticated
with check (user_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "current locations update" on public.current_locations;
create policy "current locations update"
on public.current_locations
for update
to authenticated
using (user_id = auth.uid() or public.is_staff_or_admin())
with check (user_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "location history access" on public.location_history;
create policy "location history access"
on public.location_history
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_staff_or_admin()
  or (trip_id is not null and public.is_trip_member(trip_id))
);

drop policy if exists "location history write" on public.location_history;
create policy "location history write"
on public.location_history
for insert
to authenticated
with check (user_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "reports access" on public.reports;
create policy "reports access"
on public.reports
for select
to authenticated
using (reporter_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "reports insert" on public.reports;
create policy "reports insert"
on public.reports
for insert
to authenticated
with check (reporter_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "reports update" on public.reports;
create policy "reports update"
on public.reports
for update
to authenticated
using (public.is_staff_or_admin())
with check (public.is_staff_or_admin());

drop policy if exists "feedback access" on public.feedback;
create policy "feedback access"
on public.feedback
for select
to authenticated
using (author_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "feedback insert" on public.feedback;
create policy "feedback insert"
on public.feedback
for insert
to authenticated
with check (author_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "feedback update" on public.feedback;
create policy "feedback update"
on public.feedback
for update
to authenticated
using (public.is_staff_or_admin())
with check (public.is_staff_or_admin());

drop policy if exists "audit logs access" on public.audit_logs;
create policy "audit logs access"
on public.audit_logs
for select
to authenticated
using (public.is_staff_or_admin());

drop policy if exists "audit logs insert" on public.audit_logs;
create policy "audit logs insert"
on public.audit_logs
for insert
to authenticated
with check (public.is_staff_or_admin());

drop policy if exists "payment history access" on public.payment_history;
create policy "payment history access"
on public.payment_history
for select
to authenticated
using (user_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "payment history insert" on public.payment_history;
create policy "payment history insert"
on public.payment_history
for insert
to authenticated
with check (user_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "payment history update" on public.payment_history;
create policy "payment history update"
on public.payment_history
for update
to authenticated
using (public.is_staff_or_admin())
with check (public.is_staff_or_admin());

drop policy if exists "system settings access" on public.system_settings;
create policy "system settings access"
on public.system_settings
for select
to authenticated
using (public.is_staff_or_admin());

drop policy if exists "system settings update" on public.system_settings;
create policy "system settings update"
on public.system_settings
for insert
to authenticated
with check (public.is_staff_or_admin());

drop policy if exists "system settings modify" on public.system_settings;
create policy "system settings modify"
on public.system_settings
for update
to authenticated
using (public.is_staff_or_admin())
with check (public.is_staff_or_admin());

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

commit;