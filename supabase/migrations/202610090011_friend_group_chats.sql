-- Friend group chats: a traveler starts a named group with 2+ friends.
--   * chat_threads type 'group' with no guild_id/trip_id (guild chats are
--     'group' + guild_id; trip chats are 'trip');
--   * a look (emoji + color) on the thread, and an admin role per member;
--   * every change goes through the security-definer RPCs below and leaves a
--     system message in the chat ("Maria added Jo");
--   * friend groups join the Messages list (list_group_conversations) and the
--     unread badge (count_unread_messages).
-- No new tables, so no new grants beyond the functions.

begin;

alter table public.chat_threads
  add column if not exists group_emoji text,
  add column if not exists group_color text check (group_color is null or group_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.chat_participants
  add column if not exists role text not null default 'member' check (role in ('member', 'admin'));

create or replace function public.is_friend_group(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_threads t
    where t.id = p_thread_id and t.thread_type = 'group' and t.guild_id is null and t.trip_id is null
  );
$$;

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.requester_id = p_a and fr.recipient_id = p_b) or (fr.requester_id = p_b and fr.recipient_id = p_a))
  );
$$;

create or replace function public.is_friend_group_admin(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_friend_group(p_thread_id) and exists (
    select 1 from public.chat_participants cp
    where cp.thread_id = p_thread_id and cp.user_id = auth.uid() and cp.role = 'admin'
  );
$$;

-- "Maria added Jo and Ben" style notes inside the chat.
create or replace function public.friend_group_note(p_thread_id uuid, p_text text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.chat_messages (thread_id, sender_id, message_type, body)
  values (p_thread_id, auth.uid(), 'system', p_text);
$$;

create or replace function public.friend_group_names(p_user_ids uuid[])
returns text
language sql
stable
security definer
set search_path = public
as $$
  select string_agg(split_part(coalesce(p.display_name, 'someone'), ' ', 1), ', ' order by p.display_name)
  from public.profiles p where p.id = any(p_user_ids);
$$;

-- Members must be your friends and not blocked either way.
create or replace function public.check_friend_group_invitees(p_member_ids uuid[])
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  foreach v_id in array coalesce(p_member_ids, '{}') loop
    if v_id = auth.uid() then
      continue;
    end if;
    if not public.are_friends(auth.uid(), v_id) then
      raise exception 'You can only add your friends to a group';
    end if;
    if public.is_blocked_between(auth.uid(), v_id) then
      raise exception 'One of the people you picked can''t be added';
    end if;
  end loop;
end;
$$;

create or replace function public.create_friend_group(
  p_title text,
  p_member_ids uuid[],
  p_emoji text default null,
  p_color text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_members uuid[];
  v_thread uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if v_title is null or char_length(v_title) > 40 then
    raise exception 'Give the group a name (up to 40 characters)';
  end if;
  select array_agg(distinct m) into v_members from unnest(coalesce(p_member_ids, '{}')) m where m <> auth.uid();
  if coalesce(array_length(v_members, 1), 0) < 2 then
    raise exception 'Pick at least 2 friends for a group';
  end if;
  if array_length(v_members, 1) > 49 then
    raise exception 'A group can have up to 50 people';
  end if;
  perform public.check_friend_group_invitees(v_members);

  insert into public.chat_threads (created_by, thread_type, title, group_emoji, group_color)
  values (auth.uid(), 'group', v_title, nullif(trim(coalesce(p_emoji, '')), ''), p_color)
  returning id into v_thread;

  insert into public.chat_participants (thread_id, user_id, role)
  values (v_thread, auth.uid(), 'admin');
  insert into public.chat_participants (thread_id, user_id, role)
  select v_thread, m, 'member' from unnest(v_members) m
  on conflict (thread_id, user_id) do nothing;

  perform public.friend_group_note(v_thread,
    public.friend_group_names(array[auth.uid()]) || ' created the group with ' || public.friend_group_names(v_members));
  return v_thread;
end;
$$;

create or replace function public.add_friend_group_members(p_thread_id uuid, p_member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new uuid[];
  v_count int;
begin
  if not public.is_friend_group_admin(p_thread_id) then
    raise exception 'Only the group admin can add people';
  end if;
  select array_agg(distinct m) into v_new
  from unnest(coalesce(p_member_ids, '{}')) m
  where m <> auth.uid()
    and not exists (select 1 from public.chat_participants cp where cp.thread_id = p_thread_id and cp.user_id = m);
  if coalesce(array_length(v_new, 1), 0) = 0 then
    return;
  end if;
  select count(*) into v_count from public.chat_participants where thread_id = p_thread_id;
  if v_count + array_length(v_new, 1) > 50 then
    raise exception 'A group can have up to 50 people';
  end if;
  perform public.check_friend_group_invitees(v_new);
  insert into public.chat_participants (thread_id, user_id, role)
  select p_thread_id, m, 'member' from unnest(v_new) m
  on conflict (thread_id, user_id) do nothing;
  perform public.friend_group_note(p_thread_id,
    public.friend_group_names(array[auth.uid()]) || ' added ' || public.friend_group_names(v_new));
end;
$$;

create or replace function public.remove_friend_group_member(p_thread_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_friend_group_admin(p_thread_id) then
    raise exception 'Only the group admin can remove people';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use Leave group to leave';
  end if;
  delete from public.chat_participants where thread_id = p_thread_id and user_id = p_user_id;
  if found then
    perform public.friend_group_note(p_thread_id,
      public.friend_group_names(array[auth.uid()]) || ' removed ' || public.friend_group_names(array[p_user_id]));
  end if;
end;
$$;

create or replace function public.set_friend_group_admin(p_thread_id uuid, p_user_id uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_friend_group_admin(p_thread_id) then
    raise exception 'Only a group admin can change admins';
  end if;
  if p_user_id = auth.uid() and not p_admin
    and not exists (select 1 from public.chat_participants where thread_id = p_thread_id and role = 'admin' and user_id <> auth.uid()) then
    raise exception 'Make someone else an admin first';
  end if;
  update public.chat_participants set role = case when p_admin then 'admin' else 'member' end
  where thread_id = p_thread_id and user_id = p_user_id;
  if p_admin then
    perform public.friend_group_note(p_thread_id, public.friend_group_names(array[p_user_id]) || ' is now an admin');
  end if;
end;
$$;

create or replace function public.leave_friend_group(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_admin boolean;
begin
  if not public.is_friend_group(p_thread_id) then
    raise exception 'That group was not found';
  end if;
  select role = 'admin' into v_was_admin from public.chat_participants where thread_id = p_thread_id and user_id = auth.uid();
  if v_was_admin is null then
    return;
  end if;

  perform public.friend_group_note(p_thread_id, public.friend_group_names(array[auth.uid()]) || ' left the group');
  delete from public.chat_participants where thread_id = p_thread_id and user_id = auth.uid();

  if not exists (select 1 from public.chat_participants where thread_id = p_thread_id) then
    delete from public.chat_threads where id = p_thread_id;
    return;
  end if;
  -- Never leave a group without an admin: the longest-standing member takes over.
  if v_was_admin and not exists (select 1 from public.chat_participants where thread_id = p_thread_id and role = 'admin') then
    update public.chat_participants set role = 'admin'
    where id = (select id from public.chat_participants where thread_id = p_thread_id order by created_at limit 1);
  end if;
end;
$$;

create or replace function public.update_friend_group(p_thread_id uuid, p_title text, p_emoji text, p_color text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_old text;
begin
  if not public.is_friend_group_admin(p_thread_id) then
    raise exception 'Only the group admin can edit the group';
  end if;
  if v_title is null or char_length(v_title) > 40 then
    raise exception 'Give the group a name (up to 40 characters)';
  end if;
  select title into v_old from public.chat_threads where id = p_thread_id;
  update public.chat_threads
  set title = v_title, group_emoji = nullif(trim(coalesce(p_emoji, '')), ''), group_color = p_color, updated_at = now()
  where id = p_thread_id;
  if v_old is distinct from v_title then
    perform public.friend_group_note(p_thread_id,
      public.friend_group_names(array[auth.uid()]) || ' renamed the group to "' || v_title || '"');
  end if;
end;
$$;

-- The group header + member list for the chat screen.
create or replace function public.get_friend_group(p_thread_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'thread_id', t.id,
    'title', t.title,
    'emoji', t.group_emoji,
    'color', t.group_color,
    'created_by', t.created_by,
    'my_role', me.role,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', p.id,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'role', cp.role
      ) order by cp.role, p.display_name), '[]'::jsonb)
      from public.chat_participants cp
      join public.profiles p on p.id = cp.user_id
      where cp.thread_id = t.id
    )
  )
  from public.chat_threads t
  join public.chat_participants me on me.thread_id = t.id and me.user_id = auth.uid()
  where t.id = p_thread_id and public.is_friend_group(t.id);
$$;

-- Messages list: trip chats (as before) plus friend groups.
drop function if exists public.list_group_conversations();
create function public.list_group_conversations()
returns table (
  thread_id uuid,
  kind text,
  trip_id uuid,
  title text,
  trip_type text,
  trip_status text,
  group_emoji text,
  group_color text,
  member_count bigint,
  last_message text,
  last_message_type text,
  last_message_deleted boolean,
  last_message_at timestamptz,
  last_message_sender_id uuid,
  last_sender_name text,
  unread_count bigint,
  muted boolean,
  pinned boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    case when t.thread_type = 'trip' then 'trip' else 'friends' end,
    t.trip_id,
    coalesce(tr.title, t.title),
    tr.trip_type,
    tr.status,
    t.group_emoji,
    t.group_color,
    (select count(*) from public.chat_participants cp where cp.thread_id = t.id),
    latest.body,
    latest.message_type,
    latest.deleted_at is not null,
    latest.created_at,
    latest.sender_id,
    sender.display_name,
    (select count(*) from public.chat_messages unread
      where unread.thread_id = t.id
        and unread.sender_id <> auth.uid()
        and unread.deleted_at is null
        and unread.message_type <> 'system'
        and unread.created_at > coalesce(me.last_read_at, 'epoch'::timestamptz)),
    me.muted,
    me.pinned_at is not null
  from public.chat_threads t
  join public.chat_participants me on me.thread_id = t.id and me.user_id = auth.uid()
  left join public.trips tr on tr.id = t.trip_id
  left join lateral (
    select body, message_type, deleted_at, created_at, sender_id from public.chat_messages m
    where m.thread_id = t.id order by m.created_at desc limit 1
  ) latest on true
  left join public.profiles sender on sender.id = latest.sender_id
  where (t.thread_type = 'trip' and tr.id is not null)
     or (t.thread_type = 'group' and t.guild_id is null and t.trip_id is null)
  order by me.pinned_at desc nulls last, coalesce(latest.created_at, t.created_at) desc;
$$;
grant execute on function public.list_group_conversations() to authenticated;

-- Tab badge counts friend groups too (guild chat keeps its own badge).
create or replace function public.count_unread_messages()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.chat_participants me
  join public.chat_threads t on t.id = me.thread_id
    and (t.thread_type in ('direct', 'trip') or (t.thread_type = 'group' and t.guild_id is null and t.trip_id is null))
  join public.chat_messages m on m.thread_id = me.thread_id
  where me.user_id = auth.uid()
    and not me.muted
    and m.sender_id <> auth.uid()
    and m.message_type <> 'system'
    and m.deleted_at is null
    and m.created_at > greatest(coalesce(me.last_read_at, 'epoch'::timestamptz), coalesce(me.cleared_at, 'epoch'::timestamptz));
$$;

grant execute on function public.create_friend_group(text, uuid[], text, text) to authenticated;
grant execute on function public.add_friend_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_friend_group_member(uuid, uuid) to authenticated;
grant execute on function public.set_friend_group_admin(uuid, uuid, boolean) to authenticated;
grant execute on function public.leave_friend_group(uuid) to authenticated;
grant execute on function public.update_friend_group(uuid, text, text, text) to authenticated;
grant execute on function public.get_friend_group(uuid) to authenticated;
-- Helpers are internal.
revoke execute on function public.friend_group_note(uuid, text) from public, anon, authenticated;
revoke execute on function public.check_friend_group_invitees(uuid[]) from public, anon, authenticated;
revoke execute on function public.friend_group_names(uuid[]) from public, anon, authenticated;

commit;
