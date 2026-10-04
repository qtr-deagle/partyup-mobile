begin;

-- =====================================================================
-- Guild "Let's PartyUp" is its own thing now: a casual hangout for guild
-- mates only. Not a carpool, not a tour, no outsiders, no payments.
--   * The guild leader taps "Let's PartyUp", names the plan, pins where
--     to meet and when, and every member gets a notification.
--   * Members tap "I'm going" and show up in the going list.
-- The trips.guild_id route from 202610030008 is no longer used by the app.
-- =====================================================================

create table if not exists public.guild_partyups (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  place_label text not null check (char_length(place_label) between 1 and 160),
  place_municipality text,
  place_lat numeric(10,7),
  place_lng numeric(10,7),
  meet_at timestamptz not null,
  notes text check (notes is null or char_length(notes) <= 500),
  status text not null default 'open' check (status in ('open', 'cancelled')),
  created_at timestamptz not null default now(),
  check ((place_lat is null) = (place_lng is null))
);

create index if not exists guild_partyups_guild_meet_idx on public.guild_partyups(guild_id, meet_at);

create table if not exists public.guild_partyup_members (
  partyup_id uuid not null references public.guild_partyups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (partyup_id, user_id)
);

-- Everything goes through the security-definer RPCs below; members can
-- still read their guild's rows directly.
alter table public.guild_partyups enable row level security;
alter table public.guild_partyup_members enable row level security;

drop policy if exists guild_partyups_select_members on public.guild_partyups;
create policy guild_partyups_select_members on public.guild_partyups
  for select to authenticated
  using (public.is_guild_member_of(guild_id) or public.is_admin());

drop policy if exists guild_partyup_members_select_members on public.guild_partyup_members;
create policy guild_partyup_members_select_members on public.guild_partyup_members
  for select to authenticated
  using (
    exists (
      select 1 from public.guild_partyups p
      where p.id = partyup_id and (public.is_guild_member_of(p.guild_id) or public.is_admin())
    )
  );

grant select, insert, update, delete on public.guild_partyups to authenticated;
grant select, insert, update, delete on public.guild_partyups to service_role;
grant select, insert, update, delete on public.guild_partyup_members to authenticated;
grant select, insert, update, delete on public.guild_partyup_members to service_role;

-- ---------------------------------------------------------------------
-- Leader posts a PartyUp; the leader counts as going.
-- ---------------------------------------------------------------------
create or replace function public.create_guild_partyup(
  p_guild_id uuid,
  p_title text,
  p_place_label text,
  p_meet_at timestamptz,
  p_place_municipality text default null,
  p_place_lat numeric default null,
  p_place_lng numeric default null,
  p_notes text default null
)
returns public.guild_partyups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
  v_partyup public.guild_partyups;
begin
  select * into v_guild from public.guilds g where g.id = p_guild_id and g.leader_id = auth.uid();
  if v_guild.id is null then
    raise exception 'Only the guild leader can start a PartyUp';
  end if;

  if trim(coalesce(p_title, '')) = '' or trim(coalesce(p_place_label, '')) = '' then
    raise exception 'Add what you''re doing and where to meet';
  end if;

  if p_meet_at is null or p_meet_at < now() - interval '5 minutes' then
    raise exception 'Pick a meetup time that hasn''t passed yet';
  end if;

  if (p_place_lat is null) <> (p_place_lng is null) then
    raise exception 'Map pins need both latitude and longitude';
  end if;

  insert into public.guild_partyups (
    guild_id, created_by, title, place_label, place_municipality, place_lat, place_lng, meet_at, notes
  )
  values (
    p_guild_id, auth.uid(), trim(p_title), trim(p_place_label), p_place_municipality,
    p_place_lat, p_place_lng, p_meet_at, nullif(trim(coalesce(p_notes, '')), '')
  )
  returning * into v_partyup;

  insert into public.guild_partyup_members (partyup_id, user_id) values (v_partyup.id, auth.uid());

  insert into public.notifications (user_id, type, title, message, data)
  select gm.user_id, 'system', '🎉 Let''s PartyUp! ' || v_guild.name,
    v_partyup.title || ' at ' || v_partyup.place_label || '. Tap to join your guild mates.',
    jsonb_build_object('guild_id', v_guild.id, 'partyup_id', v_partyup.id, 'route', '/guild')
  from public.guild_members gm
  where gm.guild_id = p_guild_id and gm.user_id <> auth.uid();

  return v_partyup;
end;
$$;

grant execute on function public.create_guild_partyup(uuid, text, text, timestamptz, text, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- Upcoming PartyUps with who's going. Stays listed until 12h after the
-- meetup time so people can still find the pin on the day.
-- ---------------------------------------------------------------------
drop function if exists public.list_guild_partyups(uuid);

create function public.list_guild_partyups(p_guild_id uuid)
returns table (
  id uuid, title text, place_label text, place_municipality text,
  place_lat numeric, place_lng numeric, meet_at timestamptz, notes text,
  created_by uuid, creator_name text, going_count int, i_am_going boolean,
  going jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_guild_member_of(p_guild_id) and not public.is_admin() then
    raise exception 'Guild not found';
  end if;

  return query
  select
    p.id, p.title, p.place_label, p.place_municipality, p.place_lat, p.place_lng, p.meet_at, p.notes,
    p.created_by, c.display_name,
    (select count(*) from public.guild_partyup_members m where m.partyup_id = p.id)::int,
    exists (select 1 from public.guild_partyup_members m where m.partyup_id = p.id and m.user_id = auth.uid()),
    coalesce((
      select jsonb_agg(jsonb_build_object('user_id', pr.id, 'display_name', pr.display_name, 'avatar_url', pr.avatar_url) order by m.joined_at)
      from public.guild_partyup_members m
      join public.profiles pr on pr.id = m.user_id
      where m.partyup_id = p.id
    ), '[]'::jsonb)
  from public.guild_partyups p
  join public.profiles c on c.id = p.created_by
  where p.guild_id = p_guild_id
    and p.status = 'open'
    and p.meet_at > now() - interval '12 hours'
  order by p.meet_at;
end;
$$;

grant execute on function public.list_guild_partyups(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Members join / leave. Leader gets a heads-up when someone joins.
-- ---------------------------------------------------------------------
drop function if exists public.join_guild_partyup(uuid);

create function public.join_guild_partyup(p_partyup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partyup public.guild_partyups;
begin
  select * into v_partyup from public.guild_partyups p where p.id = p_partyup_id;
  if v_partyup.id is null or not public.is_guild_member_of(v_partyup.guild_id) then
    raise exception 'PartyUp not found';
  end if;
  if v_partyup.status <> 'open' then
    raise exception 'This PartyUp was cancelled';
  end if;
  if v_partyup.meet_at < now() - interval '12 hours' then
    raise exception 'This PartyUp already happened';
  end if;

  insert into public.guild_partyup_members (partyup_id, user_id)
  values (p_partyup_id, auth.uid())
  on conflict do nothing;

  if found and v_partyup.created_by <> auth.uid() then
    insert into public.notifications (user_id, type, title, message, data)
    values (
      v_partyup.created_by, 'system', 'New PartyUp buddy',
      (select display_name from public.profiles where id = auth.uid()) || ' is going to "' || v_partyup.title || '".',
      jsonb_build_object('guild_id', v_partyup.guild_id, 'partyup_id', v_partyup.id, 'route', '/guild')
    );
  end if;
end;
$$;

grant execute on function public.join_guild_partyup(uuid) to authenticated;

create or replace function public.leave_guild_partyup(p_partyup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.guild_partyups p where p.id = p_partyup_id and p.created_by = auth.uid()) then
    raise exception 'You started this PartyUp. Cancel it instead.';
  end if;
  delete from public.guild_partyup_members where partyup_id = p_partyup_id and user_id = auth.uid();
end;
$$;

grant execute on function public.leave_guild_partyup(uuid) to authenticated;

-- Leader calls it off; everyone who was going is told.
create or replace function public.cancel_guild_partyup(p_partyup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partyup public.guild_partyups;
begin
  update public.guild_partyups p
  set status = 'cancelled'
  where p.id = p_partyup_id
    and p.status = 'open'
    and exists (select 1 from public.guilds g where g.id = p.guild_id and g.leader_id = auth.uid())
  returning * into v_partyup;

  if v_partyup.id is null then
    raise exception 'Only the guild leader can cancel this PartyUp';
  end if;

  insert into public.notifications (user_id, type, title, message, data)
  select m.user_id, 'system', 'PartyUp cancelled',
    '"' || v_partyup.title || '" was called off by your guild leader.',
    jsonb_build_object('guild_id', v_partyup.guild_id, 'route', '/guild')
  from public.guild_partyup_members m
  where m.partyup_id = p_partyup_id and m.user_id <> auth.uid();
end;
$$;

grant execute on function public.cancel_guild_partyup(uuid) to authenticated;

commit;
