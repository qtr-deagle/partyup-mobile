begin;

-- 202608280001_add_notifications.sql is marked as applied in this project's
-- migration history, but its DDL never actually took effect here: the
-- notifications table and its RPCs are missing from the live schema cache,
-- which breaks anything that writes a notification (review_id_verification,
-- join_trip_via_invite, etc.) with "relation public.notifications does not
-- exist". Recreate the same objects; everything below is idempotent.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('system', 'trip', 'message', 'match', 'safety')),
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.list_notifications()
returns setof public.notifications
language sql
security definer
set search_path = public
as $$
  select *
  from public.notifications
  where user_id = auth.uid()
  order by created_at desc;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set read = true
  where id = p_notification_id
    and user_id = auth.uid();
end;
$$;

commit;
