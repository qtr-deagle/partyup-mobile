begin;

-- Email the user whenever their ID verification changes status:
--   submitted (pending / resubmitted) -> "We received your ID"
--   approved                          -> "You're verified"
--   rejected                          -> "We couldn't verify your ID" + staff notes
--
-- Same pattern as enqueue_push (202609250007_push_dispatch.sql): the database
-- sends only the row id to the `send-verification-email` edge function, which
-- re-reads the row with the service role and picks the email from its current
-- status. It reuses the `project_url` and `push_webhook_secret` vault secrets,
-- so there is no extra database setup. The function needs BREVO_API_KEY and
-- EMAIL_SENDER_ADDRESS set as function secrets (see the function's header).

create extension if not exists pg_net;

create or replace function public.enqueue_verification_email(p_verification_id uuid)
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
    body := jsonb_build_object('id', p_verification_id)
  );
exception when others then
  -- Email is best-effort: never fail the submission or review that triggered it.
  raise warning 'enqueue_verification_email failed: %', sqlerrm;
end;
$$;

revoke all on function public.enqueue_verification_email(uuid) from public, anon, authenticated;

create or replace function public.email_verification_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Updates that don't change status (e.g. the AI pre-check filling in its
  -- columns) must not send anything.
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform public.enqueue_verification_email(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists email_verification_status on public.id_verifications;
create trigger email_verification_status
after insert or update of status on public.id_verifications
for each row execute function public.email_verification_status();

commit;
