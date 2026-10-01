begin;

-- =====================================================================
-- Guild join policy. Each guild is either 'open' (instant join, the old
-- behavior) or 'approval' (travelers send a request the leader accepts or
-- declines). New guilds default to approval; existing guilds stay open so
-- nothing changes for them silently.
-- =====================================================================
alter table public.guilds
  add column if not exists join_policy text not null default 'approval'
  check (join_policy in ('open', 'approval'));

update public.guilds set join_policy = 'open';

create table if not exists public.guild_join_requests (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references public.profiles(id) on delete set null
);

-- One pending request per traveler at a time.
create unique index if not exists guild_join_requests_one_pending_idx
  on public.guild_join_requests(user_id) where status = 'pending';
create index if not exists guild_join_requests_guild_idx
  on public.guild_join_requests(guild_id, status, created_at);

alter table public.guild_join_requests enable row level security;

drop policy if exists "join requests own, leader or admin" on public.guild_join_requests;
create policy "join requests own, leader or admin" on public.guild_join_requests for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.guilds g where g.id = guild_id and g.leader_id = auth.uid())
    or public.current_user_role() = 'admin'
  );

grant select on public.guild_join_requests to authenticated;
grant all on public.guild_join_requests to service_role;

-- =====================================================================
-- join_guild now returns 'joined' (open guild) or 'requested' (approval).
-- =====================================================================
drop function if exists public.join_guild(uuid);

create function public.join_guild(p_guild_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if public.current_user_role() <> 'traveler' then
    raise exception 'Guild Leaders and admins can''t join another guild';
  end if;
  if (select verification_status from public.profiles where id = auth.uid()) is distinct from 'approved' then
    raise exception 'Verify your ID before joining a guild';
  end if;
  if exists (select 1 from public.guild_members where user_id = auth.uid()) then
    raise exception 'Leave your current guild first';
  end if;

  select * into v_guild from public.guilds where id = p_guild_id;
  if v_guild.id is null then
    raise exception 'Guild not found';
  end if;

  select display_name into v_name from public.profiles where id = auth.uid();

  if v_guild.join_policy = 'approval' then
    -- A new request replaces any older pending one.
    update public.guild_join_requests
    set status = 'cancelled', handled_at = now(), handled_by = auth.uid()
    where user_id = auth.uid() and status = 'pending';

    insert into public.guild_join_requests (guild_id, user_id) values (p_guild_id, auth.uid());

    insert into public.notifications (user_id, type, title, message, data)
    values (v_guild.leader_id, 'system', 'New join request',
      coalesce(v_name, 'A traveler') || ' wants to join ' || v_guild.name || '.',
      jsonb_build_object('guild_id', v_guild.id, 'route', '/guild'));
    return 'requested';
  end if;

  -- Open guild: join right away, and drop any request left pending elsewhere.
  update public.guild_join_requests
  set status = 'cancelled', handled_at = now(), handled_by = auth.uid()
  where user_id = auth.uid() and status = 'pending';

  insert into public.guild_members (user_id, guild_id) values (auth.uid(), p_guild_id);
  perform public.award_guild_points(auth.uid(), 10, 'guild_joined', 'once', p_guild_id, v_guild.name);

  insert into public.notifications (user_id, type, title, message, data)
  values (v_guild.leader_id, 'system', 'New guild member',
    coalesce(v_name, 'A traveler') || ' joined ' || v_guild.name || '.',
    jsonb_build_object('guild_id', v_guild.id, 'route', '/guild'));
  return 'joined';
end;
$$;

-- Leader (or admin) accepts or declines a pending request.
create or replace function public.respond_guild_join_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.guild_join_requests;
  v_guild public.guilds;
begin
  select * into v_request from public.guild_join_requests where id = p_request_id for update;
  if v_request.id is null or v_request.status <> 'pending' then
    raise exception 'This request was already handled';
  end if;

  select * into v_guild from public.guilds where id = v_request.guild_id;
  if not (v_guild.leader_id = auth.uid() or public.current_user_role() = 'admin') then
    raise exception 'Only this guild''s leader can answer join requests';
  end if;

  if p_accept then
    -- Normally impossible (joining an open guild cancels pending requests),
    -- but guard against races.
    if exists (select 1 from public.guild_members where user_id = v_request.user_id) then
      raise exception 'They already joined another guild';
    end if;

    update public.guild_join_requests set status = 'accepted', handled_at = now(), handled_by = auth.uid()
    where id = v_request.id;
    insert into public.guild_members (user_id, guild_id) values (v_request.user_id, v_guild.id);
    perform public.award_guild_points(v_request.user_id, 10, 'guild_joined', 'once', v_guild.id, v_guild.name);

    insert into public.notifications (user_id, type, title, message, data)
    values (v_request.user_id, 'system', 'You''re in!',
      'Your request to join ' || v_guild.name || ' was accepted.',
      jsonb_build_object('guild_id', v_guild.id, 'route', '/guild'));
  else
    update public.guild_join_requests set status = 'declined', handled_at = now(), handled_by = auth.uid()
    where id = v_request.id;

    insert into public.notifications (user_id, type, title, message, data)
    values (v_request.user_id, 'system', 'Join request declined',
      v_guild.name || ' didn''t accept your request this time. You can ask another guild.',
      jsonb_build_object('route', '/guild'));
  end if;
end;
$$;

create or replace function public.cancel_guild_join_request()
returns void
language sql
security definer
set search_path = public
as $$
  update public.guild_join_requests
  set status = 'cancelled', handled_at = now(), handled_by = auth.uid()
  where user_id = auth.uid() and status = 'pending';
$$;

-- Pending requests for a guild, for its leader (or an admin).
create or replace function public.get_guild_join_requests(p_guild_id uuid)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  lifetime_points bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.user_id, p.display_name, p.avatar_url, public.guild_lifetime_points(r.user_id), r.created_at
  from public.guild_join_requests r
  join public.guilds g on g.id = r.guild_id
  join public.profiles p on p.id = r.user_id
  where r.guild_id = p_guild_id
    and r.status = 'pending'
    and (g.leader_id = auth.uid() or public.current_user_role() = 'admin')
  order by r.created_at;
$$;

-- The caller's own pending request, with the guild's look.
create or replace function public.get_my_guild_join_request()
returns table (
  id uuid,
  guild_id uuid,
  guild_name text,
  guild_emblem text,
  guild_color text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, g.id, g.name, g.emblem, g.color, r.created_at
  from public.guild_join_requests r
  join public.guilds g on g.id = r.guild_id
  where r.user_id = auth.uid() and r.status = 'pending'
  limit 1;
$$;

-- =====================================================================
-- create_guild / update_guild gain the join policy. Founding defaults to
-- approval; on update, null keeps the current value.
-- =====================================================================
drop function if exists public.create_guild(text, text, text, text);

create function public.create_guild(
  p_name text,
  p_tagline text default null,
  p_emblem text default 'shield',
  p_color text default '#2563EB',
  p_join_policy text default 'approval'
)
returns public.guilds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if public.current_user_role() <> 'guild_leader' then
    raise exception 'Only Guild Leaders can found a guild';
  end if;
  if exists (select 1 from public.guilds where leader_id = auth.uid()) then
    raise exception 'You already lead a guild';
  end if;
  if exists (select 1 from public.guilds where lower(btrim(name)) = lower(btrim(p_name))) then
    raise exception 'That guild name is taken';
  end if;

  insert into public.guilds (name, tagline, emblem, color, leader_id, join_policy)
  values (btrim(p_name), nullif(btrim(coalesce(p_tagline, '')), ''), coalesce(p_emblem, 'shield'), coalesce(p_color, '#2563EB'), auth.uid(),
    coalesce(p_join_policy, 'approval'))
  returning * into v_guild;

  delete from public.guild_members where user_id = auth.uid();
  insert into public.guild_members (user_id, guild_id) values (auth.uid(), v_guild.id);

  perform public.award_guild_points(auth.uid(), 50, 'guild_founded', 'once', v_guild.id, v_guild.name);

  return v_guild;
end;
$$;

drop function if exists public.update_guild(uuid, text, text, text, text);

create function public.update_guild(
  p_guild_id uuid,
  p_name text,
  p_tagline text,
  p_emblem text,
  p_color text,
  p_join_policy text default null
)
returns public.guilds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
begin
  if not exists (
    select 1 from public.guilds
    where id = p_guild_id and (leader_id = auth.uid() or public.current_user_role() = 'admin')
  ) then
    raise exception 'Only this guild''s leader can edit it';
  end if;
  if exists (
    select 1 from public.guilds where id <> p_guild_id and lower(btrim(name)) = lower(btrim(p_name))
  ) then
    raise exception 'That guild name is taken';
  end if;

  update public.guilds
  set name = btrim(p_name),
      tagline = nullif(btrim(coalesce(p_tagline, '')), ''),
      emblem = coalesce(p_emblem, emblem),
      color = coalesce(p_color, color),
      join_policy = coalesce(p_join_policy, join_policy)
  where id = p_guild_id
  returning * into v_guild;

  return v_guild;
end;
$$;

-- =====================================================================
-- Leaderboard rows carry the policy so the app can show Join vs Request.
-- =====================================================================
drop function if exists public.get_guild_leaderboard(text);

create function public.get_guild_leaderboard(p_period text default 'all')
returns table (
  guild_id uuid,
  name text,
  tagline text,
  emblem text,
  color text,
  leader_id uuid,
  leader_name text,
  member_count bigint,
  points bigint,
  lifetime_points bigint,
  join_policy text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id, g.name, g.tagline, g.emblem, g.color, g.leader_id, p.display_name,
    (select count(*) from public.guild_members gm where gm.guild_id = g.id),
    coalesce((
      select sum(e.amount) from public.guild_point_events e
      where e.guild_id = g.id and e.amount > 0 and e.reason <> 'redemption_refund'
        and e.created_at >= public.guild_period_start(p_period)
    ), 0)::bigint,
    coalesce((
      select sum(e.amount) from public.guild_point_events e
      where e.guild_id = g.id and e.amount > 0 and e.reason <> 'redemption_refund'
    ), 0)::bigint,
    g.join_policy
  from public.guilds g
  join public.profiles p on p.id = g.leader_id
  order by 9 desc, 8 desc, g.created_at;
$$;

grant execute on function public.create_guild(text, text, text, text, text) to authenticated;
grant execute on function public.join_guild(uuid) to authenticated;
grant execute on function public.respond_guild_join_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_guild_join_request() to authenticated;
grant execute on function public.get_guild_join_requests(uuid) to authenticated;
grant execute on function public.get_my_guild_join_request() to authenticated;
grant execute on function public.update_guild(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.get_guild_leaderboard(text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guild_join_requests'
  ) then
    alter publication supabase_realtime add table public.guild_join_requests;
  end if;
end;
$$;

commit;
