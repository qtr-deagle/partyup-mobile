begin;

-- Guild level perks (Clash of Clans style): a guild unlocks perks as it
-- levels up, and every member gets them. Keep in sync with GUILD_PERKS /
-- guildPerkDiscount() / guildMissionBonus() in lib/guilds.ts.
--
--   Lv 1  10 members            Lv 15 +20% mission points
--   Lv 3  +10% mission points   Lv 16 16 members
--   Lv 5  3% off rewards        Lv 20 10% off rewards
--   Lv 6  12 members            Lv 21 18 members
--   Lv 9  +15% mission points   Lv 22 +25% mission points
--   Lv 11 14 members            Lv 26 20 members
--   Lv 12 6% off rewards
--
-- Member slots are guild_member_cap() (202610020006). Mission bonus rounds
-- up so small missions still get +1. Rank + guild discount is capped at 25%
-- so the reward shop (the only coin sink) doesn't get too cheap.

-- The guild a user belongs to: the one they lead, else the one they're in.
create or replace function public.user_guild_id(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select id from public.guilds where leader_id = p_user_id limit 1),
    (select guild_id from public.guild_members where user_id = p_user_id)
  );
$$;

revoke all on function public.user_guild_id(uuid) from public, anon, authenticated;

create or replace function public.guild_level_of(p_guild_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when p_guild_id is null then 0
    else (public.guild_lifetime_xp(p_guild_id) / 500 + 1)::int end;
$$;

-- Reward discount (percent): 3% at Lv 5, 6% at Lv 12, 10% at Lv 20.
create or replace function public.guild_perk_discount(p_level int)
returns int
language sql
immutable
as $$
  select case when p_level >= 20 then 10 when p_level >= 12 then 6 when p_level >= 5 then 3 else 0 end;
$$;

-- Mission point bonus (percent): +10% at Lv 3, +15% at 9, +20% at 15, +25% at 22.
create or replace function public.guild_perk_mission_bonus(p_level int)
returns int
language sql
immutable
as $$
  select case when p_level >= 22 then 25 when p_level >= 15 then 20 when p_level >= 9 then 15 when p_level >= 3 then 10 else 0 end;
$$;

-- The caller's guild level (0 = not in a guild), for the app to show perks.
create or replace function public.get_my_guild_level()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select public.guild_level_of(public.user_guild_id(auth.uid()));
$$;

revoke all on function public.get_my_guild_level() from public, anon;
grant execute on function public.get_my_guild_level() to authenticated;

-- Same as 202610010003, plus the guild-level discount on top of the rank
-- discount (together capped at 25%).
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
  v_rank int;
  v_cost int;
  v_discount int;
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

  v_rank := public.guild_rank_index(public.guild_lifetime_points(auth.uid()));
  if v_reward.min_rank is not null and v_rank < public.guild_rank_index_of_name(v_reward.min_rank) then
    raise exception 'This reward unlocks at % rank', v_reward.min_rank;
  end if;

  v_discount := least(25, public.guild_rank_discount(v_rank)
    + public.guild_perk_discount(public.guild_level_of(public.user_guild_id(auth.uid()))));
  v_cost := greatest(1, ceil(v_reward.cost * (100 - v_discount) / 100.0)::int);

  select coalesce(sum(amount), 0) into v_balance from public.guild_point_events where user_id = auth.uid();
  if v_balance < v_cost then
    raise exception 'Not enough coins (you have %, need %)', v_balance, v_cost;
  end if;

  if v_reward.stock is not null then
    update public.guild_rewards set stock = stock - 1 where id = v_reward.id;
  end if;

  insert into public.guild_reward_redemptions (reward_id, user_id, cost)
  values (v_reward.id, auth.uid(), v_cost)
  returning * into v_redemption;

  insert into public.guild_point_events (user_id, guild_id, amount, reason, source_id, source_key, note)
  values (
    auth.uid(),
    (select guild_id from public.guild_members where user_id = auth.uid()),
    -v_cost, 'redemption', v_redemption.id, 'redemption:' || v_redemption.id, v_reward.title
  );

  return v_redemption;
end;
$$;

-- Same as 202610010005, plus the guild-level mission bonus.
create or replace function public.claim_mission(p_key text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.guild_missions;
  w record;
  v_role text := public.current_user_role();
  v_progress int;
  v_amount int;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into m from public.guild_missions where key = p_key and is_active;
  if m.key is null then
    raise exception 'Mission not found';
  end if;
  if not (m.audience = 'everyone' or m.audience = v_role or v_role = 'admin') then
    raise exception 'This mission isn''t for your role';
  end if;
  if m.needs_guild and not exists (select 1 from public.guild_members where user_id = auth.uid()) then
    raise exception 'Join a guild to unlock this mission';
  end if;

  select * into w from public.guild_mission_window(m.category);
  v_progress := public.guild_mission_progress(auth.uid(), m.metric, w.start_at, w.end_at);
  if v_progress < m.target then
    raise exception 'Not done yet (% of %)', v_progress, m.target;
  end if;

  v_amount := m.reward + ceil(m.reward
    * public.guild_perk_mission_bonus(public.guild_level_of(public.user_guild_id(auth.uid()))) / 100.0)::int;

  insert into public.guild_point_events (user_id, guild_id, amount, reason, source_key, note)
  values (
    auth.uid(),
    (select guild_id from public.guild_members where user_id = auth.uid()),
    v_amount, 'mission_reward', 'mission:' || m.key || ':' || w.period_key, m.title
  )
  on conflict (user_id, reason, source_key) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Already claimed';
  end if;
  return v_amount;
end;
$$;

commit;
