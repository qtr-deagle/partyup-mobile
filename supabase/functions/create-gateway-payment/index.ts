// Supabase Edge Function: create-gateway-payment
//
// Starts a REAL (sandbox/test-mode only) PayMongo payment for a rider's
// share of a carpool/tour trip. Given { tripId, method: 'gcash' | 'paymaya' }:
//   1. Confirms the caller is an accepted rider on the trip (via their JWT).
//   2. Creates + attaches a PayMongo Payment Intent for their fare, using
//      TEST-mode secret keys only (PAYMONGO_SECRET_KEY = sk_test_...).
//   3. Marks the rider's trip_members row as payment_channel='gateway',
//      payment_status='pending' and returns PayMongo's hosted checkout URL.
//
// The PayMongo secret key is used ONLY in this function and never reaches
// the mobile app. The payment is only ever marked 'paid' by the
// paymongo-webhook function after verifying PayMongo's webhook signature --
// this function never marks a payment as paid itself.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type PaymentMethodType = 'gcash' | 'paymaya';

function paymongoAuthHeader(secretKey: string) {
  return `Basic ${btoa(`${secretKey}:`)}`;
}

async function paymongoRequest(secretKey: string, path: string, body: unknown) {
  const response = await fetch(`https://api.paymongo.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: paymongoAuthHeader(secretKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: { attributes: body } }),
  });
  const json = await response.json();
  if (!response.ok) {
    const message = json?.errors?.[0]?.detail ?? `PayMongo request to ${path} failed (${response.status})`;
    throw new Error(message);
  }
  return json;
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[create-gateway-payment] error:', message);
    return jsonResponse({ error: message }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const paymongoSecretKey = Deno.env.get('PAYMONGO_SECRET_KEY');
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);
  if (!paymongoSecretKey) return jsonResponse({ error: 'Payment gateway is not configured' }, 500);
  // Hard stop: this deployment is sandbox-only. Going live is a deliberate,
  // separate step (swap secrets + PayMongo business verification).
  if (!paymongoSecretKey.startsWith('sk_test_')) {
    return jsonResponse({ error: 'Only PayMongo test-mode keys are permitted for this function' }, 500);
  }

  // Caller's own JWT just to identify who's asking...
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: 'Invalid or expired session' }, 401);
  const callerId = userData.user.id;

  const body: { tripId?: string; method?: PaymentMethodType } = await req.json().catch(() => ({}));
  const { tripId, method } = body;
  if (!tripId || (method !== 'gcash' && method !== 'paymaya')) {
    return jsonResponse({ error: 'tripId and a valid method (gcash|paymaya) are required' }, 400);
  }

  // ...but everything else runs as service-role, since the caller's
  // membership is verified explicitly below instead of relying on RLS.
  const db = createClient(supabaseUrl, serviceRoleKey);

  const trip = await getTrip(db, tripId);
  if (!trip) return jsonResponse({ error: 'Trip not found' }, 404);

  const member = await getPayableMember(db, tripId, callerId);
  if (!member) return jsonResponse({ error: 'You are not an accepted rider on this trip' }, 403);
  if (member.payment_status === 'paid') return jsonResponse({ error: 'This trip is already paid' }, 400);

  const amount = trip.price_per_person ?? trip.total_cost;
  if (!amount || amount <= 0) return jsonResponse({ error: 'This trip does not have a cost set yet' }, 400);

  const { data: profile } = await db.from('profiles').select('display_name, email').eq('id', callerId).maybeSingle();

  try {
    const checkout = await startPaymongoCheckout(paymongoSecretKey, supabaseUrl, {
      amount,
      method,
      tripId,
      memberId: member.id,
      callerId,
      billingName: profile?.display_name,
      billingEmail: profile?.email,
    });

    await recordPendingPayment(db, { tripId, callerId, member, amount, intentId: checkout.intentId });

    return jsonResponse({ checkoutUrl: checkout.checkoutUrl, paymentIntentId: checkout.intentId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[create-gateway-payment] PayMongo error:', message);
    return jsonResponse({ error: message }, 502);
  }
}

async function getTrip(db: ReturnType<typeof createClient>, tripId: string) {
  const { data, error } = await db.from('trips').select('id, title, total_cost, price_per_person').eq('id', tripId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function getPayableMember(db: ReturnType<typeof createClient>, tripId: string, callerId: string) {
  const { data, error } = await db
    .from('trip_members')
    .select('id, payment_status, payment_channel')
    .eq('trip_id', tripId)
    .eq('user_id', callerId)
    .eq('member_role', 'member')
    .eq('status', 'accepted')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function startPaymongoCheckout(
  secretKey: string,
  supabaseUrl: string,
  opts: {
    amount: number;
    method: PaymentMethodType;
    tripId: string;
    memberId: string;
    callerId: string;
    billingName?: string | null;
    billingEmail?: string | null;
  }
) {
  const intent = await paymongoRequest(secretKey, 'payment_intents', {
    amount: Math.round(opts.amount * 100),
    currency: 'PHP',
    payment_method_allowed: [opts.method],
    payment_method_options: { [opts.method]: {} },
    capture_type: 'automatic',
    metadata: { trip_id: opts.tripId, trip_member_id: opts.memberId, user_id: opts.callerId },
  });
  const intentId: string = intent.data.id;

  const paymentMethod = await paymongoRequest(secretKey, 'payment_methods', {
    type: opts.method,
    billing: { name: opts.billingName ?? undefined, email: opts.billingEmail ?? undefined },
  });

  // PayMongo rejects custom app schemes for return_url ("return_url format is
  // invalid") -- it must be a real http(s) URL. This exact URL must match
  // what the client passes to WebBrowser.openAuthSessionAsync, which
  // intercepts navigation to it and closes the in-app browser before the
  // page itself ever has to load -- only the URL match matters, not its content.
  const returnUrl = `${supabaseUrl}/functions/v1/payment-return`;
  const attachResponse = await fetch(`https://api.paymongo.com/v1/payment_intents/${intentId}/attach`, {
    method: 'POST',
    headers: { Authorization: paymongoAuthHeader(secretKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { attributes: { payment_method: paymentMethod.data.id, return_url: returnUrl } } }),
  });
  const attachJson = await attachResponse.json();
  if (!attachResponse.ok) {
    throw new Error(attachJson?.errors?.[0]?.detail ?? `PayMongo attach failed (${attachResponse.status})`);
  }

  const checkoutUrl: string | undefined = attachJson.data?.attributes?.next_action?.redirect?.url;
  if (!checkoutUrl) throw new Error('PayMongo did not return a checkout URL');

  return { intentId, checkoutUrl };
}

async function recordPendingPayment(
  db: ReturnType<typeof createClient>,
  opts: { tripId: string; callerId: string; member: { id: string }; amount: number; intentId: string }
) {
  const { error: updateError } = await db
    .from('trip_members')
    .update({
      payment_channel: 'gateway',
      payment_intent_id: opts.intentId,
      payment_status: 'pending',
      payment_amount: opts.amount,
      payment_reported_at: new Date().toISOString(),
    })
    .eq('id', opts.member.id);
  if (updateError) throw new Error(updateError.message);

  const { error: historyError } = await db.from('payment_history').insert({
    user_id: opts.callerId,
    trip_id: opts.tripId,
    trip_member_id: opts.member.id,
    amount: opts.amount,
    currency: 'PHP',
    status: 'pending',
    gateway: 'paymongo',
    gateway_payment_intent_id: opts.intentId,
  });
  if (historyError) throw new Error(historyError.message);
}
