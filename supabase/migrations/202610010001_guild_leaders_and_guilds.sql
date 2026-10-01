begin;

-- =====================================================================
-- 1. "staff" becomes "guild_leader".
--    Every RLS policy / RPC checks staff access through is_staff_or_admin(),
--    so redefining it (plus the check constraint) is the whole DB rename.
-- =====================================================================
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'guild_leader' where role = 'staff';
alter table public.profiles
  add constraint profiles_role_check check (role in ('traveler', 'guild_leader', 'admin'));

create or replace function public.is_staff_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('guild_leader', 'admin');
$$;

-- =====================================================================
-- 2. Guilds. Each Guild Leader runs one guild; each person belongs to at
--    most one guild (guild_members.user_id is the primary key).
-- =====================================================================
create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 30),
  tagline text check (tagline is null or char_length(tagline) <= 80),
  emblem text not null default 'shield'
    check (emblem in ('shield', 'flame', 'mountain', 'compass', 'star', 'wave', 'leaf', 'crown')),
  color text not null default '#2563EB' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  leader_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists guilds_name_unique_idx on public.guilds (lower(btrim(name)));

drop trigger if exists set_guilds_updated_at on public.guilds;
create trigger set_guilds_updated_at
before update on public.guilds
for each row execute function public.set_updated_at();

create table if not exists public.guild_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  joined_at timestamptz not null default now()
);

create index if not exists guild_members_guild_id_idx on public.guild_members(guild_id);

-- =====================================================================
-- 3. Points ledger. Positive rows are earned points (rank, badges,
--    leaderboards); the running sum of all rows is the spendable coin
--    balance. Rows are only ever written by security-definer functions.
-- =====================================================================
create table if not exists public.guild_point_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  guild_id uuid references public.guilds(id) on delete set null,
  amount int not null check (amount <> 0),
  reason text not null check (reason in (
    'id_review', 'vehicle_review', 'report_resolved', 'report_dismissed', 'sos_resolved',
    'trip_completed', 'trip_hosted', 'guild_trip_bonus', 'guild_joined', 'guild_founded',
    'id_verified', 'redemption', 'redemption_refund', 'admin_adjustment'
  )),
  source_id uuid,
  source_key text not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, reason, source_key)
);

create index if not exists guild_point_events_user_idx on public.guild_point_events(user_id, created_at desc);
create index if not exists guild_point_events_guild_idx on public.guild_point_events(guild_id, created_at desc);

-- =====================================================================
-- 4. Reward catalog (admin-managed, fulfilled by hand) and redemptions.
-- =====================================================================
create table if not exists public.guild_rewards (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 60),
  description text check (description is null or char_length(description) <= 300),
  cost int not null check (cost > 0),
  audience text not null default 'everyone' check (audience in ('everyone', 'guild_leader', 'traveler')),
  stock int check (stock is null or stock >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_guild_rewards_updated_at on public.guild_rewards;
create trigger set_guild_rewards_updated_at
before update on public.guild_rewards
for each row execute function public.set_updated_at();

create table if not exists public.guild_reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.guild_rewards(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cost int not null check (cost > 0),
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'rejected')),
  admin_notes text,
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists guild_reward_redemptions_user_idx on public.guild_reward_redemptions(user_id, created_at desc);
create index if not exists guild_reward_redemptions_status_idx on public.guild_reward_redemptions(status, created_at);

-- =====================================================================
-- 5. RLS + grants (new tables need explicit grants; see 202609070001).
-- =====================================================================
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_point_events enable row level security;
alter table public.guild_rewards enable row level security;
alter table public.guild_reward_redemptions enable row level security;

drop policy if exists "guilds readable" on public.guilds;
create policy "guilds readable" on public.guilds for select to authenticated using (true);

drop policy if exists "guilds admin update" on public.guilds;
create policy "guilds admin update" on public.guilds for update to authenticated
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

drop policy if exists "guilds admin delete" on public.guilds;
create policy "guilds admin delete" on public.guilds for delete to authenticated
  using (public.current_user_role() = 'admin');

drop policy if exists "guild members readable" on public.guild_members;
create policy "guild members readable" on public.guild_members for select to authenticated using (true);

drop policy if exists "point events own or staff" on public.guild_point_events;
create policy "point events own or staff" on public.guild_point_events for select to authenticated
  using (user_id = auth.uid() or public.is_staff_or_admin());

drop policy if exists "rewards readable" on public.guild_rewards;
create policy "rewards readable" on public.guild_rewards for select to authenticated
  using (is_active or public.current_user_role() = 'admin');

drop policy if exists "rewards admin insert" on public.guild_rewards;
create policy "rewards admin insert" on public.guild_rewards for insert to authenticated
  with check (public.current_user_role() = 'admin');

drop policy if exists "rewards admin update" on public.guild_rewards;
create policy "rewards admin update" on public.guild_rewards for update to authenticated
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

drop policy if exists "redemptions own or admin" on public.guild_reward_redemptions;
create policy "redemptions own or admin" on public.guild_reward_redemptions for select to authenticated
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

grant select, update, delete on public.guilds to authenticated;
grant select on public.guild_members to authenticated;
grant select on public.guild_point_events to authenticated;
grant select, insert, update on public.guild_rewards to authenticated;
grant select on public.guild_reward_redemptions to authenticated;
grant all on public.guilds, public.guild_members, public.guild_point_events,
  public.guild_rewards, public.guild_reward_redemptions to service_role;

-- =====================================================================
-- 6. Awarding points. Internal only: never granted to clients.
--    Duplicate (user, reason, source_key) is silently ignored, and any
--    failure only raises a warning so it can never block a review/trip.
-- =====================================================================
create or replace function public.award_guild_points(
  p_user_id uuid,
  p_amount int,
  p_reason text,
  p_source_key text,
  p_source_id uuid default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_amount = 0 then
    return;
  end if;

  insert into public.guild_point_events (user_id, guild_id, amount, reason, source_id, source_key, note)
  values (
    p_user_id,
    (select gm.guild_id from public.guild_members gm where gm.user_id = p_user_id),
    p_amount, p_reason, p_source_id, p_source_key, p_note
  )
  on conflict (user_id, reason, source_key) do nothing;
exception when others then
  raise warning 'award_guild_points(%, %) failed: %', p_user_id, p_reason, sqlerrm;
end;
$$;

revoke all on function public.award_guild_points(uuid, int, text, text, uuid, text) from public, anon, authenticated;

create or replace function public.guild_role_of(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = p_user_id), 'traveler');
$$;

-- ID review: +10 to the reviewer, +50 once to the traveler when approved.
create or replace function public.guild_points_on_id_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('approved', 'rejected')
    and old.status in ('pending', 'resubmitted')
    and new.reviewer_id is not null
    and new.reviewer_id <> new.user_id then
    perform public.award_guild_points(new.reviewer_id, 10, 'id_review',
      'id:' || new.id || ':' || coalesce(extract(epoch from new.reviewed_at)::bigint::text, ''), new.id);
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform public.award_guild_points(new.user_id, 50, 'id_verified', 'once', new.id, 'Welcome to PartyUp');
  end if;

  return new;
end;
$$;

drop trigger if exists guild_points_id_review on public.id_verifications;
create trigger guild_points_id_review
after update of status on public.id_verifications
for each row execute function public.guild_points_on_id_review();

-- Vehicle review: +10 to the reviewer.
create or replace function public.guild_points_on_vehicle_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verification_status in ('approved', 'rejected')
    and old.verification_status = 'pending'
    and new.reviewer_id is not null
    and new.reviewer_id <> new.user_id then
    perform public.award_guild_points(new.reviewer_id, 10, 'vehicle_review',
      'vehicle:' || new.id || ':' || coalesce(extract(epoch from new.reviewed_at)::bigint::text, ''), new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists guild_points_vehicle_review on public.vehicles;
create trigger guild_points_vehicle_review
after update of verification_status on public.vehicles
for each row execute function public.guild_points_on_vehicle_review();

-- Reports: +15 resolved, +5 dismissed, to whoever closed it.
create or replace function public.guild_points_on_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('resolved', 'dismissed')
    and old.status in ('open', 'reviewing')
    and new.reviewed_by is not null
    and new.reviewed_by <> new.reporter_id then
    perform public.award_guild_points(
      new.reviewed_by,
      case when new.status = 'resolved' then 15 else 5 end,
      case when new.status = 'resolved' then 'report_resolved' else 'report_dismissed' end,
      'report:' || new.id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists guild_points_report on public.reports;
create trigger guild_points_report
after update of status on public.reports
for each row execute function public.guild_points_on_report();

-- SOS: +25 to the Guild Leader/admin who resolved someone else's alert.
create or replace function public.guild_points_on_sos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'resolved'
    and old.status = 'active'
    and new.resolved_by is not null
    and new.resolved_by <> new.user_id
    and public.guild_role_of(new.resolved_by) in ('guild_leader', 'admin') then
    perform public.award_guild_points(new.resolved_by, 25, 'sos_resolved', 'sos:' || new.id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists guild_points_sos on public.sos_alerts;
create trigger guild_points_sos
after update of status on public.sos_alerts
for each row execute function public.guild_points_on_sos();

-- Trips: when an ongoing trip with at least one other accepted traveler is
-- completed, the host gets +30, every accepted member +20, and each guild
-- that had someone on the trip gives its leader a +5 bonus.
create or replace function public.guild_points_on_trip_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
  v_leader record;
begin
  if not (new.status = 'completed' and old.status = 'ongoing') then
    return new;
  end if;

  if not exists (
    select 1 from public.trip_members tm
    where tm.trip_id = new.id and tm.status = 'accepted' and tm.user_id <> new.creator_id
  ) then
    return new;
  end if;

  perform public.award_guild_points(new.creator_id, 30, 'trip_hosted', 'trip:' || new.id, new.id, new.title);

  for v_member in
    select tm.user_id from public.trip_members tm
    where tm.trip_id = new.id and tm.status = 'accepted' and tm.user_id <> new.creator_id
  loop
    perform public.award_guild_points(v_member.user_id, 20, 'trip_completed', 'trip:' || new.id, new.id, new.title);
  end loop;

  for v_leader in
    select distinct g.leader_id
    from public.guild_members gm
    join public.guilds g on g.id = gm.guild_id
    where gm.user_id in (
      select new.creator_id
      union
      select tm.user_id from public.trip_members tm where tm.trip_id = new.id and tm.status = 'accepted'
    )
  loop
    perform public.award_guild_points(v_leader.leader_id, 5, 'guild_trip_bonus', 'trip:' || new.id, new.id, new.title);
  end loop;

  return new;
end;
$$;

drop trigger if exists guild_points_trip_completed on public.trips;
create trigger guild_points_trip_completed
after update of status on public.trips
for each row execute function public.guild_points_on_trip_completed();

-- =====================================================================
-- 7. Guild RPCs
-- =====================================================================
create or replace function public.create_guild(
  p_name text,
  p_tagline text default null,
  p_emblem text default 'shield',
  p_color text default '#2563EB'
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

  insert into public.guilds (name, tagline, emblem, color, leader_id)
  values (btrim(p_name), nullif(btrim(coalesce(p_tagline, '')), ''), coalesce(p_emblem, 'shield'), coalesce(p_color, '#2563EB'), auth.uid())
  returning * into v_guild;

  delete from public.guild_members where user_id = auth.uid();
  insert into public.guild_members (user_id, guild_id) values (auth.uid(), v_guild.id);

  perform public.award_guild_points(auth.uid(), 50, 'guild_founded', 'once', v_guild.id, v_guild.name);

  return v_guild;
end;
$$;

create or replace function public.update_guild(
  p_guild_id uuid,
  p_name text,
  p_tagline text,
  p_emblem text,
  p_color text
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
      color = coalesce(p_color, color)
  where id = p_guild_id
  returning * into v_guild;

  return v_guild;
end;
$$;

create or replace function public.join_guild(p_guild_id uuid)
returns void
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

  insert into public.guild_members (user_id, guild_id) values (auth.uid(), p_guild_id);
  perform public.award_guild_points(auth.uid(), 10, 'guild_joined', 'once', p_guild_id, v_guild.name);

  select display_name into v_name from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, type, title, message, data)
  values (v_guild.leader_id, 'system', 'New guild member',
    coalesce(v_name, 'A traveler') || ' joined ' || v_guild.name || '.',
    jsonb_build_object('guild_id', v_guild.id, 'route', '/guild'));
end;
$$;

create or replace function public.leave_guild()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.guilds where leader_id = auth.uid()) then
    raise exception 'Guild Leaders can''t leave their own guild';
  end if;
  delete from public.guild_members where user_id = auth.uid();
end;
$$;

create or replace function public.remove_guild_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
begin
  select g.* into v_guild
  from public.guild_members gm
  join public.guilds g on g.id = gm.guild_id
  where gm.user_id = p_user_id;

  if v_guild.id is null then
    return;
  end if;
  if not (v_guild.leader_id = auth.uid() or public.current_user_role() = 'admin') then
    raise exception 'Only this guild''s leader can remove members';
  end if;
  if p_user_id = v_guild.leader_id then
    raise exception 'The leader can''t be removed';
  end if;

  delete from public.guild_members where user_id = p_user_id;

  insert into public.notifications (user_id, type, title, message, data)
  values (p_user_id, 'system', 'Removed from guild',
    'You were removed from ' || v_guild.name || '. You can join another guild any time.',
    jsonb_build_object('route', '/guild'));
end;
$$;

-- Period start for leaderboards: 'week' | 'month' | anything else = all time.
create or replace function public.guild_period_start(p_period text)
returns timestamptz
language sql
stable
as $$
  select case p_period
    when 'week' then date_trunc('week', now())
    when 'month' then date_trunc('month', now())
    else '-infinity'::timestamptz
  end;
$$;

create or replace function public.get_guild_leaderboard(p_period text default 'all')
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
  lifetime_points bigint
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
    ), 0)::bigint
  from public.guilds g
  join public.profiles p on p.id = g.leader_id
  order by 9 desc, 8 desc, g.created_at;
$$;

create or replace function public.get_guild_member_board(p_guild_id uuid, p_period text default 'all')
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  is_leader boolean,
  joined_at timestamptz,
  points bigint,
  lifetime_points bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    gm.user_id, p.display_name, p.avatar_url, g.leader_id = gm.user_id, gm.joined_at,
    coalesce((
      select sum(e.amount) from public.guild_point_events e
      where e.user_id = gm.user_id and e.amount > 0 and e.reason <> 'redemption_refund'
        and e.created_at >= public.guild_period_start(p_period)
    ), 0)::bigint,
    coalesce((
      select sum(e.amount) from public.guild_point_events e
      where e.user_id = gm.user_id and e.amount > 0 and e.reason <> 'redemption_refund'
    ), 0)::bigint
  from public.guild_members gm
  join public.guilds g on g.id = gm.guild_id
  join public.profiles p on p.id = gm.user_id
  where gm.guild_id = p_guild_id
  order by 6 desc, 7 desc, gm.joined_at;
$$;

-- Aggregates for one user (anyone may view; drives public badges/titles).
create or replace function public.get_points_summary(p_user_id uuid default null)
returns table (
  user_id uuid,
  lifetime_points bigint,
  coins bigint,
  week_points bigint,
  month_points bigint,
  reason_counts jsonb,
  guild_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (select coalesce(p_user_id, auth.uid()) as id),
  earned as (
    select e.* from public.guild_point_events e, target
    where e.user_id = target.id
  )
  select
    target.id,
    coalesce((select sum(amount) from earned where amount > 0 and reason <> 'redemption_refund'), 0)::bigint,
    coalesce((select sum(amount) from earned), 0)::bigint,
    coalesce((select sum(amount) from earned where amount > 0 and reason <> 'redemption_refund'
      and created_at >= date_trunc('week', now())), 0)::bigint,
    coalesce((select sum(amount) from earned where amount > 0 and reason <> 'redemption_refund'
      and created_at >= date_trunc('month', now())), 0)::bigint,
    coalesce((select jsonb_object_agg(reason, n) from (
      select reason, count(*) as n from earned where amount > 0 group by reason
    ) c), '{}'::jsonb),
    (select gm.guild_id from public.guild_members gm where gm.user_id = target.id)
  from target;
$$;

-- =====================================================================
-- 8. Rewards RPCs
-- =====================================================================
create or replace function public.redeem_guild_reward(p_reward_id uuid)
returns public.guild_reward_redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward public.guild_rewards;
  v_role text;
  v_balance bigint;
  v_redemption public.guild_reward_redemptions;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Serialize this user's spends so two taps can't double-spend.
  perform pg_advisory_xact_lock(hashtext('guild_coins:' || auth.uid()::text));

  select * into v_reward from public.guild_rewards where id = p_reward_id for update;
  if v_reward.id is null or not v_reward.is_active then
    raise exception 'This reward is no longer available';
  end if;

  v_role := public.current_user_role();
  if v_reward.audience = 'guild_leader' and v_role <> 'guild_leader' then
    raise exception 'This reward is for Guild Leaders only';
  end if;
  if v_reward.audience = 'traveler' and v_role <> 'traveler' then
    raise exception 'This reward is for travelers only';
  end if;
  if v_reward.stock is not null and v_reward.stock <= 0 then
    raise exception 'This reward is out of stock';
  end if;

  select coalesce(sum(amount), 0) into v_balance from public.guild_point_events where user_id = auth.uid();
  if v_balance < v_reward.cost then
    raise exception 'Not enough coins (you have %, need %)', v_balance, v_reward.cost;
  end if;

  if v_reward.stock is not null then
    update public.guild_rewards set stock = stock - 1 where id = v_reward.id;
  end if;

  insert into public.guild_reward_redemptions (reward_id, user_id, cost)
  values (v_reward.id, auth.uid(), v_reward.cost)
  returning * into v_redemption;

  insert into public.guild_point_events (user_id, guild_id, amount, reason, source_id, source_key, note)
  values (
    auth.uid(),
    (select guild_id from public.guild_members where user_id = auth.uid()),
    -v_reward.cost, 'redemption', v_redemption.id, 'redemption:' || v_redemption.id, v_reward.title
  );

  return v_redemption;
end;
$$;

create or replace function public.handle_guild_redemption(
  p_redemption_id uuid,
  p_status text,
  p_notes text default null
)
returns public.guild_reward_redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption public.guild_reward_redemptions;
  v_title text;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can handle reward redemptions';
  end if;
  if p_status not in ('fulfilled', 'rejected') then
    raise exception 'Status must be fulfilled or rejected';
  end if;

  update public.guild_reward_redemptions
  set status = p_status,
      admin_notes = nullif(btrim(coalesce(p_notes, '')), ''),
      handled_by = auth.uid(),
      handled_at = now()
  where id = p_redemption_id and status = 'pending'
  returning * into v_redemption;

  if v_redemption.id is null then
    raise exception 'This redemption was already handled';
  end if;

  select title into v_title from public.guild_rewards where id = v_redemption.reward_id;

  if p_status = 'rejected' then
    insert into public.guild_point_events (user_id, guild_id, amount, reason, source_id, source_key, note)
    values (
      v_redemption.user_id,
      (select guild_id from public.guild_members where user_id = v_redemption.user_id),
      v_redemption.cost, 'redemption_refund', v_redemption.id, 'refund:' || v_redemption.id, v_title
    );
    update public.guild_rewards set stock = stock + 1 where id = v_redemption.reward_id and stock is not null;
  end if;

  insert into public.notifications (user_id, type, title, message, data)
  values (
    v_redemption.user_id, 'system',
    case when p_status = 'fulfilled' then 'Reward on its way' else 'Reward request declined' end,
    case when p_status = 'fulfilled'
      then coalesce(v_title, 'Your reward') || ' has been fulfilled.'
      else coalesce(v_title, 'Your reward') || ' was declined and ' || v_redemption.cost || ' coins were refunded.'
    end || coalesce(' Note: ' || nullif(btrim(coalesce(p_notes, '')), ''), ''),
    jsonb_build_object('route', '/rewards')
  );

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'Reward redemption ' || p_status, 'guild_reward_redemption', v_redemption.id,
    jsonb_build_object('reward', v_title, 'cost', v_redemption.cost, 'user_id', v_redemption.user_id));

  return v_redemption;
end;
$$;

create or replace function public.admin_adjust_guild_points(p_user_id uuid, p_amount int, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can adjust points';
  end if;
  if p_amount = 0 then
    raise exception 'Amount can''t be zero';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'Add a reason for the adjustment';
  end if;

  insert into public.guild_point_events (user_id, guild_id, amount, reason, source_key, note)
  values (
    p_user_id,
    (select guild_id from public.guild_members where user_id = p_user_id),
    p_amount, 'admin_adjustment', gen_random_uuid()::text, btrim(p_note)
  );

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'Adjusted guild points', 'profile', p_user_id,
    jsonb_build_object('amount', p_amount, 'note', btrim(p_note)));
end;
$$;

grant execute on function public.create_guild(text, text, text, text) to authenticated;
grant execute on function public.update_guild(uuid, text, text, text, text) to authenticated;
grant execute on function public.join_guild(uuid) to authenticated;
grant execute on function public.leave_guild() to authenticated;
grant execute on function public.remove_guild_member(uuid) to authenticated;
grant execute on function public.get_guild_leaderboard(text) to authenticated;
grant execute on function public.get_guild_member_board(uuid, text) to authenticated;
grant execute on function public.get_points_summary(uuid) to authenticated;
grant execute on function public.redeem_guild_reward(uuid) to authenticated;
grant execute on function public.handle_guild_redemption(uuid, text, text) to authenticated;
grant execute on function public.admin_adjust_guild_points(uuid, int, text) to authenticated;

-- Starter reward catalog (all hand-fulfilled, zero cost to run).
insert into public.guild_rewards (title, description, cost, audience)
select * from (values
  ('Certificate of Recognition', 'A signed PartyUp certificate for your guild service.', 300, 'guild_leader'),
  ('Featured Guild of the Month', 'Your guild is featured on the PartyUp home screen for a month.', 800, 'guild_leader'),
  ('Shout-out on PartyUp socials', 'We''ll thank you by name on PartyUp''s social pages.', 150, 'everyone'),
  ('Trip Organizer Spotlight', 'Your next public trip is pinned at the top of Discover for a week.', 250, 'traveler')
) as seed(title, description, cost, audience)
where not exists (select 1 from public.guild_rewards);

-- Live updates for the app and the website.
do $$
declare
  t text;
begin
  foreach t in array array['guilds', 'guild_members', 'guild_point_events', 'guild_rewards', 'guild_reward_redemptions']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

commit;
