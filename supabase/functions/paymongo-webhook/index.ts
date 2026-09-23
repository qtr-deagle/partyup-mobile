// Supabase Edge Function: paymongo-webhook
//
// Receives PayMongo webhook events (test mode only) and, once a payment is
// verified paid, marks the corresponding trip_members row as paid. This is
// the ONLY place a gateway-backed payment is ever marked 'paid' -- the
// client and create-gateway-payment never do this themselves.
//
// Security: PayMongo calls this function directly (no Supabase JWT), so
// trust comes entirely from verifying the `Paymongo-Signature` header
// against PAYMONGO_WEBHOOK_SECRET before touching the request body or the
// database. This function must have verify_jwt = false in
// supabase/config.toml, since PayMongo will never send a Supabase JWT.
//
// Idempotency: every event id is recorded in payment_webhook_events before
// any other write. A primary-key conflict means this exact event was
// already processed (PayMongo retries on non-2xx and can redeliver), so the
// handler short-circuits with 200 OK and does nothing further.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, paymongo-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyPaymongoSignature(rawBody: string, signatureHeader: string | null, webhookSecret: string): Promise<boolean> {
  if (!signatureHeader) {
    return false;
  }
  // Format: "t=<timestamp>,te=<test_signature>,li=<live_signature>". This
  // deployment is sandbox-only, so only `te` is ever checked.
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key?.trim(), value?.trim()];
    })
  );
  const timestamp = parts.t;
  const testSignature = parts.te;
  if (!timestamp || !testSignature) {
    return false;
  }
  const expected = await hmacSha256Hex(webhookSecret, `${timestamp}.${rawBody}`);
  return timingSafeEqual(expected, testSignature);
}

// PayMongo's webhook payload shape (test mode):
//   { data: { id: "evt_xxx", type: "event", attributes: { type: "payment.paid",
//     data: { id: "pay_xxx" | "pi_xxx", attributes: { payment_intent_id?: string } } } } }
// For a `payment.paid` event, `data.attributes.data` is the Payment resource
// and its `payment_intent_id` attribute is what we need. For a
// `payment_intent.succeeded` event, `data.attributes.data` IS the Payment
// Intent resource, so its own `id` is what we need.
type PaymongoWebhookPayload = {
  data?: {
    id?: string;
    attributes?: {
      type?: string;
      data?: { id?: string; attributes?: { payment_intent_id?: string } };
    };
  };
};

function getPaymentIntentId(event: PaymongoWebhookPayload, eventType: string): string | undefined {
  const resource = event.data?.attributes?.data;
  return eventType === 'payment_intent.succeeded' ? resource?.id : resource?.attributes?.payment_intent_id;
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[paymongo-webhook] error:', message);
    // Do not return 500 for an error after the event may already be durably
    // recorded -- return 200 so PayMongo doesn't retry-storm a
    // partially-processed event. Errors before the idempotency insert are
    // safe for PayMongo to retry anyway, so this is a deliberate trade-off.
    return jsonResponse({ received: true, error: message }, 200);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const webhookSecret = Deno.env.get('PAYMONGO_WEBHOOK_SECRET');
  if (!webhookSecret) return jsonResponse({ error: 'Webhook is not configured' }, 500);

  // Signature is computed over the RAW request bytes -- read as text before
  // any JSON parsing.
  const rawBody = await req.text();
  const verified = await verifyPaymongoSignature(rawBody, req.headers.get('Paymongo-Signature'), webhookSecret);
  if (!verified) return jsonResponse({ error: 'Invalid signature' }, 401);

  let event: PaymongoWebhookPayload;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const eventId = event.data?.id;
  const eventType = event.data?.attributes?.type;
  if (!eventId || !eventType) return jsonResponse({ received: true }, 200);

  const db = createClient(supabaseUrl, serviceRoleKey);

  // Idempotency gate: insert BEFORE any other mutation. A unique-violation
  // here means this exact event was already processed.
  const { error: insertEventError } = await db.from('payment_webhook_events').insert({ id: eventId, event_type: eventType, payload: event });
  if (insertEventError) {
    if (insertEventError.code === '23505') return jsonResponse({ received: true, duplicate: true }, 200);
    return jsonResponse({ error: insertEventError.message }, 500);
  }

  if (eventType !== 'payment.paid' && eventType !== 'payment_intent.succeeded') {
    return jsonResponse({ received: true }, 200);
  }

  const paymentIntentId = getPaymentIntentId(event, eventType);
  if (!paymentIntentId) return jsonResponse({ received: true }, 200);

  const member = await markMemberPaid(db, paymentIntentId);
  if (!member) return jsonResponse({ received: true }, 200);

  await notifyTripCreator(db, member);

  return jsonResponse({ received: true }, 200);
}

type PayableMember = { id: string; user_id: string; trip_id: string; payment_amount: number | null };

// Marks the trip_members row paid and returns it, or null if there was
// nothing to do (no matching row, already paid, or lost a race against
// another delivery of this or a related event).
async function markMemberPaid(db: ReturnType<typeof createClient>, paymentIntentId: string): Promise<PayableMember | null> {
  const { data: member, error: findError } = await db
    .from('trip_members')
    .select('id, user_id, trip_id, payment_amount, payment_status')
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (!member || member.payment_status === 'paid') return null;

  const { data: updated, error: updateError } = await db
    .from('trip_members')
    .update({ payment_status: 'paid', payment_confirmed_at: new Date().toISOString() })
    .eq('id', member.id)
    .neq('payment_status', 'paid')
    .select('id')
    .maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (!updated) return null;

  await db.from('payment_history').update({ status: 'paid' }).eq('gateway_payment_intent_id', paymentIntentId);

  return member;
}

async function notifyTripCreator(db: ReturnType<typeof createClient>, member: PayableMember) {
  const { data: trip } = await db.from('trips').select('title, creator_id').eq('id', member.trip_id).maybeSingle();
  if (!trip) return;

  const { data: payer } = await db.from('profiles').select('display_name').eq('id', member.user_id).maybeSingle();
  await db.from('notifications').insert({
    user_id: trip.creator_id,
    type: 'trip',
    title: 'Payment confirmed',
    message: `${payer?.display_name ?? 'A rider'}'s payment of ₱${member.payment_amount ?? 0} for "${trip.title}" was confirmed.`,
  });
}
