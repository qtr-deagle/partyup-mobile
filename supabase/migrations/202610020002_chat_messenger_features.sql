begin;

-- Messenger-style extras for direct chats: photos, replies, reactions,
-- unsend, and per-person mute / pin / delete-for-me.

-- ---------------------------------------------------------------------
-- 1. Photo messages and replies
-- ---------------------------------------------------------------------
alter table public.chat_messages
  add column if not exists image_path text,
  add column if not exists image_width int,
  add column if not exists image_height int,
  add column if not exists reply_to_id uuid references public.chat_messages(id) on delete set null;

alter table public.chat_messages drop constraint if exists chat_messages_message_type_check;
alter table public.chat_messages
  add constraint chat_messages_message_type_check
  check (message_type in ('text', 'system', 'location', 'image'));

create index if not exists chat_messages_thread_created_idx on public.chat_messages(thread_id, created_at);

-- A reply must quote a message from the same chat, and a photo must live in
-- that chat's storage folder, so neither can point at someone else's data.
create or replace function public.validate_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1 from public.chat_messages where id = new.reply_to_id and thread_id = new.thread_id
  ) then
    raise exception 'You can only reply to a message in this chat';
  end if;

  if new.message_type = 'image' and (new.image_path is null or new.image_path not like new.thread_id::text || '/%') then
    raise exception 'Invalid photo';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_chat_message on public.chat_messages;
create trigger validate_chat_message
before insert on public.chat_messages
for each row execute function public.validate_chat_message();

-- Unsend: soft delete so the change streams to the other person over realtime.
create or replace function public.unsend_chat_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.chat_messages;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_message from public.chat_messages where id = p_message_id for update;
  if v_message.id is null or v_message.deleted_at is not null then
    return;
  end if;
  if v_message.sender_id <> auth.uid() then
    raise exception 'You can only unsend your own messages';
  end if;

  update public.chat_messages
  set body = '', image_path = null, location = '{}'::jsonb, deleted_at = now(), deleted_by = auth.uid()
  where id = v_message.id;

  delete from public.chat_message_reactions where message_id = v_message.id;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Reactions (one per person per message, like Messenger)
-- ---------------------------------------------------------------------
create table if not exists public.chat_message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '😆', '😮', '😢', '😡', '👍')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists chat_message_reactions_thread_idx on public.chat_message_reactions(thread_id);

-- thread_id is copied from the message so it can't be spoofed.
create or replace function public.set_chat_reaction_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select thread_id into new.thread_id from public.chat_messages where id = new.message_id and deleted_at is null;
  if new.thread_id is null then
    raise exception 'Message not found';
  end if;
  return new;
end;
$$;

drop trigger if exists set_chat_reaction_thread on public.chat_message_reactions;
create trigger set_chat_reaction_thread
before insert or update on public.chat_message_reactions
for each row execute function public.set_chat_reaction_thread();

alter table public.chat_message_reactions enable row level security;
-- Realtime DELETE events only carry the primary key without this.
alter table public.chat_message_reactions replica identity full;

drop policy if exists "chat reactions read" on public.chat_message_reactions;
create policy "chat reactions read" on public.chat_message_reactions for select to authenticated
using (public.is_thread_participant(thread_id));

drop policy if exists "chat reactions insert" on public.chat_message_reactions;
create policy "chat reactions insert" on public.chat_message_reactions for insert to authenticated
with check (user_id = auth.uid() and public.is_thread_participant(thread_id));

drop policy if exists "chat reactions update" on public.chat_message_reactions;
create policy "chat reactions update" on public.chat_message_reactions for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_thread_participant(thread_id));

drop policy if exists "chat reactions delete" on public.chat_message_reactions;
create policy "chat reactions delete" on public.chat_message_reactions for delete to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.chat_message_reactions to authenticated;
grant all on public.chat_message_reactions to service_role;

grant execute on function public.unsend_chat_message(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Per-person chat settings
-- ---------------------------------------------------------------------
alter table public.chat_participants
  add column if not exists muted boolean not null default false,
  add column if not exists pinned_at timestamptz,
  add column if not exists cleared_at timestamptz;

create or replace function public.set_chat_muted(p_thread_id uuid, p_muted boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_participants set muted = p_muted
  where thread_id = p_thread_id and user_id = auth.uid();
$$;

create or replace function public.set_chat_pinned(p_thread_id uuid, p_pinned boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_participants set pinned_at = case when p_pinned then now() else null end
  where thread_id = p_thread_id and user_id = auth.uid();
$$;

-- Delete for me: hides everything up to now. The chat comes back in the list
-- (with only the new messages) once the other person writes again.
create or replace function public.clear_chat_for_me(p_thread_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_participants
  set cleared_at = now(), last_read_at = now(), last_delivered_at = now(), pinned_at = null
  where thread_id = p_thread_id and user_id = auth.uid();
$$;

grant execute on function public.set_chat_muted(uuid, boolean) to authenticated;
grant execute on function public.set_chat_pinned(uuid, boolean) to authenticated;
grant execute on function public.clear_chat_for_me(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Conversation list with the new fields
-- ---------------------------------------------------------------------
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
    me.muted,
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
    -- A deleted chat stays hidden until there's something new in it.
    and (me.cleared_at is null or latest.created_at is not null)
  order by me.pinned_at desc nulls last, latest.created_at desc nulls last, t.created_at desc;
$$;

grant execute on function public.list_direct_conversations() to authenticated;

-- Tab badge: skip muted chats, unsent messages and anything deleted-for-me.
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
    and not me.muted
    and m.sender_id <> auth.uid()
    and m.message_type <> 'system'
    and m.deleted_at is null
    and m.created_at > greatest(coalesce(me.last_read_at, 'epoch'::timestamptz), coalesce(me.cleared_at, 'epoch'::timestamptz));
$$;

grant execute on function public.count_unread_messages() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Private photo storage: <thread_id>/<file>.jpg, chat members only
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

-- Folder names that aren't a uuid would make the cast throw, so check first.
create or replace function public.can_access_chat_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_thread_participant(((storage.foldername(p_name))[1])::uuid)
    else false
  end;
$$;

grant execute on function public.can_access_chat_folder(text) to authenticated;

drop policy if exists "chat media participant insert" on storage.objects;
create policy "chat media participant insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and public.can_access_chat_folder(name));

drop policy if exists "chat media participant select" on storage.objects;
create policy "chat media participant select"
  on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and public.can_access_chat_folder(name));

-- ---------------------------------------------------------------------
-- 6. Realtime
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_message_reactions') then
    alter publication supabase_realtime add table public.chat_message_reactions;
  end if;
end;
$$;

commit;
