begin;

-- Push notifications for everything, not just SOS.
--
-- Every notification row (trip joins/leaves/cancellations, payments,
-- verification results, friend activity) and every chat message now fans out
-- to the recipients' devices through the `dispatch-push` edge function. The
-- database only sends the row id; the function re-reads the row with the
-- service role, so a forged call can at worst re-push an existing row.
--
-- One-time setup (SQL editor), using the same secret as the function's
-- PUSH_WEBHOOK_SECRET env var:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<random string>', 'push_webhook_secret');
-- Until both exist the triggers below silently do nothing.

create extension if not exists pg_net;

create or replace function public.enqueue_push(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/dispatch-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('kind', p_kind, 'id', p_id)
  );
exception when others then
  -- A push is best-effort: never fail the insert that triggered it.
  raise warning 'enqueue_push failed: %', sqlerrm;
end;
$$;

revoke all on function public.enqueue_push(text, uuid) from public, anon, authenticated;

-- SOS alerts keep their dedicated, higher-priority send-sos-push path.
create or replace function public.push_new_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type <> 'safety' then
    perform public.enqueue_push('notification', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists push_new_notification on public.notifications;
create trigger push_new_notification
after insert on public.notifications
for each row execute function public.push_new_notification();

create or replace function public.push_new_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.message_type <> 'system' then
    perform public.enqueue_push('chat_message', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists push_new_chat_message on public.chat_messages;
create trigger push_new_chat_message
after insert on public.chat_messages
for each row execute function public.push_new_chat_message();

-- Friend requests had no notifications at all. A request can be created
-- fresh or revived from an old rejected/cancelled row, so both paths count.
create or replace function public.notify_friend_request_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status <> 'pending') then
    select display_name into v_name from public.profiles where id = new.requester_id;
    insert into public.notifications (user_id, type, title, message, data)
    values (
      new.recipient_id, 'match', 'New friend request',
      coalesce(v_name, 'Someone') || ' wants to connect with you.',
      jsonb_build_object('kind', 'friend_request', 'from_user_id', new.requester_id)
    );
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    select display_name into v_name from public.profiles where id = new.recipient_id;
    insert into public.notifications (user_id, type, title, message, data)
    values (
      new.requester_id, 'match', 'Friend request accepted',
      coalesce(v_name, 'Someone') || ' accepted your friend request.',
      jsonb_build_object('kind', 'friend_accepted', 'from_user_id', new.recipient_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_friend_request_change on public.friend_requests;
create trigger notify_friend_request_change
after insert or update of status on public.friend_requests
for each row execute function public.notify_friend_request_change();

commit;
