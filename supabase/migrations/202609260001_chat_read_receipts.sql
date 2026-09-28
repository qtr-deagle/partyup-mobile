begin;

-- Chat read receipts: Sent -> Delivered -> Seen.
--
-- "Delivered" = the recipient's app has pulled the message down (it was open,
-- or they opened it later). "Seen" = they opened the conversation, which the
-- existing chat_participants.last_read_at already records. Co-participants
-- can now read each other's receipt timestamps, and updates stream over
-- realtime so the sender's ticks flip live.

alter table public.chat_participants
  add column if not exists last_delivered_at timestamptz;

drop policy if exists "chat participants see co-participants" on public.chat_participants;
create policy "chat participants see co-participants"
on public.chat_participants
for select
to authenticated
using (public.is_thread_participant(thread_id));

-- Reading a thread implies it was delivered too.
create or replace function public.mark_thread_read(p_thread_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_participants
  set last_read_at = now(),
      last_delivered_at = now()
  where thread_id = p_thread_id and user_id = auth.uid();
$$;

grant execute on function public.mark_thread_read(uuid) to authenticated;

-- Called when the app receives messages; only touches threads that actually
-- have something newer than the last delivery, so it doesn't spam realtime.
create or replace function public.mark_threads_delivered()
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_participants cp
  set last_delivered_at = now()
  where cp.user_id = auth.uid()
    and exists (
      select 1 from public.chat_messages m
      where m.thread_id = cp.thread_id
        and m.sender_id <> auth.uid()
        and m.created_at > coalesce(cp.last_delivered_at, 'epoch'::timestamptz)
    );
$$;

grant execute on function public.mark_threads_delivered() to authenticated;

-- Return type changes, so the function has to be dropped first.
drop function if exists public.list_direct_conversations();

create function public.list_direct_conversations()
returns table (
  thread_id uuid,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  interests text[],
  last_message text,
  last_message_at timestamptz,
  last_message_sender_id uuid,
  other_last_read_at timestamptz,
  other_last_delivered_at timestamptz,
  unread_count bigint
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
    other.last_read_at,
    other.last_delivered_at,
    (select count(*) from public.chat_messages unread where unread.thread_id = t.id and unread.sender_id <> auth.uid() and unread.created_at > coalesce(me.last_read_at, 'epoch'::timestamptz))
  from public.chat_threads t
  join public.chat_participants me on me.thread_id = t.id and me.user_id = auth.uid()
  join public.chat_participants other on other.thread_id = t.id and other.user_id <> auth.uid()
  join public.profiles p on p.id = other.user_id
  left join lateral (
    select body, created_at, sender_id from public.chat_messages m where m.thread_id = t.id order by m.created_at desc limit 1
  ) latest on true
  where t.thread_type = 'direct'
  order by latest.created_at desc nulls last, t.created_at desc;
$$;

grant execute on function public.list_direct_conversations() to authenticated;

-- Total unread across direct chats, for the Chat tab badge.
create or replace function public.count_unread_messages()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.chat_participants me
  join public.chat_threads t on t.id = me.thread_id and t.thread_type = 'direct'
  join public.chat_messages m on m.thread_id = me.thread_id
  where me.user_id = auth.uid()
    and m.sender_id <> auth.uid()
    and m.message_type <> 'system'
    and m.created_at > coalesce(me.last_read_at, 'epoch'::timestamptz);
$$;

grant execute on function public.count_unread_messages() to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_participants') then
    alter publication supabase_realtime add table public.chat_participants;
  end if;
end;
$$;

commit;
