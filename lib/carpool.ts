import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';

export type TripType = 'carpool' | 'tour';
export type TripVisibility = 'public' | 'trusted_circle' | 'private';
export type TripStatus = 'draft' | 'open' | 'full' | 'ongoing' | 'completed' | 'cancelled';
export type MemberRole = 'member' | 'driver' | 'coordinator';
export type MemberStatus = 'pending' | 'accepted' | 'rejected' | 'left';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid';
export type PaymentMethod = 'gcash' | 'paymaya';
export type PaymentChannel = 'manual' | 'gateway';

export type MyTrip = {
  id: string;
  title: string;
  origin: string;
  destination: string;
  start_at: string | null;
  end_at: string | null;
  duration_days: number | null;
  status: TripStatus;
  visibility: TripVisibility;
  seats_total: number | null;
  seats_available: number | null;
  total_cost: number | null;
  price_per_person: number | null;
  interest_tags: string[];
  rider_count: number;
  my_role: MemberRole;
  my_status: MemberStatus;
  pending_join_requests_count: number;
  organizer_id: string;
  organizer_display_name: string;
  organizer_avatar_url: string | null;
  organizer_verified: boolean;
  is_favorited: boolean;
  created_at: string;
};

export type TripDetail = {
  id: string;
  title: string;
  trip_type: TripType;
  origin: string;
  destination: string;
  start_at: string | null;
  end_at: string | null;
  duration_days: number | null;
  status: TripStatus;
  visibility: TripVisibility;
  seats_total: number | null;
  seats_available: number | null;
  notes: string | null;
  total_cost: number | null;
  price_per_person: number | null;
  rider_count: number;
  interest_tags: string[];
  invite_code: string;
  driver_id: string;
  driver_display_name: string;
  driver_avatar_url: string | null;
  driver_gcash_handle: string | null;
  driver_paymaya_handle: string | null;
  is_driver: boolean;
  my_status: MemberStatus | null;
  my_payment_status: PaymentStatus | null;
  my_payment_amount: number | null;
  my_payment_channel: PaymentChannel | null;
  my_invited_by_display_name: string | null;
};

export type TripMember = {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  member_role: MemberRole;
  status: MemberStatus;
  invited_by_user_id: string | null;
  invited_by_display_name: string | null;
  payment_status: PaymentStatus;
  payment_amount: number | null;
  payment_reference: string | null;
  payment_channel: PaymentChannel;
  payment_intent_id: string | null;
  payment_reported_at: string | null;
  payment_confirmed_at: string | null;
  joined_at: string | null;
  created_at: string;
};

export async function listMyTrips(tripType: TripType = 'carpool') {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('list_my_trips', { p_trip_type: tripType }), 'Loading your trips');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to load your trips.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as MyTrip[], error };
}

export async function createTrip(input: {
  title: string;
  origin: string;
  destination: string;
  startAt?: string | null;
  endAt?: string | null;
  visibility?: TripVisibility;
  seatsTotal?: number | null;
  totalCost?: number | null;
  notes?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  tripType?: TripType;
  pricePerPerson?: number | null;
  durationDays?: number | null;
  interests?: string[];
  itinerary?: { dayNumber: number; description: string }[];
  vehicleId?: string | null;
}) {
  return withRequestTimeout(
    supabase.rpc('create_trip', {
      p_title: input.title,
      p_origin: input.origin,
      p_destination: input.destination,
      p_start_at: input.startAt ?? null,
      p_end_at: input.endAt ?? null,
      p_visibility: input.visibility ?? 'public',
      p_seats_total: input.seatsTotal ?? null,
      p_total_cost: input.totalCost ?? null,
      p_notes: input.notes ?? null,
      p_destination_lat: input.destinationLat ?? null,
      p_destination_lng: input.destinationLng ?? null,
      p_trip_type: input.tripType ?? 'carpool',
      p_price_per_person: input.pricePerPerson ?? null,
      p_duration_days: input.durationDays ?? null,
      p_interests: input.interests ?? [],
      p_itinerary: (input.itinerary ?? []).map((day) => ({ day_number: day.dayNumber, description: day.description })),
      p_vehicle_id: input.vehicleId ?? null,
    }),
    'Creating trip'
  );
}

export async function startTrip(tripId: string) {
  return withRequestTimeout(supabase.rpc('start_trip', { p_trip_id: tripId }), 'Starting trip');
}

export async function completeTrip(tripId: string) {
  return withRequestTimeout(supabase.rpc('complete_trip', { p_trip_id: tripId }), 'Completing trip');
}

export async function getTripDetail(tripId: string) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('get_trip_detail', { p_trip_id: tripId }), 'Loading trip');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to load trip.') };
  }
  const { data, error } = response;
  if (error) {
    return { data: null, error };
  }
  const rows = (data ?? []) as TripDetail[];
  return { data: rows[0] ?? null, error: null };
}

export async function listTripMembers(tripId: string) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('list_trip_members', { p_trip_id: tripId }), 'Loading trip members');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to load trip members.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as TripMember[], error };
}

export async function getTripInviteLink(tripId: string) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('get_trip_invite_link', { p_trip_id: tripId }), 'Getting invite link');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to get invite link.') };
  }
  const { data, error } = response;
  if (error) {
    return { data: null, error };
  }
  const rows = (data ?? []) as { trip_id: string; invite_code: string; trip_title: string }[];
  return { data: rows[0] ?? null, error: null };
}

export async function joinTripViaInvite(inviteCode: string, referrerUserId?: string | null) {
  let response;
  try {
    response = await withRequestTimeout(
      supabase.rpc('join_trip_via_invite', { p_invite_code: inviteCode, p_referrer_user_id: referrerUserId ?? null }),
      'Joining trip'
    );
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to join trip.') };
  }
  const { data, error } = response;
  if (error) {
    return { data: null, error };
  }
  const rows = (data ?? []) as { trip_id: string; member_status: MemberStatus }[];
  return { data: rows[0] ?? null, error: null };
}

export async function respondToJoinRequest(tripMemberId: string, status: 'accepted' | 'rejected') {
  return withRequestTimeout(supabase.rpc('respond_to_join_request', { p_trip_member_id: tripMemberId, p_status: status }), 'Updating join request');
}

export async function leaveTrip(tripId: string) {
  return withRequestTimeout(supabase.rpc('leave_trip', { p_trip_id: tripId }), 'Leaving trip');
}

export async function cancelTrip(tripId: string) {
  return withRequestTimeout(supabase.rpc('cancel_trip', { p_trip_id: tripId }), 'Cancelling trip');
}

export async function reportPayment(tripId: string, reference?: string) {
  return withRequestTimeout(supabase.rpc('report_payment', { p_trip_id: tripId, p_reference: reference ?? null }), 'Reporting payment');
}

export async function confirmPaymentReceived(tripMemberId: string) {
  return withRequestTimeout(supabase.rpc('confirm_payment_received', { p_trip_member_id: tripMemberId }), 'Confirming payment');
}

// supabase-js's FunctionsHttpError only exposes a generic "Edge Function
// returned a non-2xx status code" message -- the function's actual JSON
// error body is on error.context (a Response). Unwrap it so the real reason
// (bad request, PayMongo rejection, etc.) reaches the user/logs instead.
async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.clone().json();
      if (body?.error) {
        return String(body.error);
      }
    } catch {
      // Response body wasn't JSON -- fall through to the generic message.
    }
  }
  return error instanceof Error ? error.message : fallback;
}

// Starts a real (sandbox/test-mode only) PayMongo payment for the caller's
// share of the trip and returns PayMongo's hosted checkout URL to open in
// an in-app browser. The payment is only marked 'paid' once the
// paymongo-webhook Edge Function verifies PayMongo's webhook signature --
// this call itself only moves the rider to 'pending'.
export async function startGatewayPayment(tripId: string, method: PaymentMethod) {
  try {
    const { data, error } = await withRequestTimeout(
      supabase.functions.invoke('create-gateway-payment', { body: { tripId, method } }),
      'Starting payment'
    );
    if (error) {
      const message = await extractFunctionErrorMessage(error, 'Unable to start payment.');
      return { data: null, error: new Error(message) };
    }
    return { data: data as { checkoutUrl: string; paymentIntentId: string }, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to start payment.') };
  }
}

export function buildInviteUrl(inviteCode: string, referrerUserId: string) {
  return `partyupmobile://trip/join/${inviteCode}?ref=${referrerUserId}`;
}

export function formatCurrency(amount: number | null | undefined, currency = 'PHP') {
  if (amount === null || amount === undefined) {
    return '—';
  }
  const symbol = currency === 'PHP' ? '₱' : `${currency} `;
  return `${symbol}${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function paymentStatusColors(status: PaymentStatus, isDark: boolean) {
  const palette: Record<PaymentStatus, { bg: string; text: string; darkBg: string; darkText: string }> = {
    unpaid: { bg: 'bg-[#F3E1FF]', text: 'text-[#8B2FD1]', darkBg: 'bg-[#2E2049]', darkText: 'text-[#CDA5F0]' },
    pending: { bg: 'bg-[#FFEBCF]', text: 'text-[#B4650B]', darkBg: 'bg-[#3A2A12]', darkText: 'text-[#F0B872]' },
    paid: { bg: 'bg-[#DCF6E3]', text: 'text-[#0F7B4B]', darkBg: 'bg-[#123625]', darkText: 'text-[#7FDDAB]' },
  };
  const colors = palette[status];
  return isDark ? { bg: colors.darkBg, text: colors.darkText } : { bg: colors.bg, text: colors.text };
}
