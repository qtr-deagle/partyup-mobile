begin;

-- Every carpool and tour gets a group chat. Accepted members are in it;
-- leaving, being rejected or removed takes you out. Same approach as the
-- guild chat (202610010007): membership is kept in sync by a trigger.

create unique index if not exists chat_threads_trip_unique_idx
on public.chat_threads(trip_id)
where thread_type = 'trip';

create or replace function public.ensure_trip_chat_thread(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_trip public.trips;
begin
  select id into v_thread from public.chat_threads where trip_id = p_trip_id and thread_type = 'trip';
  if v_thread is not null then
    return v_thread;
  end if;

  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null then
    return null;
  end if;

  insert into public.chat_threads (created_by, thread_type, title, trip_id)
  values (v_trip.creator_id, 'trip', v_trip.title, v_trip.id)
  on conflict (trip_id) where thread_type = 'trip' do nothing
  returning id into v_thread;

  -- Lost a race with another insert: use theirs.
  if v_thread is null then
    select id into v_thread from public.chat_threads where trip_id = p_trip_id and thread_type = 'trip';
  end if;
  return v_thread;
end;
$$;

revoke all on function public.ensure_trip_chat_thread(uuid) from public, anon, authenticated;

create or replace function public.sync_trip_chat_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'accepted' then
    v_thread := public.ensure_trip_chat_thread(new.trip_id);
    if v_thread is not null then
      insert into public.chat_participants (thread_id, user_id) values (v_thread, new.user_id)
      on conflict (thread_id, user_id) do nothing;
    end if;
    return new;
  end if;

  if (tg_op = 'UPDATE' and old.status = 'accepted' and new.status <> 'accepted') or (tg_op = 'DELETE' and old.status = 'accepted') then
    delete from public.chat_participants cp
    using public.chat_threads t
    where t.id = cp.thread_id and t.trip_id = old.trip_id and t.thread_type = 'trip' and cp.user_id = old.user_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_trip_chat_member on public.trip_members;
create trigger sync_trip_chat_member
after insert or update of status or delete on public.trip_members
for each row execute function public.sync_trip_chat_member();

-- Keep the chat name in step with the trip title.
create or replace function public.sync_trip_chat_title()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title is distinct from old.title then
    update public.chat_threads set title = new.title where trip_id = new.id and thread_type = 'trip';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_trip_chat_title on public.trips;
create trigger sync_trip_chat_title
after update of title on public.trips
for each row execute function public.sync_trip_chat_title();

-- Backfill: chats for existing trips that aren't cancelled.
do $$
declare
  v_trip record;
  v_thread uuid;
begin
  for v_trip in
    select distinct t.id from public.trips t
    join public.trip_members tm on tm.trip_id = t.id and tm.status = 'accepted'
    where t.status <> 'cancelled'
  loop
    v_thread := public.ensure_trip_chat_thread(v_trip.id);
    insert into public.chat_participants (thread_id, user_id)
    select v_thread, tm.user_id from public.trip_members tm
    where tm.trip_id = v_trip.id and tm.status = 'accepted'
    on conflict (thread_id, user_id) do nothing;
  end loop;
end;
$$;

-- The trip's chat, for a member opening it from the trip screen.
create or replace function public.get_trip_chat_thread(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
begin
  if not exists (select 1 from public.trip_members where trip_id = p_trip_id and user_id = auth.uid() and status = 'accepted') then
    raise exception 'Only trip members can open this chat';
  end if;
  v_thread := public.ensure_trip_chat_thread(p_trip_id);
  insert into public.chat_participants (thread_id, user_id) values (v_thread, auth.uid())
  on conflict (thread_id, user_id) do nothing;
  return v_thread;
end;
$$;

grant execute on function public.get_trip_chat_thread(uuid) to authenticated;

-- Trip group chats for the Messages list.
create or replace function public.list_group_conversations()
returns table (
  thread_id uuid,
  trip_id uuid,
  title text,
  trip_type text,
  trip_status text,
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
    t.trip_id,
    coalesce(tr.title, t.title),
    tr.trip_type,
    tr.status,
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
  join public.trips tr on tr.id = t.trip_id
  left join lateral (
    select body, message_type, deleted_at, created_at, sender_id from public.chat_messages m
    where m.thread_id = t.id order by m.created_at desc limit 1
  ) latest on true
  left join public.profiles sender on sender.id = latest.sender_id
  where t.thread_type = 'trip'
  order by me.pinned_at desc nulls last, coalesce(latest.created_at, t.created_at) desc;
$$;

grant execute on function public.list_group_conversations() to authenticated;

-- Tab badge now counts trip chats too (still not muted ones).
create or replace function public.count_unread_messages()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.chat_participants me
  join public.chat_threads t on t.id = me.thread_id and t.thread_type in ('direct', 'trip')
  join public.chat_messages m on m.thread_id = me.thread_id
  where me.user_id = auth.uid()
    and not me.muted
    and m.sender_id <> auth.uid()
    and m.message_type <> 'system'
    and m.deleted_at is null
    and m.created_at > greatest(coalesce(me.last_read_at, 'epoch'::timestamptz), coalesce(me.cleared_at, 'epoch'::timestamptz));
$$;

grant execute on function public.count_unread_messages() to authenticated;

commit;
