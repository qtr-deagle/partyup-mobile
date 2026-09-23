begin;

-- Distinguishes a manually self-reported payment (existing report_payment()/
-- confirm_payment_received() flow) from one verified server-side by a real
-- (sandbox-mode) PayMongo webhook. The manual flow keeps working unchanged;
-- 'gateway' is only ever set/flipped by Edge Functions using the service
-- role key -- never by the authenticated-user RPCs.
alter table public.trip_members
  add column if not exists payment_channel text not null default 'manual'
    check (payment_channel in ('manual', 'gateway')),
  add column if not exists payment_intent_id text;

create unique index if not exists trip_members_payment_intent_id_idx
  on public.trip_members(payment_intent_id) where payment_intent_id is not null;

alter table public.payment_history
  add column if not exists gateway text not null default 'manual'
    check (gateway in ('manual', 'paymongo')),
  add column if not exists gateway_payment_intent_id text;

-- Idempotency ledger for PayMongo webhook deliveries. PayMongo retries on
-- non-2xx responses and can redeliver; the webhook Edge Function inserts the
-- event id here BEFORE doing any state mutation. A primary-key conflict
-- means this exact event was already processed, so the handler short-
-- circuits with 200 OK and does nothing else. Only the webhook Edge
-- Function (service-role client) ever touches this table -- no RLS grants
-- to authenticated/anon.
create table if not exists public.payment_webhook_events (
  id text primary key, -- PayMongo event id, e.g. "evt_xxx"
  event_type text not null,
  trip_member_id uuid references public.trip_members(id) on delete set null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

alter table public.payment_webhook_events enable row level security;

commit;
