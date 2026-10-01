begin;

-- Email the user whenever their vehicle verification changes status:
--   submitted / resubmitted (-> pending) -> "We received your vehicle documents"
--   approved                             -> "Your vehicle is verified"
--   rejected                             -> "We couldn't verify your vehicle" + staff notes
--
-- Same pattern as enqueue_verification_email (202609290003_verification_emails.sql):
-- only the vehicle id goes to the `send-verification-email` edge function, with
-- kind = 'vehicle', and the function re-reads the row with the service role.
-- Reuses the `project_url` and `push_webhook_secret` vault secrets and the
-- function's BREVO_API_KEY / EMAIL_SENDER_ADDRESS secrets.

create extension if not exists pg_net;

create or replace function public.enqueue_vehicle_verification_email(p_vehicle_id uuid)
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
    url := rtrim(v_url, '/') || '/functions/v1/send-verification-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('id', p_vehicle_id, 'kind', 'vehicle')
  );
exception when others then
  -- Email is best-effort: never fail the submission or review that triggered it.
  raise warning 'enqueue_vehicle_verification_email failed: %', sqlerrm;
end;
$$;

revoke all on function public.enqueue_vehicle_verification_email(uuid) from public, anon, authenticated;

create or replace function public.email_vehicle_verification_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only real status changes into a state worth emailing about. New vehicles
  -- start 'unverified' and edits that reset to 'unverified' send nothing.
  if new.verification_status is distinct from old.verification_status
     and new.verification_status in ('pending', 'approved', 'rejected') then
    perform public.enqueue_vehicle_verification_email(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists email_vehicle_verification_status on public.vehicles;
create trigger email_vehicle_verification_status
after update of verification_status on public.vehicles
for each row execute function public.email_vehicle_verification_status();

commit;
