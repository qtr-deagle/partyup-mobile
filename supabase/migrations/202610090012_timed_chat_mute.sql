-- Timed chat mute: "Mute for 1 hour / 8 hours / 1 day / 1 week / until I
-- turn it back on". chat_participants.muted_until holds the end time (null =
-- indefinite). A mute counts only while muted and (muted_until is null or in
-- the future), so it lapses by itself with no job. Everything that reads the
-- mute uses that rule: the conversation lists, the unread badge and the push
-- dispatcher (supabase/functions/dispatch-push).

begin;

alter table public.chat_participants
  add column if not exists muted_until timestamptz;

-- Replaces set_chat_muted(uuid, boolean) with an optional end time.
drop function if exists public.set_chat_muted(uuid, boolean);
create function public.set_chat_muted(p_thread_id uuid, p_muted boolean, p_until timestamptz default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_participants
  set muted = p_muted,
      muted_until = case when p_muted then p_until else null end
  where thread_id = p_thread_id and user_id = auth.uid();
$$;
grant execute on function public.set_chat_muted(uuid, boolean, timestamptz) to authenticated;

-- Same as 202610020002, with an expired mute reported as not muted.
create or replace function public.list_direct_conversations()
returns table (
  thread_id uuid,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  interests text[],
  last_message text,
  last_message_at timestamptz,
  last_message_sender_id uuid,
  last_message_type text,
  last_message_deleted boolean,
  other_last_read_at timestamptz,
  other_last_delivered_at timestamptz,
  unread_count bigint,
  muted boolean,
  pinned boolean,
  cleared_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    other.user_id,
    p.display_name,
    p.avatar_url,
    p.interests,
    latest.body,
    latest.created_at,
    latest.sender_id,
    latest.message_type,
    latest.deleted_at is not null,
    other.last_read_at,
    other.last_delivered_at,
    (select count(*) from public.chat_messages unread
      where unread.thread_id = t.id
        and unread.sender_id <> auth.uid()
        and unread.deleted_at is null
        and unread.created_at > greatest(coalesce(me.last_read_at, 'epoch'::timestamptz), coalesce(me.cleared_at, 'epoch'::timestamptz))),
    me.muted and (me.muted_until is null or me.muted_until > now()),
    me.pinned_at is not null,
    me.cleared_at
  from public.chat_threads t
  join public.chat_participants me on me.thread_id = t.id and me.user_id = auth.uid()
  join public.chat_participants other on other.thread_id = t.id and other.user_id <> auth.uid()
  join public.profiles p on p.id = other.user_id
  left join lateral (
    select body, created_at, sender_id, message_type, deleted_at from public.chat_messages m
    where m.thread_id = t.id and m.created_at > coalesce(me.cleared_at, 'epoch'::timestamptz)
    order by m.created_at desc limit 1
  ) latest on true
  where t.thread_type = 'direct'
    and (me.cleared_at is null or latest.created_at is not null)
  order by me.pinned_at desc nulls last, latest.created_at desc nulls last, t.created_at desc;
$$;

-- Same as 202610090011, with the expiring mute.
create or replace function public.list_group_conversations()
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
    me.muted and (me.muted_until is null or me.muted_until > now()),
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
    and not (me.muted and (me.muted_until is null or me.muted_until > now()))
    and m.sender_id <> auth.uid()
    and m.message_type <> 'system'
    and m.deleted_at is null
    and m.created_at > greatest(coalesce(me.last_read_at, 'epoch'::timestamptz), coalesce(me.cleared_at, 'epoch'::timestamptz));
$$;

commit;
