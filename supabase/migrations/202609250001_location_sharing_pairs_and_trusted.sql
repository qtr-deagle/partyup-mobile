-- Location sharing rules (privacy & safety):
--   * Trusted circle (accepted trusted_contacts, either direction) see each
--     other's location 24/7, as long as the target's is_visible is on.
--   * Paired travelers (accepted friend request) get a location_pair_session
--     and see each other at any distance. Once they are within 10 m of each
--     other the session ends automatically and sharing stops for that pair.
--     Either side can restart sharing later.
--   * Push tokens + realtime notifications so SOS alerts are unmissable.

begin;

-- ---------------------------------------------------------------------------
-- Pair sessions
-- ---------------------------------------------------------------------------

create table if not exists public.location_pair_sessions (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  ended_reason text check (ended_reason in ('proximity', 'manual', 'unfriended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (user_a < user_b)
);

create unique index if not exists location_pair_sessions_active_idx
  on public.location_pair_sessions (user_a, user_b)
  where status = 'active';

create index if not exists location_pair_sessions_user_b_idx
  on public.location_pair_sessions (user_b)
  where status = 'active';

alter table public.location_pair_sessions enable row level security;

drop policy if exists "pair sessions participants read" on public.location_pair_sessions;
create policy "pair sessions participants read"
on public.location_pair_sessions
for select
to authenticated
using (auth.uid() in (user_a, user_b) or public.is_staff_or_admin());

grant select on public.location_pair_sessions to authenticated;

-- Starts (or keeps) an active session for a pair. Internal helper.
create or replace function public.start_location_pair_session(p_one uuid, p_two uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.location_pair_sessions (user_a, user_b)
  values (least(p_one, p_two), greatest(p_one, p_two))
  on conflict (user_a, user_b) where status = 'active' do nothing;
$$;

create or replace function public.end_location_pair_session(p_one uuid, p_two uuid, p_reason text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.location_pair_sessions
  set status = 'ended', ended_reason = p_reason, ended_at = now()
  where user_a = least(p_one, p_two) and user_b = greatest(p_one, p_two) and status = 'active';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.start_location_pair_session(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.end_location_pair_session(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who can see whom
-- ---------------------------------------------------------------------------

create or replace function public.location_share_kind(p_viewer uuid, p_target uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- Only answers for the caller, so nobody can probe other people's relationships.
  select case
    when p_viewer is distinct from auth.uid() then null
    when exists (
      select 1 from public.trusted_contacts tc
      where tc.status = 'accepted'
        and ((tc.user_id = p_viewer and tc.contact_user_id = p_target)
          or (tc.user_id = p_target and tc.contact_user_id = p_viewer))
    ) then 'trusted'
    when exists (
      select 1 from public.location_pair_sessions s
      where s.status = 'active'
        and s.user_a = least(p_viewer, p_target)
        and s.user_b = greatest(p_viewer, p_target)
    ) then 'pair'
    else null
  end;
$$;

create or replace function public.can_view_location(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.location_share_kind(p_viewer, p_target) is not null;
$$;

grant execute on function public.location_share_kind(uuid, uuid) to authenticated;
grant execute on function public.can_view_location(uuid, uuid) to authenticated;

drop policy if exists "current locations access" on public.current_locations;
create policy "current locations access"
on public.current_locations
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_staff_or_admin()
  or (is_visible and public.can_view_location(auth.uid(), user_id))
);

-- ---------------------------------------------------------------------------
-- Friend request lifecycle -> pair sessions
-- ---------------------------------------------------------------------------

create or replace function public.handle_friend_request_pair_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'accepted' then
      perform public.end_location_pair_session(old.requester_id, old.recipient_id, 'unfriended');
    end if;
    return old;
  end if;

  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    perform public.start_location_pair_session(new.requester_id, new.recipient_id);
  elsif tg_op = 'UPDATE' and old.status = 'accepted' and new.status <> 'accepted' then
    perform public.end_location_pair_session(new.requester_id, new.recipient_id, 'unfriended');
  end if;
  return new;
end;
$$;

drop trigger if exists friend_requests_pair_session on public.friend_requests;
create trigger friend_requests_pair_session
after insert or update of status or delete on public.friend_requests
for each row execute function public.handle_friend_request_pair_session();

-- ---------------------------------------------------------------------------
-- Proximity: within 10 m -> end the pair session automatically
-- ---------------------------------------------------------------------------

create or replace function public.handle_location_pair_proximity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_partner public.current_locations;
  v_distance double precision;
  v_my_name text;
  v_partner_name text;
begin
  if new.accuracy_m is not null and new.accuracy_m > 25 then
    return new;
  end if;

  for v_session in
    select s.id, case when s.user_a = new.user_id then s.user_b else s.user_a end as partner_id
    from public.location_pair_sessions s
    where s.status = 'active' and new.user_id in (s.user_a, s.user_b)
  loop
    select * into v_partner from public.current_locations where user_id = v_session.partner_id;
    if v_partner.user_id is null
      or v_partner.updated_at < now() - interval '2 minutes'
      or (v_partner.accuracy_m is not null and v_partner.accuracy_m > 25) then
      continue;
    end if;

    v_distance := earth_distance(
      ll_to_earth(new.latitude, new.longitude),
      ll_to_earth(v_partner.latitude, v_partner.longitude)
    );

    if v_distance <= 10 then
      update public.location_pair_sessions
      set status = 'ended', ended_reason = 'proximity', ended_at = now()
      where id = v_session.id and status = 'active';

      if found then
        select display_name into v_my_name from public.profiles where id = new.user_id;
        select display_name into v_partner_name from public.profiles where id = v_session.partner_id;

        insert into public.notifications (user_id, type, title, message, data)
        values
          (new.user_id, 'match', 'You met up with ' || coalesce(v_partner_name, 'your match'),
           'Location sharing turned off automatically for your privacy.',
           jsonb_build_object('pair_session_id', v_session.id, 'other_user_id', v_session.partner_id)),
          (v_session.partner_id, 'match', 'You met up with ' || coalesce(v_my_name, 'your match'),
           'Location sharing turned off automatically for your privacy.',
           jsonb_build_object('pair_session_id', v_session.id, 'other_user_id', new.user_id));
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists current_locations_pair_proximity on public.current_locations;
create trigger current_locations_pair_proximity
after insert or update of latitude, longitude on public.current_locations
for each row execute function public.handle_location_pair_proximity();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.restart_location_share(p_other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.requester_id = auth.uid() and fr.recipient_id = p_other_user_id)
        or (fr.recipient_id = auth.uid() and fr.requester_id = p_other_user_id))
  ) then
    raise exception 'You can only share your location with travelers you are connected with';
  end if;

  perform public.start_location_pair_session(auth.uid(), p_other_user_id);
end;
$$;

create or replace function public.end_location_share(p_other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  perform public.end_location_pair_session(auth.uid(), p_other_user_id, 'manual');
end;
$$;

grant execute on function public.restart_location_share(uuid) to authenticated;
grant execute on function public.end_location_share(uuid) to authenticated;

-- Everyone the caller can currently see on the map, at any distance.
create or replace function public.list_shared_locations()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  latitude numeric,
  longitude numeric,
  updated_at timestamptz,
  distance_m double precision,
  share_kind text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select cl.latitude, cl.longitude from public.current_locations cl where cl.user_id = auth.uid()
  ),
  visible as (
    select cl.*, public.location_share_kind(auth.uid(), cl.user_id) as kind
    from public.current_locations cl
    where cl.user_id <> auth.uid() and cl.is_visible
  )
  select
    v.user_id,
    p.display_name,
    p.avatar_url,
    v.latitude,
    v.longitude,
    v.updated_at,
    (select earth_distance(ll_to_earth(me.latitude, me.longitude), ll_to_earth(v.latitude, v.longitude)) from me) as distance_m,
    v.kind as share_kind
  from visible v
  join public.profiles p on p.id = v.user_id
  where v.kind is not null and p.is_active
  order by v.kind desc, v.updated_at desc;
$$;

grant execute on function public.list_shared_locations() to authenticated;

-- Nearby discovery keeps the 5 km radius, but coordinates are only returned
-- for people the caller is allowed to see (trusted or active pair).
drop function if exists public.get_nearby_travelers(numeric);
create function public.get_nearby_travelers(p_radius_km numeric default 5)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  distance_km numeric,
  is_friend boolean,
  latitude numeric,
  longitude numeric,
  share_kind text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select cl.latitude, cl.longitude
    from public.current_locations cl
    where cl.user_id = auth.uid() and cl.is_visible
  ),
  candidates as (
    select
      cl.user_id,
      p.display_name,
      p.avatar_url,
      cl.latitude,
      cl.longitude,
      earth_distance(ll_to_earth(me.latitude, me.longitude), ll_to_earth(cl.latitude, cl.longitude)) as distance_m,
      exists (
        select 1 from public.friend_requests fr
        where fr.status = 'accepted'
          and ((fr.requester_id = auth.uid() and fr.recipient_id = cl.user_id)
            or (fr.recipient_id = auth.uid() and fr.requester_id = cl.user_id))
      ) as is_friend,
      public.location_share_kind(auth.uid(), cl.user_id) as share_kind
    from public.current_locations cl
    cross join me
    join public.profiles p on p.id = cl.user_id
    where cl.user_id <> auth.uid()
      and cl.is_visible
      and p.is_active
      and earth_box(ll_to_earth(me.latitude, me.longitude), p_radius_km * 1000) @> ll_to_earth(cl.latitude, cl.longitude)
  )
  select
    c.user_id,
    c.display_name,
    c.avatar_url,
    round((c.distance_m / 1000)::numeric, 1) as distance_km,
    c.is_friend,
    case when c.share_kind is not null then c.latitude else null end as latitude,
    case when c.share_kind is not null then c.longitude else null end as longitude,
    c.share_kind
  from candidates c
  where c.distance_m <= p_radius_km * 1000
  order by c.distance_m asc
  limit 100;
$$;

grant execute on function public.get_nearby_travelers(numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Push tokens
-- ---------------------------------------------------------------------------

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "push tokens own access" on public.push_tokens;
create policy "push tokens own access"
on public.push_tokens
for select
to authenticated
using (user_id = auth.uid());

grant select on public.push_tokens to authenticated;

-- A device token belongs to whoever signed in on it most recently.
create or replace function public.register_push_token(p_token text, p_platform text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'location_pair_sessions'
  ) then
    alter publication supabase_realtime add table public.location_pair_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

commit;
