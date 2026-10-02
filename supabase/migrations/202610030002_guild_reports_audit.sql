begin;

-- Guild reports and a guild audit log.
--
-- Members report problems inside their guild; the Guild Leader handles them
-- and can escalate one to admins. Escalating files a normal
-- public.reports row (linked back via guild_id / guild_report_id), so it shows
-- up in the website's existing reports queue.
--
-- Routing:
--   * reports about the leader aren't accepted here: they go through a
--     support ticket (202610030004), which also files an admin report
--   * a safety report goes to admins at once; managers still see it
--   * anything left open for 72 hours escalates on its own (pg_cron)
-- Anonymous reports hide the reporter from the guild; admins always see them.
--
-- The audit log is written only by triggers and these RPCs (never by
-- clients), and managers read it through get_guild_audit_log(). Keep the
-- actions in sync with AUDIT_ACTIONS in lib/guildReports.ts.

-- =====================================================================
-- 1. Audit log
-- =====================================================================
-- No foreign key to guilds: events written while a guild is being deleted
-- would fail the check, and admins may still want the history.
create table if not exists public.guild_audit_events (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists guild_audit_events_guild_idx on public.guild_audit_events(guild_id, created_at desc);

alter table public.guild_audit_events enable row level security;
-- Direct reads are admin-only. Managers go through get_guild_audit_log(),
-- which hides report events about the caller.
drop policy if exists "guild audit admin read" on public.guild_audit_events;
create policy "guild audit admin read" on public.guild_audit_events for select to authenticated
  using (public.is_admin());
grant select on public.guild_audit_events to authenticated;
grant all on public.guild_audit_events to service_role;

create or replace function public.log_guild_event(
  p_guild_id uuid,
  p_actor_id uuid,
  p_action text,
  p_target_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id is null or not exists (select 1 from public.guilds where id = p_guild_id) then
    return;
  end if;
  insert into public.guild_audit_events (guild_id, actor_id, action, target_user_id, metadata)
  values (p_guild_id, p_actor_id, p_action, p_target_user_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke all on function public.log_guild_event(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1a. Members: joined, left, removed
-- ---------------------------------------------------------------------
create or replace function public.guild_audit_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_guild_event(new.guild_id, auth.uid(), 'member_joined', new.user_id);
  elsif tg_op = 'DELETE' then
    perform public.log_guild_event(old.guild_id, auth.uid(),
      case when auth.uid() = old.user_id then 'member_left' else 'member_removed' end, old.user_id);
  end if;
  return null;
end;
$$;

revoke all on function public.guild_audit_members() from public, anon, authenticated;

drop trigger if exists guild_audit_members on public.guild_members;
create trigger guild_audit_members
  after insert or delete on public.guild_members
  for each row execute function public.guild_audit_members();

-- ---------------------------------------------------------------------
-- 1b. Guild settings, look, announcement, leadership
-- ---------------------------------------------------------------------
create or replace function public.guild_audit_guilds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_settings text[];
  v_look text[];
begin
  select array_agg(key order by key) into v_settings
  from unnest(array['name', 'tagline', 'join_policy', 'min_rank', 'description', 'focus', 'areas']) key
  where v_new -> key is distinct from v_old -> key;

  select array_agg(key order by key) into v_look
  from unnest(array['emblem', 'color']) key
  where v_new -> key is distinct from v_old -> key;

  if v_settings is not null then
    perform public.log_guild_event(new.id, auth.uid(), 'settings_changed', null,
      jsonb_build_object('fields', to_jsonb(v_settings))
        || case when 'name' = any(v_settings) then jsonb_build_object('old_name', old.name, 'new_name', new.name) else '{}'::jsonb end);
  end if;

  if v_look is not null then
    perform public.log_guild_event(new.id, auth.uid(), 'appearance_changed', null, jsonb_build_object('fields', to_jsonb(v_look)));
  end if;

  if new.announcement is distinct from old.announcement then
    perform public.log_guild_event(new.id, auth.uid(),
      case when new.announcement is null then 'announcement_cleared' else 'announcement_set' end, null,
      case when new.announcement is null then '{}'::jsonb else jsonb_build_object('excerpt', left(new.announcement, 140)) end);
  end if;

  if new.leader_id is distinct from old.leader_id then
    perform public.log_guild_event(new.id, auth.uid(), 'leadership_transferred', new.leader_id,
      jsonb_build_object('previous_leader_id', old.leader_id));
  end if;

  return null;
end;
$$;

revoke all on function public.guild_audit_guilds() from public, anon, authenticated;

drop trigger if exists guild_audit_guilds on public.guilds;
create trigger guild_audit_guilds
  after update on public.guilds
  for each row execute function public.guild_audit_guilds();

-- ---------------------------------------------------------------------
-- 1c. Join requests answered, invites sent
-- ---------------------------------------------------------------------
create or replace function public.guild_audit_join_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status in ('accepted', 'declined') then
    perform public.log_guild_event(new.guild_id, auth.uid(),
      case when new.status = 'accepted' then 'join_request_accepted' else 'join_request_declined' end, new.user_id);
  end if;
  return null;
end;
$$;

revoke all on function public.guild_audit_join_requests() from public, anon, authenticated;

drop trigger if exists guild_audit_join_requests on public.guild_join_requests;
create trigger guild_audit_join_requests
  after update of status on public.guild_join_requests
  for each row execute function public.guild_audit_join_requests();

create or replace function public.guild_audit_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_guild_event(new.guild_id, coalesce(new.invited_by, auth.uid()), 'invite_sent', new.user_id);
  return null;
end;
$$;

revoke all on function public.guild_audit_invites() from public, anon, authenticated;

drop trigger if exists guild_audit_invites on public.guild_invites;
create trigger guild_audit_invites
  after insert on public.guild_invites
  for each row execute function public.guild_audit_invites();

-- ---------------------------------------------------------------------
-- 1d. Guild chat moderation. A sender unsending their own message isn't
--     moderation, so only removals by someone else are logged.
-- ---------------------------------------------------------------------
create or replace function public.guild_audit_chat_removals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild_id uuid;
begin
  if old.deleted_at is not null or new.deleted_at is null or new.deleted_by is null or new.deleted_by = old.sender_id then
    return null;
  end if;
  select guild_id into v_guild_id from public.chat_threads where id = new.thread_id;
  if v_guild_id is null then
    return null;
  end if;
  perform public.log_guild_event(v_guild_id, new.deleted_by, 'chat_message_deleted', old.sender_id,
    jsonb_build_object('message_id', old.id, 'excerpt', left(old.body, 140)));
  return null;
end;
$$;

revoke all on function public.guild_audit_chat_removals() from public, anon, authenticated;

drop trigger if exists guild_audit_chat_removals on public.chat_messages;
create trigger guild_audit_chat_removals
  after update of deleted_at on public.chat_messages
  for each row execute function public.guild_audit_chat_removals();

-- =====================================================================
-- 2. Guild reports
-- =====================================================================
create table if not exists public.guild_reports (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  chat_message_id uuid references public.chat_messages(id) on delete set null,
  -- Snapshot of the reported message, kept even if it's removed later.
  message_excerpt text,
  category text not null check (category in ('behavior', 'spam', 'safety', 'other')),
  details text not null check (char_length(details) <= 2000),
  evidence_paths text[] not null default '{}',
  anonymous boolean not null default false,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed', 'escalated')),
  escalation_reason text check (escalation_reason in ('leader', 'safety', 'timeout')),
  escalated_report_id uuid references public.reports(id) on delete set null,
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists guild_reports_guild_idx on public.guild_reports(guild_id, created_at desc);
create index if not exists guild_reports_reporter_idx on public.guild_reports(reporter_id, created_at desc);
create index if not exists guild_reports_open_idx on public.guild_reports(created_at) where status = 'open';

alter table public.guild_reports enable row level security;
-- Reporters read their own; managers read through list_guild_reports(),
-- which masks anonymous reporters (RLS can't hide single columns).
drop policy if exists "guild reports own or admin" on public.guild_reports;
create policy "guild reports own or admin" on public.guild_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
grant select on public.guild_reports to authenticated;
grant all on public.guild_reports to service_role;

-- Where an admin report came from, for the website.
alter table public.reports
  add column if not exists guild_id uuid references public.guilds(id) on delete set null,
  add column if not exists guild_report_id uuid references public.guild_reports(id) on delete set null;

create index if not exists reports_guild_id_idx on public.reports(guild_id) where guild_id is not null;

-- ---------------------------------------------------------------------
-- 2a. Evidence photos: report-evidence/guild-reports/<guild_id>/<file>.
--     No user id in the path, so anonymous reports stay anonymous.
-- ---------------------------------------------------------------------
drop policy if exists "guild report evidence member insert" on storage.objects;
create policy "guild report evidence member insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-evidence'
    and (storage.foldername(name))[1] = 'guild-reports'
    and (storage.foldername(name))[2] = (select gm.guild_id::text from public.guild_members gm where gm.user_id = auth.uid())
  );

drop policy if exists "guild report evidence read" on storage.objects;
create policy "guild report evidence read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-evidence'
    and (storage.foldername(name))[1] = 'guild-reports'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.guild_members gm
        where gm.guild_id::text = (storage.foldername(name))[2]
          and public.can_manage_guild(gm.guild_id)
      )
    )
  );

-- ---------------------------------------------------------------------
-- 2b. Notifying
-- ---------------------------------------------------------------------
-- The Guild Leader, unless the report is about them or from them.
create or replace function public.notify_guild_report_managers(p_report public.guild_reports, p_title text, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, message, data)
  select m, 'system', p_title, p_message,
    jsonb_build_object('guild_id', p_report.guild_id, 'guild_report_id', p_report.id, 'route', '/guild')
  from public.guild_manager_ids(p_report.guild_id) m
  where m is distinct from p_report.reported_user_id and m <> p_report.reporter_id;
end;
$$;

revoke all on function public.notify_guild_report_managers(public.guild_reports, text, text) from public, anon, authenticated;

create or replace function public.notify_guild_reporter(p_report public.guild_reports, p_title text, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, message, data)
  values (p_report.reporter_id, 'system', p_title, p_message,
    jsonb_build_object('guild_id', p_report.guild_id, 'guild_report_id', p_report.id, 'route', '/guild'));
end;
$$;

revoke all on function public.notify_guild_reporter(public.guild_reports, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2c. Escalation (internal): files the admin report and links it.
-- ---------------------------------------------------------------------
create or replace function public._escalate_guild_report(p_report_id uuid, p_reason text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.guild_reports;
  v_guild_name text;
  v_admin_report_id uuid;
  v_details text;
begin
  select * into v_report from public.guild_reports where id = p_report_id for update;
  if v_report.id is null or v_report.status = 'escalated' then
    return v_report.escalated_report_id;
  end if;

  select name into v_guild_name from public.guilds where id = v_report.guild_id;

  v_details := format('[Guild: %s] ', coalesce(v_guild_name, 'unknown'))
    || case p_reason
         when 'leader' then 'Escalated by the Guild Leader.'
         when 'safety' then 'Safety report, sent to admins automatically.'
         else 'Not handled by the guild within 72 hours.'
       end
    || case when v_report.anonymous then ' Reporter asked to stay anonymous to the guild.' else '' end
    || E'\n\n' || v_report.details
    || case when v_report.message_excerpt is not null then E'\n\nReported guild chat message: "' || v_report.message_excerpt || '"' else '' end
    || case when nullif(trim(coalesce(p_note, '')), '') is not null then E'\n\nNote from the Guild Leader: ' || trim(p_note) else '' end;

  insert into public.reports (reporter_id, reported_user_id, report_type, details, evidence_paths, guild_id, guild_report_id)
  values (
    v_report.reporter_id,
    v_report.reported_user_id,
    case v_report.category when 'safety' then 'safety' when 'other' then 'other' else 'behavior' end,
    v_details,
    v_report.evidence_paths,
    v_report.guild_id,
    v_report.id
  )
  returning id into v_admin_report_id;

  update public.guild_reports
  set status = 'escalated',
      escalation_reason = p_reason,
      escalated_report_id = v_admin_report_id,
      handled_by = case when p_reason = 'leader' then auth.uid() else handled_by end,
      handled_at = now(),
      resolution_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), resolution_note)
  where id = v_report.id
  returning * into v_report;

  perform public.log_guild_event(v_report.guild_id, case when p_reason = 'leader' then auth.uid() end,
    'report_escalated', v_report.reported_user_id,
    jsonb_build_object('report_id', v_report.id, 'category', v_report.category, 'reason', p_reason));

  perform public.notify_guild_reporter(v_report, 'Report sent to PartyUp admins',
    case p_reason
      when 'leader' then 'Your guild leader passed your report to the PartyUp team. Follow it in Help & Reports.'
      when 'timeout' then 'Your guild didn''t handle your report within 72 hours, so the PartyUp team will review it. Follow it in Help & Reports.'
      else 'The PartyUp team will review your report too. Follow it in Help & Reports.'
    end);

  if p_reason = 'timeout' then
    perform public.notify_guild_report_managers(v_report, 'Report sent to admins',
      'A guild report went unanswered for 72 hours and was passed to the PartyUp team.');
  end if;

  return v_admin_report_id;
end;
$$;

revoke all on function public._escalate_guild_report(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2d. Filing a report
-- ---------------------------------------------------------------------
create or replace function public.submit_guild_report(
  p_guild_id uuid,
  p_category text,
  p_details text,
  p_reported_user_id uuid default null,
  p_chat_message_id uuid default null,
  p_evidence_paths text[] default '{}',
  p_anonymous boolean default false
)
returns public.guild_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds;
  v_report public.guild_reports;
  v_reported uuid := p_reported_user_id;
  v_excerpt text;
  v_path text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select g.* into v_guild
  from public.guild_members gm join public.guilds g on g.id = gm.guild_id
  where gm.user_id = auth.uid();
  if v_guild.id is null or v_guild.id <> p_guild_id then
    raise exception 'You can only report problems in your own guild';
  end if;

  if p_category not in ('behavior', 'spam', 'safety', 'other') then
    raise exception 'Invalid report type';
  end if;
  if trim(coalesce(p_details, '')) = '' then
    raise exception 'Please describe what happened';
  end if;
  if char_length(trim(p_details)) > 2000 then
    raise exception 'Please keep it under 2000 characters';
  end if;

  if p_chat_message_id is not null then
    select m.sender_id, left(m.body, 500) into v_reported, v_excerpt
    from public.chat_messages m join public.chat_threads t on t.id = m.thread_id
    where m.id = p_chat_message_id and t.guild_id = v_guild.id;
    if not found then
      raise exception 'That message isn''t in your guild chat';
    end if;
  end if;

  if v_reported = auth.uid() then
    raise exception 'You cannot report yourself';
  end if;
  -- The leader handles guild reports, so problems with them go to PartyUp
  -- through a support ticket instead.
  if v_reported = v_guild.leader_id then
    raise exception 'Reports about the Guild Leader go to PartyUp support. Use Help & Reports';
  end if;
  if v_reported is not null and p_chat_message_id is null
    and not exists (select 1 from public.guild_members where guild_id = v_guild.id and user_id = v_reported) then
    raise exception 'They''re not in your guild';
  end if;

  if array_length(p_evidence_paths, 1) > 5 then
    raise exception 'You can attach up to 5 photos';
  end if;
  foreach v_path in array coalesce(p_evidence_paths, '{}') loop
    if v_path not like 'guild-reports/' || v_guild.id::text || '/%' then
      raise exception 'Invalid photo';
    end if;
  end loop;

  if (select count(*) from public.guild_reports
      where reporter_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You''ve sent a lot of reports today. Try again tomorrow';
  end if;

  insert into public.guild_reports (guild_id, reporter_id, reported_user_id, chat_message_id, message_excerpt, category, details, evidence_paths, anonymous)
  values (v_guild.id, auth.uid(), v_reported, p_chat_message_id, v_excerpt, p_category, trim(p_details), coalesce(p_evidence_paths, '{}'), coalesce(p_anonymous, false))
  returning * into v_report;

  perform public.log_guild_event(v_guild.id, case when v_report.anonymous then null else auth.uid() end,
    'report_filed', v_reported, jsonb_build_object('report_id', v_report.id, 'category', v_report.category));
  perform public.notify_guild_report_managers(v_report,
    case when p_category = 'safety' then 'Safety report in your guild' else 'New guild report' end,
    case when p_category = 'safety'
      then 'A member reported a safety concern in ' || v_guild.name || '. PartyUp admins were alerted too.'
      else 'A member reported a problem in ' || v_guild.name || '. Open the Guild tab to review it.'
    end);
  if p_category = 'safety' then
    perform public._escalate_guild_report(v_report.id, 'safety');
  end if;

  select * into v_report from public.guild_reports where id = v_report.id;
  return v_report;
end;
$$;

revoke all on function public.submit_guild_report(uuid, text, text, uuid, uuid, text[], boolean) from public, anon;
grant execute on function public.submit_guild_report(uuid, text, text, uuid, uuid, text[], boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 2e. The managers' inbox
-- ---------------------------------------------------------------------
create or replace function public.list_guild_reports(p_guild_id uuid)
returns table (
  id uuid,
  category text,
  details text,
  evidence_paths text[],
  anonymous boolean,
  status text,
  escalation_reason text,
  created_at timestamptz,
  handled_at timestamptz,
  resolution_note text,
  reporter_id uuid,
  reporter_name text,
  reported_user_id uuid,
  reported_name text,
  chat_message_id uuid,
  message_excerpt text,
  handled_by_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_guild(p_guild_id) then
    raise exception 'Only this guild''s leader can see its reports';
  end if;

  return query
  select r.id, r.category, r.details, r.evidence_paths, r.anonymous, r.status, r.escalation_reason,
    r.created_at, r.handled_at, r.resolution_note,
    case when r.anonymous then null else r.reporter_id end,
    case when r.anonymous then null else rp.display_name end,
    r.reported_user_id, tp.display_name, r.chat_message_id, r.message_excerpt, hp.display_name
  from public.guild_reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles tp on tp.id = r.reported_user_id
  left join public.profiles hp on hp.id = r.handled_by
  where r.guild_id = p_guild_id
    and r.reported_user_id is distinct from auth.uid()
  order by (r.status = 'open') desc, r.created_at desc
  limit 100;
end;
$$;

revoke all on function public.list_guild_reports(uuid) from public, anon;
grant execute on function public.list_guild_reports(uuid) to authenticated;

-- The caller's own reports, any guild.
create or replace function public.list_my_guild_reports()
returns table (
  id uuid,
  guild_name text,
  category text,
  details text,
  status text,
  escalation_reason text,
  created_at timestamptz,
  handled_at timestamptz,
  resolution_note text,
  reported_name text,
  anonymous boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, g.name, r.category, r.details, r.status, r.escalation_reason, r.created_at, r.handled_at,
    -- A leader's escalation note is meant for admins.
    case when r.status in ('resolved', 'dismissed') then r.resolution_note end,
    tp.display_name, r.anonymous
  from public.guild_reports r
  left join public.guilds g on g.id = r.guild_id
  left join public.profiles tp on tp.id = r.reported_user_id
  where r.reporter_id = auth.uid()
  order by r.created_at desc
  limit 50;
$$;

revoke all on function public.list_my_guild_reports() from public, anon;
grant execute on function public.list_my_guild_reports() to authenticated;

-- ---------------------------------------------------------------------
-- 2f. Handling
-- ---------------------------------------------------------------------
create or replace function public.resolve_guild_report(p_report_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.guild_reports;
  v_guild_name text;
begin
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'Invalid status';
  end if;

  select * into v_report from public.guild_reports where id = p_report_id for update;
  if v_report.id is null
    or not public.can_manage_guild(v_report.guild_id)
    or v_report.reported_user_id is not distinct from auth.uid() then
    raise exception 'Report not found';
  end if;
  if v_report.status <> 'open' then
    raise exception 'This report was already handled';
  end if;

  update public.guild_reports
  set status = p_status, handled_by = auth.uid(), handled_at = now(),
      resolution_note = nullif(trim(coalesce(p_note, '')), '')
  where id = v_report.id
  returning * into v_report;

  perform public.log_guild_event(v_report.guild_id, auth.uid(),
    case when p_status = 'resolved' then 'report_resolved' else 'report_dismissed' end, v_report.reported_user_id,
    jsonb_build_object('report_id', v_report.id, 'category', v_report.category));

  select name into v_guild_name from public.guilds where id = v_report.guild_id;
  perform public.notify_guild_reporter(v_report,
    case when p_status = 'resolved' then 'Your guild report was resolved' else 'Your guild report was closed' end,
    coalesce(v_guild_name, 'Your guild') || case when p_status = 'resolved'
      then ' handled your report.'
      else ' reviewed your report and closed it without action.'
    end || case when v_report.resolution_note is not null then ' Note: ' || v_report.resolution_note else '' end);
end;
$$;

revoke all on function public.resolve_guild_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_guild_report(uuid, text, text) to authenticated;

-- Leader only: hand a report to the PartyUp admins.
create or replace function public.escalate_guild_report(p_report_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.guild_reports;
begin
  select * into v_report from public.guild_reports where id = p_report_id;
  if v_report.id is null
    or not (exists (select 1 from public.guilds where id = v_report.guild_id and leader_id = auth.uid()) or public.is_admin()) then
    raise exception 'Only the Guild Leader can escalate reports';
  end if;
  if v_report.status <> 'open' then
    raise exception 'This report was already handled';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'Please keep the note under 500 characters';
  end if;

  return public._escalate_guild_report(v_report.id, 'leader', p_note);
end;
$$;

revoke all on function public.escalate_guild_report(uuid, text) from public, anon;
grant execute on function public.escalate_guild_report(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2g. Auto-escalate reports left open for 72 hours (hourly).
-- ---------------------------------------------------------------------
create or replace function public.escalate_stale_guild_reports()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    select id from public.guild_reports
    where status = 'open' and created_at < now() - interval '72 hours'
    order by created_at
  loop
    perform public._escalate_guild_report(v_id, 'timeout');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.escalate_stale_guild_reports() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'escalate-stale-guild-reports';
  perform cron.schedule('escalate-stale-guild-reports', '17 * * * *', 'select public.escalate_stale_guild_reports()');
exception when others then
  raise notice 'pg_cron unavailable, skipping schedule: %', sqlerrm;
end;
$$;

-- =====================================================================
-- 3. Reading the audit log
-- =====================================================================
create or replace function public.get_guild_audit_log(p_guild_id uuid, p_before timestamptz default null, p_limit int default 40)
returns table (
  id uuid,
  action text,
  actor_id uuid,
  actor_name text,
  target_user_id uuid,
  target_name text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_guild(p_guild_id) then
    raise exception 'Only this guild''s leader can see its audit log';
  end if;

  return query
  select e.id, e.action, e.actor_id, ap.display_name, e.target_user_id, tp.display_name, e.metadata, e.created_at
  from public.guild_audit_events e
  left join public.profiles ap on ap.id = e.actor_id
  left join public.profiles tp on tp.id = e.target_user_id
  where e.guild_id = p_guild_id
    and (p_before is null or e.created_at < p_before)
    -- Nobody sees report events about themselves.
    and not (e.action like 'report\_%' and e.target_user_id is not distinct from auth.uid())
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
end;
$$;

revoke all on function public.get_guild_audit_log(uuid, timestamptz, int) from public, anon;
grant execute on function public.get_guild_audit_log(uuid, timestamptz, int) to authenticated;

commit;
