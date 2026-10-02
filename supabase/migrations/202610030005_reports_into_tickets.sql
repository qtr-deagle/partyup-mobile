begin;

-- One inbox for admins: every report is also a support ticket.
--
-- public.reports stays the record admins act on (resolve / dismiss, guild
-- points for reviewers, payment issues, dashboard counts). What changes:
--   * a new report opens a support ticket for the reporter, with the report's
--     details as the first message (report_to_ticket trigger)
--   * when admins investigate, resolve or dismiss a report, the reporter gets
--     a reply in that ticket and a notification (report_status_to_ticket)
--   * existing reports get their tickets backfilled below, without
--     notifications
-- The website's Support page shows report tickets under its Reports tab and
-- runs the report actions there; /admin/reports redirects to it.
--
-- Guild Leader tickets (create_support_ticket) file their own report and set
-- partyup.skip_report_ticket so no second ticket is opened.

-- ---------------------------------------------------------------------
-- 1. Building a report's ticket
-- ---------------------------------------------------------------------
create or replace function public._ticket_for_report(p_report public.reports, p_backfill boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id uuid;
  v_reported_name text;
  v_trip_title text;
  v_guild_name text;
  v_subject text;
  v_body text := left(coalesce(nullif(btrim(p_report.details), ''), '(No details given)'), 2000);
begin
  if exists (select 1 from public.support_tickets where report_id = p_report.id) then
    return null;
  end if;

  select display_name into v_reported_name from public.profiles where id = p_report.reported_user_id;
  select title into v_trip_title from public.trips where id = p_report.trip_id;
  select name into v_guild_name from public.guilds where id = p_report.guild_id;

  v_subject := left(case
    when p_report.guild_report_id is not null then 'Guild report' || coalesce(' from ' || v_guild_name, '')
    when p_report.report_type = 'payment' then 'Payment issue' || coalesce(': ' || v_trip_title, '')
    when v_reported_name is not null then 'Report about ' || v_reported_name
    when v_trip_title is not null then 'Report about the trip ' || v_trip_title
    else 'Report'
  end, 120);

  insert into public.support_tickets (
    user_id, category, subject, status, reported_user_id, guild_id, trip_id, report_id, evidence_paths,
    created_at, updated_at, last_message_at
  )
  values (
    p_report.reporter_id,
    case p_report.report_type when 'payment' then 'payment' when 'safety' then 'safety' when 'behavior' then 'safety' else 'other' end,
    v_subject,
    case p_report.status when 'resolved' then 'closed' when 'dismissed' then 'closed' when 'reviewing' then 'answered' else 'open' end,
    p_report.reported_user_id, p_report.guild_id, p_report.trip_id, p_report.id, coalesce(p_report.evidence_paths, '{}'),
    p_report.created_at, p_report.created_at, coalesce(case when p_backfill then p_report.reviewed_at end, p_report.created_at)
  )
  returning id into v_ticket_id;

  insert into public.support_ticket_messages (ticket_id, sender_id, from_staff, body, created_at)
  values (v_ticket_id, p_report.reporter_id, false, v_body, p_report.created_at);

  -- Old reports that were already handled carry the outcome over.
  if p_backfill and p_report.status in ('resolved', 'dismissed') then
    insert into public.support_ticket_messages (ticket_id, sender_id, from_staff, body, created_at)
    values (v_ticket_id, p_report.reviewed_by, true,
      left(case when p_report.status = 'resolved'
          then 'We reviewed your report and took action.'
          else 'We reviewed your report and closed it without action.'
        end || coalesce(E'\n\n' || nullif(btrim(p_report.resolution_notes), ''), ''), 2000),
      coalesce(p_report.reviewed_at, p_report.updated_at));
  end if;

  return v_ticket_id;
end;
$$;

revoke all on function public._ticket_for_report(public.reports, boolean) from public, anon, authenticated;

create or replace function public.report_to_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('partyup.skip_report_ticket', true) = 'on' then
    return null;
  end if;
  perform public._ticket_for_report(new);
  return null;
end;
$$;

revoke all on function public.report_to_ticket() from public, anon, authenticated;

drop trigger if exists report_to_ticket on public.reports;
create trigger report_to_ticket
  after insert on public.reports
  for each row execute function public.report_to_ticket();

-- ---------------------------------------------------------------------
-- 2. Report decisions reach the reporter as replies
-- ---------------------------------------------------------------------
create or replace function public.report_status_to_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
  v_message text;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  select * into v_ticket from public.support_tickets where report_id = new.id;
  if v_ticket.id is null then
    return null;
  end if;

  v_message := case new.status
    when 'reviewing' then 'We''re looking into your report. We''ll update you here.'
    when 'resolved' then 'We reviewed your report and took action. Thanks for helping keep PartyUp safe.'
    when 'dismissed' then 'We reviewed your report and didn''t find a rule was broken, so we closed it.'
  end;
  if v_message is null then
    return null;
  end if;
  if new.status in ('resolved', 'dismissed') and nullif(btrim(new.resolution_notes), '') is not null then
    v_message := v_message || E'\n\n' || btrim(new.resolution_notes);
  end if;

  insert into public.support_ticket_messages (ticket_id, sender_id, from_staff, body)
  values (v_ticket.id, coalesce(new.reviewed_by, auth.uid()), true, left(v_message, 2000));

  update public.support_tickets
  set status = case when new.status in ('resolved', 'dismissed') then 'closed' else 'answered' end,
      user_unread = true,
      last_message_at = now(),
      updated_at = now()
  where id = v_ticket.id;

  insert into public.notifications (user_id, type, title, message, data)
  values (v_ticket.user_id, 'system',
    case new.status when 'reviewing' then 'We''re looking into your report' else 'Update on your report' end,
    'PartyUp support replied on "' || v_ticket.subject || '".',
    jsonb_build_object('route', '/support/' || v_ticket.id, 'ticket_id', v_ticket.id));

  return null;
end;
$$;

revoke all on function public.report_status_to_ticket() from public, anon, authenticated;

drop trigger if exists report_status_to_ticket on public.reports;
create trigger report_status_to_ticket
  after update of status on public.reports
  for each row execute function public.report_status_to_ticket();

-- ---------------------------------------------------------------------
-- 3. Backfill tickets for existing reports (no notifications)
-- ---------------------------------------------------------------------
do $$
declare
  v_report public.reports;
begin
  for v_report in
    select r.* from public.reports r
    where not exists (select 1 from public.support_tickets t where t.report_id = r.id)
    order by r.created_at
  loop
    perform public._ticket_for_report(v_report, true);
  end loop;
end $$;

commit;
