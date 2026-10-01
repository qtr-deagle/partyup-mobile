begin;

-- =====================================================================
-- Guild invites: a leader or officer invites a traveler from their
-- profile. The invite only goes out if the traveler already meets the
-- guild's rules (guild_join_block_reason: min rank, areas, member cap),
-- and the same rules are checked again when they accept, since rank,
-- town or free slots can change in between.
-- =====================================================================

create table if not exists public.guild_invites (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

-- One live invite per guild and traveler.
create unique index if not exists guild_invites_one_pending_idx
  on public.guild_invites(guild_id, user_id) where status = 'pending';
create index if not exists guild_invites_user_idx on public.guild_invites(user_id, status);

alter table public.guild_invites enable row level security;
drop policy if exists "guild invites own or managers" on public.guild_invites;
create policy "guild invites own or managers" on public.guild_invites for select to authenticated
  using (user_id = auth.uid() or public.can_manage_guild(guild_id));
grant select on public.guild_invites to authenticated;
grant all on public.guild_invites to service_role;

-- Invites lapse after a week without an answer.
create or replace function public.guild_invite_live(p_invite public.guild_invites)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_invite.status = 'pending' and p_invite.created_at > now() - interval '7 days';
$$;

-- The guild the caller leads, or is an officer of.
create or replace function public.my_managed_guild_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select id from public.guilds where leader_id = auth.uid() limit 1),
    (select guild_id from public.guild_members where user_id = auth.uid() and role = 'officer' limit 1)
  );
$$;

revoke all on function public.my_managed_guild_id() from public, anon, authenticated;

-- Why the caller's guild can't invite p_user_id right now, or null.
-- Worded for the inviter ("They're ...").
create or replace function public.guild_invite_block_reason(p_guild public.guilds, p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_target public.profiles;
  v_current_guild uuid;
begin
  select * into v_target from public.profiles where id = p_user_id;
  if v_target.id is null or not coalesce(v_target.is_active, true) then
    return 'This traveler isn''t available';
  end if;
  if v_target.id = auth.uid() then
    return 'You can''t invite yourself';
  end if;
  if public.is_blocked_between(auth.uid(), p_user_id) then
    return 'You can''t invite this traveler';
  end if;
  if v_target.role <> 'traveler' then
    return 'Guild Leaders and staff can''t join a guild';
  end if;
  if v_target.verification_status is distinct from 'approved' then
    return 'They need a verified ID before joining a guild';
  end if;

  select guild_id into v_current_guild from public.guild_members where user_id = p_user_id;
  if v_current_guild = p_guild.id then
    return 'They''re already in ' || p_guild.name;
  elsif v_current_guild is not null then
    return 'They''re already in another guild';
  end if;

  if exists (
    select 1 from public.guild_removals
    where guild_id = p_guild.id and user_id = p_user_id and removed_at > now() - interval '7 days'
  ) then
    return 'They were removed from ' || p_guild.name || ' recently. You can invite them after a week';
  end if;

  -- Same rules as joining: min rank, areas, member cap.
  return public.guild_join_block_reason(p_guild, p_user_id);
end;
$$;

revoke all on function public.guild_invite_block_reason(public.guilds, uuid) from public, anon, authenticated;

-- For the profile screen: can I invite this traveler, and if not, why.
-- No row when the caller doesn't lead or officer a guild.
create or replace function public.get_guild_invite_status(p_user_id uuid)
returns table (
  guild_id uuid,
  guild_name text,
  invite_id uuid,
  can_invite boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
  v_invite uuid;
  v_reason text;
begin
  select * into v_guild from public.guilds where id = public.my_managed_guild_id();
  if v_guild.id is null then
    return;
  end if;

  select i.id into v_invite from public.guild_invites i
  where i.guild_id = v_guild.id and i.user_id = p_user_id and public.guild_invite_live(i);

  v_reason := case when v_invite is null then public.guild_invite_block_reason(v_guild, p_user_id) end;

  return query select v_guild.id, v_guild.name, v_invite, v_invite is null and v_reason is null, v_reason;
end;
$$;

create or replace function public.invite_to_guild(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
  v_reason text;
  v_inviter text;
  v_invite_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Locked so the member-cap check can't race a join.
  select * into v_guild from public.guilds where id = public.my_managed_guild_id() for update;
  if v_guild.id is null then
    raise exception 'Only Guild Leaders and officers can send invites';
  end if;

  v_reason := public.guild_invite_block_reason(v_guild, p_user_id);
  if v_reason is not null then
    raise exception '%', v_reason;
  end if;

  -- Drop a lapsed invite so the one-pending index doesn't block a fresh one.
  update public.guild_invites i set status = 'cancelled', handled_at = now()
  where i.guild_id = v_guild.id and i.user_id = p_user_id and i.status = 'pending'
    and not public.guild_invite_live(i);

  if exists (
    select 1 from public.guild_invites
    where guild_id = v_guild.id and user_id = p_user_id and status = 'pending'
  ) then
    raise exception 'They already have an invite from %', v_guild.name;
  end if;
  if exists (
    select 1 from public.guild_invites
    where guild_id = v_guild.id and user_id = p_user_id and status = 'declined'
      and handled_at > now() - interval '24 hours'
  ) then
    raise exception 'They declined your invite recently. Try again tomorrow';
  end if;
  if (select count(*) from public.guild_invites
      where guild_id = v_guild.id and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Your guild has sent 20 invites today. Try again tomorrow';
  end if;

  insert into public.guild_invites (guild_id, user_id, invited_by)
  values (v_guild.id, p_user_id, auth.uid())
  returning id into v_invite_id;

  select display_name into v_inviter from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, type, title, message, data)
  values (p_user_id, 'system', 'Guild invite',
    coalesce(v_inviter, 'A Guild Leader') || ' invited you to join ' || v_guild.name || '.',
    jsonb_build_object('guild_id', v_guild.id, 'invite_id', v_invite_id, 'route', '/guild'));

  return v_invite_id;
end;
$$;

create or replace function public.cancel_guild_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.guild_invites;
begin
  select * into v_invite from public.guild_invites where id = p_invite_id for update;
  if v_invite.id is null or not public.can_manage_guild(v_invite.guild_id) then
    raise exception 'Invite not found';
  end if;
  if v_invite.status <> 'pending' then
    return;
  end if;
  update public.guild_invites set status = 'cancelled', handled_at = now() where id = p_invite_id;
end;
$$;

-- The caller's open invites, newest first.
create or replace function public.get_my_guild_invites()
returns table (
  id uuid,
  guild_id uuid,
  guild_name text,
  guild_emblem text,
  guild_color text,
  invited_by_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, g.id, g.name, g.emblem, g.color, p.display_name, i.created_at
  from public.guild_invites i
  join public.guilds g on g.id = i.guild_id
  left join public.profiles p on p.id = i.invited_by
  where i.user_id = auth.uid() and public.guild_invite_live(i)
  order by i.created_at desc;
$$;

create or replace function public.respond_guild_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.guild_invites;
  v_guild public.guilds;
  v_name text;
  v_block text;
begin
  select * into v_invite from public.guild_invites where id = p_invite_id for update;
  if v_invite.id is null or v_invite.user_id is distinct from auth.uid() then
    raise exception 'Invite not found';
  end if;
  if not public.guild_invite_live(v_invite) then
    raise exception 'This invite is no longer active';
  end if;

  select * into v_guild from public.guilds where id = v_invite.guild_id for update;
  select display_name into v_name from public.profiles where id = auth.uid();

  if not p_accept then
    update public.guild_invites set status = 'declined', handled_at = now() where id = v_invite.id;
    if v_invite.invited_by is not null then
      insert into public.notifications (user_id, type, title, message, data)
      values (v_invite.invited_by, 'system', 'Guild invite declined',
        coalesce(v_name, 'A traveler') || ' declined the invite to ' || v_guild.name || '.',
        jsonb_build_object('guild_id', v_guild.id, 'route', '/guild'));
    end if;
    return;
  end if;

  -- Same gate as join_guild, re-checked now.
  if public.current_user_role() <> 'traveler' then
    raise exception 'Guild Leaders and admins can''t join another guild';
  end if;
  if (select verification_status from public.profiles where id = auth.uid()) is distinct from 'approved' then
    raise exception 'Verify your ID before joining a guild';
  end if;
  if exists (select 1 from public.guild_members where user_id = auth.uid()) then
    raise exception 'Leave your current guild first';
  end if;
  v_block := public.guild_join_block_reason(v_guild, auth.uid());
  if v_block is not null then
    raise exception '%', v_block;
  end if;

  update public.guild_invites set status = 'accepted', handled_at = now() where id = v_invite.id;
  -- Joining one guild settles every other open invite and request.
  update public.guild_invites set status = 'cancelled', handled_at = now()
  where user_id = auth.uid() and status = 'pending';
  update public.guild_join_requests
  set status = 'cancelled', handled_at = now(), handled_by = auth.uid()
  where user_id = auth.uid() and status = 'pending';

  insert into public.guild_members (user_id, guild_id) values (auth.uid(), v_guild.id);
  perform public.award_guild_points(auth.uid(), 10, 'guild_joined', 'once', v_guild.id, v_guild.name);

  insert into public.notifications (user_id, type, title, message, data)
  select m, 'system', 'Invite accepted',
    coalesce(v_name, 'A traveler') || ' accepted the invite and joined ' || v_guild.name || '.',
    jsonb_build_object('guild_id', v_guild.id, 'route', '/guild')
  from public.guild_manager_ids(v_guild.id) m;
end;
$$;

grant execute on function public.get_guild_invite_status(uuid) to authenticated;
grant execute on function public.invite_to_guild(uuid) to authenticated;
grant execute on function public.cancel_guild_invite(uuid) to authenticated;
grant execute on function public.get_my_guild_invites() to authenticated;
grant execute on function public.respond_guild_invite(uuid, boolean) to authenticated;

commit;
