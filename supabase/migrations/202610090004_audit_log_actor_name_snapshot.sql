begin;

-- The Audit Log showed "System" for entries whose admin account was later
-- deleted: actor_id is ON DELETE SET NULL, and the view fell back to
-- 'System'. But no entry is ever written by the system itself:
-- audit_logs_admin_only (202610020005) drops every insert whose caller isn't
-- an admin. So a missing actor always means a deleted admin.
--
-- Fix: keep a copy of the admin's name on each entry when it's written, so it
-- survives the account being deleted. Older entries whose admin is already
-- gone show "Deleted admin" instead of the misleading "System".

alter table public.audit_logs add column if not exists actor_display_name text;

-- Fill the copy for entries whose admin still exists.
update public.audit_logs l
set actor_display_name = p.display_name
from public.profiles p
where p.id = l.actor_id and l.actor_display_name is null;

-- Snapshot the name on every new entry. Runs after audit_logs_admin_only
-- (trigger names fire alphabetically), so only kept rows get here.
create or replace function public.audit_logs_snapshot_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.actor_id is not null and new.actor_display_name is null then
    select display_name into new.actor_display_name from public.profiles where id = new.actor_id;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_logs_snapshot_actor on public.audit_logs;
create trigger audit_logs_snapshot_actor
before insert on public.audit_logs
for each row execute function public.audit_logs_snapshot_actor();

-- l.* now includes the new column, so the view is recreated rather than
-- replaced (CREATE OR REPLACE can't insert a column before existing ones).
drop view if exists public.audit_logs_view;
create view public.audit_logs_view
with (security_invoker = true)
as
select
  l.*,
  coalesce(p.display_name, l.actor_display_name, 'Deleted admin') as actor_name,
  case
    when lower(l.action) like 'rejected%' or lower(l.action) like '%sos%' then 3
    when lower(l.action) like 'resolved%'
      or lower(l.action) like 'dismissed%'
      or lower(l.action) like 'started investigating%' then 2
    else 1
  end as severity_rank
from public.audit_logs l
left join public.profiles p on p.id = l.actor_id;

revoke all on public.audit_logs_view from anon;
grant select on public.audit_logs_view to authenticated;

commit;
