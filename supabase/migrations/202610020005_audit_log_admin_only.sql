-- =====================================================================
-- Audit log is admin-only: it records admin actions, and only admins can
-- read it (select/insert RLS already uses is_staff_or_admin(), which is
-- admin-only since 202610010006).
--
-- Two security-definer RPCs callable by Guild Leaders still wrote rows
-- (delete_guild_chat_message, transfer_guild_leadership). Rather than
-- redefining them, a trigger drops any insert whose caller isn't an admin,
-- so future leader-callable RPCs can't leak rows in either. The check runs
-- at insert time, so an admin's past entries survive a later demotion.
-- =====================================================================
create or replace function public.audit_logs_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_logs_admin_only on public.audit_logs;
create trigger audit_logs_admin_only
before insert on public.audit_logs
for each row execute function public.audit_logs_admin_only();

-- Clear the leader-originated rows already written.
delete from public.audit_logs
where action in ('Deleted guild chat message', 'Handed over guild leadership');
