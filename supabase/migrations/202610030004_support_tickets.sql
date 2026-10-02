begin;

-- Support tickets ("Help & Reports" in the app). A traveler opens a ticket on
-- a topic; admins answer from the website's Support page; both sides keep
-- replying in one thread until it's closed.
--
-- Problems with a Guild Leader come here, not to the guild's own report inbox
-- (submit_guild_report refuses them, see 202610030002). A 'guild_leader'
-- ticket also files a public.reports row with guild_id set, so it shows in
-- the admin Reports queue with its "From guild X" badge.
--
-- Writes go through the RPCs below only. Keep categories in sync with
-- TICKET_CATEGORIES in lib/support.ts and the website's lib/supportTickets.ts.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('safety', 'account', 'payment', 'trip', 'bug', 'other', 'guild_leader')),
  subject text not null check (char_length(subject) between 1 and 120),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  reported_user_id uuid references public.profiles(id) on delete set null,
  guild_id uuid references public.guilds(id) on delete set null,
  trip_id uuid references public.trips(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  evidence_paths text[] not null default '{}',
  -- An admin replied and the user hasn't opened the ticket since.
  user_unread boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index if not exists support_tickets_user_idx on public.support_tickets(user_id, last_message_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status, last_message_at desc);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  from_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_messages_ticket_idx on public.support_ticket_messages(ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

drop policy if exists "support tickets own or admin" on public.support_tickets;
create policy "support tickets own or admin" on public.support_tickets for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "support ticket messages own or admin" on public.support_ticket_messages;
create policy "support ticket messages own or admin" on public.support_ticket_messages for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );

grant select on public.support_tickets, public.support_ticket_messages to authenticated;
grant all on public.support_tickets, public.support_ticket_messages to service_role;

-- Live updates for the app's ticket thread and the website's Support page.
do $$
declare
  t text;
begin
  foreach t in array array['support_tickets', 'support_ticket_messages'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Opening a ticket
-- ---------------------------------------------------------------------
create or replace function public.create_support_ticket(
  p_category text,
  p_subject text,
  p_body text,
  p_reported_user_id uuid default null,
  p_guild_id uuid default null,
  p_trip_id uuid default null,
  p_evidence_paths text[] default '{}'
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
  v_guild public.guilds;
  v_report_id uuid;
  v_path text;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_category not in ('safety', 'account', 'payment', 'trip', 'bug', 'other', 'guild_leader') then
    raise exception 'Pick a topic';
  end if;
  if v_subject = '' then
    raise exception 'Add a short subject';
  end if;
  if char_length(v_subject) > 120 then
    raise exception 'Keep the subject under 120 characters';
  end if;
  if v_body = '' then
    raise exception 'Please describe what happened';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Please keep it under 2000 characters';
  end if;
  if p_reported_user_id = auth.uid() then
    raise exception 'You cannot report yourself';
  end if;

  if array_length(p_evidence_paths, 1) > 5 then
    raise exception 'You can attach up to 5 photos';
  end if;
  foreach v_path in array coalesce(p_evidence_paths, '{}') loop
    if v_path not like auth.uid()::text || '/support-%' then
      raise exception 'Invalid photo';
    end if;
  end loop;

  if (select count(*) from public.support_tickets
      where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You''ve opened 5 tickets today. Reply on an open one, or try again tomorrow';
  end if;

  if p_category = 'guild_leader' then
    select g.* into v_guild
    from public.guild_members gm join public.guilds g on g.id = gm.guild_id
    where gm.user_id = auth.uid();
    if v_guild.id is null or p_reported_user_id is null or v_guild.leader_id <> p_reported_user_id then
      raise exception 'You can only report the leader of your own guild here';
    end if;

    -- This ticket is the report's ticket, so the report -> ticket trigger
    -- (202610030005) must not open a second one.
    perform set_config('partyup.skip_report_ticket', 'on', true);
    insert into public.reports (reporter_id, reported_user_id, report_type, details, evidence_paths, guild_id)
    values (auth.uid(), p_reported_user_id, 'behavior',
      format('[Guild: %s] Report about the Guild Leader (support ticket).', v_guild.name)
        || E'\n\n' || v_subject || E'\n\n' || v_body,
      coalesce(p_evidence_paths, '{}'), v_guild.id)
    returning id into v_report_id;
    perform set_config('partyup.skip_report_ticket', 'off', true);
  end if;

  insert into public.support_tickets (user_id, category, subject, reported_user_id, guild_id, trip_id, report_id, evidence_paths)
  values (auth.uid(), p_category, v_subject, p_reported_user_id,
    case when p_category = 'guild_leader' then v_guild.id else p_guild_id end,
    p_trip_id, v_report_id, coalesce(p_evidence_paths, '{}'))
  returning * into v_ticket;

  insert into public.support_ticket_messages (ticket_id, sender_id, from_staff, body)
  values (v_ticket.id, auth.uid(), false, v_body);

  return v_ticket;
end;
$$;

revoke all on function public.create_support_ticket(text, text, text, uuid, uuid, uuid, text[]) from public, anon;
grant execute on function public.create_support_ticket(text, text, text, uuid, uuid, uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Replying: the ticket's owner or an admin.
-- ---------------------------------------------------------------------
create or replace function public.reply_support_ticket(p_ticket_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
  v_body text := btrim(coalesce(p_body, ''));
  v_staff boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if v_body = '' then
    raise exception 'Write a message first';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Please keep it under 2000 characters';
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if v_ticket.id is null or not (v_ticket.user_id = auth.uid() or public.is_admin()) then
    raise exception 'Ticket not found';
  end if;
  v_staff := v_ticket.user_id <> auth.uid();

  if not v_staff and (select count(*) from public.support_ticket_messages
      where ticket_id = v_ticket.id and sender_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many messages. Try again in a bit';
  end if;

  insert into public.support_ticket_messages (ticket_id, sender_id, from_staff, body)
  values (v_ticket.id, auth.uid(), v_staff, v_body);

  update public.support_tickets
  set status = case when v_staff then 'answered' else 'open' end,
      user_unread = v_staff,
      last_message_at = now(),
      updated_at = now()
  where id = v_ticket.id;

  if v_staff then
    insert into public.notifications (user_id, type, title, message, data)
    values (v_ticket.user_id, 'system', 'PartyUp support replied',
      'New reply on "' || v_ticket.subject || '".',
      jsonb_build_object('route', '/support/' || v_ticket.id, 'ticket_id', v_ticket.id));
  end if;
end;
$$;

revoke all on function public.reply_support_ticket(uuid, text) from public, anon;
grant execute on function public.reply_support_ticket(uuid, text) to authenticated;

-- Admins set any status; the owner can only close their ticket.
create or replace function public.set_support_ticket_status(p_ticket_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
begin
  if p_status not in ('open', 'answered', 'closed') then
    raise exception 'Invalid status';
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if v_ticket.id is null or not (v_ticket.user_id = auth.uid() or public.is_admin()) then
    raise exception 'Ticket not found';
  end if;
  if not public.is_admin() and p_status <> 'closed' then
    raise exception 'You can only close your ticket';
  end if;

  update public.support_tickets set status = p_status, updated_at = now() where id = v_ticket.id;

  if p_status = 'closed' and v_ticket.user_id <> auth.uid() and v_ticket.status <> 'closed' then
    insert into public.notifications (user_id, type, title, message, data)
    values (v_ticket.user_id, 'system', 'Ticket closed',
      'PartyUp support closed "' || v_ticket.subject || '". Reply on it any time to reopen it.',
      jsonb_build_object('route', '/support/' || v_ticket.id, 'ticket_id', v_ticket.id));
  end if;
end;
$$;

revoke all on function public.set_support_ticket_status(uuid, text) from public, anon;
grant execute on function public.set_support_ticket_status(uuid, text) to authenticated;

create or replace function public.mark_support_ticket_read(p_ticket_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.support_tickets set user_unread = false
  where id = p_ticket_id and user_id = auth.uid() and user_unread;
$$;

revoke all on function public.mark_support_ticket_read(uuid) from public, anon;
grant execute on function public.mark_support_ticket_read(uuid) to authenticated;

commit;
