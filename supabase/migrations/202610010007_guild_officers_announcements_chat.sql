begin;

-- =====================================================================
-- 1. Officers: up to 2 per guild, picked by the leader. Officers can
--    answer join requests and post the guild announcement.
-- =====================================================================
alter table public.guild_members
  add column if not exists role text not null default 'member' check (role in ('member', 'officer'));

-- Leader of the guild, or one of its officers.
create or replace function public.can_manage_guild(p_guild_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin'
    or exists (select 1 from public.guilds g where g.id = p_guild_id and g.leader_id = auth.uid())
    or exists (select 1 from public.guild_members gm where gm.guild_id = p_guild_id and gm.user_id = auth.uid() and gm.role = 'officer');
$$;

grant execute on function public.can_manage_guild(uuid) to authenticated;

create or replace function public.set_guild_officer(p_user_id uuid, p_officer boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
begin
  select g.* into v_guild
  from public.guild_members gm join public.guilds g on g.id = gm.guild_id
  where gm.user_id = p_user_id;

  if v_guild.id is null then
    raise exception 'They''re not in a guild';
  end if;
  if not (v_guild.leader_id = auth.uid() or public.current_user_role() = 'admin') then
    raise exception 'Only the Guild Leader can appoint officers';
  end if;
  if p_user_id = v_guild.leader_id then
    raise exception 'The leader can''t also be an officer';
  end if;
  if p_officer and (select count(*) from public.guild_members where guild_id = v_guild.id and role = 'officer' and user_id <> p_user_id) >= 2 then
    raise exception 'A guild can have at most 2 officers';
  end if;

  update public.guild_members set role = case when p_officer then 'officer' else 'member' end
  where user_id = p_user_id;

  insert into public.notifications (user_id, type, title, message, data)
  values (p_user_id, 'system',
    case when p_officer then 'You''re now an officer!' else 'Officer role removed' end,
    case when p_officer
      then 'You can now answer join requests and post announcements for ' || v_guild.name || '.'
      else 'You''re back to a regular member of ' || v_guild.name || '.'
    end,
    jsonb_build_object('route', '/guild'));
end;
$$;

grant execute on function public.set_guild_officer(uuid, boolean) to authenticated;

-- Officers can see and answer join requests too.
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
  join public.profiles p on p.id = r.user_id
  where r.guild_id = p_guild_id
    and r.status = 'pending'
    and public.can_manage_guild(p_guild_id)
  order by r.created_at;
$$;

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
  if not public.can_manage_guild(v_guild.id) then
    raise exception 'Only this guild''s leader or officers can answer join requests';
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

-- Member board now says who's an officer.
drop function if exists public.get_guild_member_board(uuid, text);

create function public.get_guild_member_board(p_guild_id uuid, p_period text default 'all')
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  is_leader boolean,
  joined_at timestamptz,
  points bigint,
  lifetime_points bigint,
  member_role text
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
    ), 0)::bigint,
    gm.role
  from public.guild_members gm
  join public.guilds g on g.id = gm.guild_id
  join public.profiles p on p.id = gm.user_id
  where gm.guild_id = p_guild_id
  order by 6 desc, 7 desc, gm.joined_at;
$$;

grant execute on function public.get_guild_join_requests(uuid) to authenticated;
grant execute on function public.respond_guild_join_request(uuid, boolean) to authenticated;
grant execute on function public.get_guild_member_board(uuid, text) to authenticated;

-- =====================================================================
-- 2. Pinned announcement.
-- =====================================================================
alter table public.guilds
  add column if not exists announcement text check (announcement is null or char_length(announcement) <= 280),
  add column if not exists announcement_at timestamptz,
  add column if not exists announcement_by uuid references public.profiles(id) on delete set null;

create or replace function public.set_guild_announcement(p_guild_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_guild public.guilds;
begin
  if not public.can_manage_guild(p_guild_id) then
    raise exception 'Only the leader or officers can post announcements';
  end if;
  if char_length(coalesce(v_text, '')) > 280 then
    raise exception 'Keep announcements under 280 characters';
  end if;

  update public.guilds
  set announcement = v_text,
      announcement_at = case when v_text is null then null else now() end,
      announcement_by = case when v_text is null then null else auth.uid() end
  where id = p_guild_id
  returning * into v_guild;

  if v_text is not null then
    insert into public.notifications (user_id, type, title, message, data)
    select gm.user_id, 'system', '📣 ' || v_guild.name,
      case when char_length(v_text) > 80 then left(v_text, 79) || '…' else v_text end,
      jsonb_build_object('guild_id', v_guild.id, 'route', '/guild')
    from public.guild_members gm
    where gm.guild_id = p_guild_id and gm.user_id <> auth.uid();
  end if;
end;
$$;

grant execute on function public.set_guild_announcement(uuid, text) to authenticated;

-- =====================================================================
-- 3. Guild chat: one group thread per guild, members kept in sync.
-- =====================================================================
alter table public.chat_threads
  add column if not exists guild_id uuid unique references public.guilds(id) on delete cascade;

create or replace function public.ensure_guild_chat_thread(p_guild_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_guild public.guilds;
begin
  select id into v_thread from public.chat_threads where guild_id = p_guild_id;
  if v_thread is not null then
    return v_thread;
  end if;
  select * into v_guild from public.guilds where id = p_guild_id;
  if v_guild.id is null then
    return null;
  end if;
  insert into public.chat_threads (created_by, thread_type, title, guild_id)
  values (v_guild.leader_id, 'group', v_guild.name, v_guild.id)
  returning id into v_thread;
  insert into public.chat_participants (thread_id, user_id)
  select v_thread, gm.user_id from public.guild_members gm where gm.guild_id = p_guild_id
  on conflict (thread_id, user_id) do nothing;
  return v_thread;
end;
$$;

revoke all on function public.ensure_guild_chat_thread(uuid) from public, anon, authenticated;

create or replace function public.sync_guild_chat_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
begin
  if tg_op = 'INSERT' then
    v_thread := public.ensure_guild_chat_thread(new.guild_id);
    if v_thread is not null then
      insert into public.chat_participants (thread_id, user_id) values (v_thread, new.user_id)
      on conflict (thread_id, user_id) do nothing;
    end if;
    return new;
  end if;

  delete from public.chat_participants cp
  using public.chat_threads t
  where t.id = cp.thread_id and t.guild_id = old.guild_id and cp.user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists sync_guild_chat_member on public.guild_members;
create trigger sync_guild_chat_member
after insert or delete on public.guild_members
for each row execute function public.sync_guild_chat_member();

-- Keep the thread title in step with guild renames.
create or replace function public.sync_guild_chat_title()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.chat_threads set title = new.name where guild_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_guild_chat_title on public.guilds;
create trigger sync_guild_chat_title
after update of name on public.guilds
for each row execute function public.sync_guild_chat_title();

-- The caller's guild thread (created on first use for older guilds).
create or replace function public.get_guild_chat_thread()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild_id uuid := (select guild_id from public.guild_members where user_id = auth.uid());
begin
  if v_guild_id is null then
    return null;
  end if;
  return public.ensure_guild_chat_thread(v_guild_id);
end;
$$;

grant execute on function public.get_guild_chat_thread() to authenticated;

-- Backfill threads for guilds that already exist.
do $$
declare
  g record;
begin
  for g in select id from public.guilds loop
    perform public.ensure_guild_chat_thread(g.id);
  end loop;
end;
$$;

commit;
