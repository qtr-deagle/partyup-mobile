import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';

export type TripVisibility = 'public' | 'trusted_circle' | 'private';
export type TripStatus = 'draft' | 'open' | 'full' | 'ongoing' | 'completed' | 'cancelled';
export type MemberRole = 'member' | 'driver' | 'coordinator';
export type MemberStatus = 'pending' | 'accepted' | 'rejected' | 'left';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid';
export type PaymentMethod = 'gcash' | 'paymaya';

export type MyTrip = {
  id: string;
  title: string;
  origin: string;
  destination: string;
  start_at: string | null;
  end_at: string | null;
  status: TripStatus;
  visibility: TripVisibility;
  seats_total: number | null;
  seats_available: number | null;
  total_cost: number | null;
  price_per_person: number | null;
  rider_count: number;
  my_role: MemberRole;
  my_status: MemberStatus;
  pending_join_requests_count: number;
  created_at: string;
};

export type TripDetail = {
  id: string;
  title: string;
  origin: string;
  destination: string;
  start_at: string | null;
  end_at: string | null;
  status: TripStatus;
  visibility: TripVisibility;
  seats_total: number | null;
  seats_available: number | null;
  notes: string | null;
  total_cost: number | null;
  price_per_person: number | null;
  rider_count: number;
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
  payment_reported_at: string | null;
  payment_confirmed_at: string | null;
  joined_at: string | null;
  created_at: string;
};

export async function listMyTrips(tripType: 'carpool' | 'tour' = 'carpool') {
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
    }),
    'Creating trip'
  );
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
