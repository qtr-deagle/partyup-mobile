import { parseTimestamp } from '@/lib/datetime';
import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';

export type ContactRelationship = 'Parent' | 'Friend' | 'Sibling' | 'Spouse' | 'Colleague' | 'Guardian' | 'Other';

export const RELATIONSHIP_OPTIONS: ContactRelationship[] = ['Parent', 'Friend', 'Sibling', 'Spouse', 'Colleague', 'Guardian', 'Other'];

export type TrustedContactStatus = 'pending' | 'accepted' | 'declined';

export type TrustedContact = {
  id: string;
  user_id: string;
  contact_user_id: string;
  display_name: string;
  avatar_url: string | null;
  phone: string | null;
  email: string | null;
  relationship: ContactRelationship;
  emergency_info: string | null;
  alerts_enabled: boolean;
  status: TrustedContactStatus;
  created_at: string;
};

export type IncomingTrustedCircleRequest = {
  id: string;
  owner_id: string;
  display_name: string;
  avatar_url: string | null;
  relationship: ContactRelationship;
  emergency_info: string | null;
  created_at: string;
};

export async function listTrustedContacts() {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('list_trusted_contacts'), 'Loading your trusted circle');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to load your trusted circle.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as TrustedContact[], error };
}

export async function listIncomingTrustedCircleRequests() {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('list_incoming_trusted_circle_requests'), 'Loading trusted circle requests');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to load trusted circle requests.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as IncomingTrustedCircleRequest[], error };
}

export async function addTrustedContact(input: { contactUserId: string; relationship: ContactRelationship; emergencyInfo?: string }) {
  return withRequestTimeout(
    supabase.rpc('add_trusted_contact', {
      p_contact_user_id: input.contactUserId,
      p_relationship: input.relationship,
      p_emergency_info: input.emergencyInfo || null,
    }),
    'Adding emergency contact'
  );
}

export async function respondToTrustedContactRequest(contactId: string, status: 'accepted' | 'declined') {
  return withRequestTimeout(
    supabase.rpc('respond_to_trusted_contact_request', { p_contact_id: contactId, p_status: status }),
    'Updating trusted circle request'
  );
}

export async function setTrustedContactAlerts(contactId: string, enabled: boolean) {
  return withRequestTimeout(
    supabase.rpc('set_trusted_contact_alerts', { p_contact_id: contactId, p_enabled: enabled }),
    'Updating alert settings'
  );
}

export async function removeTrustedContact(contactId: string) {
  return withRequestTimeout(supabase.rpc('remove_trusted_contact', { p_contact_id: contactId }), 'Removing contact');
}

export function relationshipColors(relationship: ContactRelationship, isDark: boolean) {
  const palette: Record<ContactRelationship, { bg: string; text: string; darkBg: string; darkText: string }> = {
    Parent: { bg: 'bg-[#DCE6FF]', text: 'text-[#2647B8]', darkBg: 'bg-[#1E2E57]', darkText: 'text-[#9DB4F5]' },
    Friend: { bg: 'bg-[#F3E1FF]', text: 'text-[#8B2FD1]', darkBg: 'bg-[#2E2049]', darkText: 'text-[#CDA5F0]' },
    Sibling: { bg: 'bg-[#DCF6E3]', text: 'text-[#0F7B4B]', darkBg: 'bg-[#123625]', darkText: 'text-[#7FDDAB]' },
    Spouse: { bg: 'bg-[#FFE0E8]', text: 'text-[#C22156]', darkBg: 'bg-[#3A1B29]', darkText: 'text-[#F599B6]' },
    Colleague: { bg: 'bg-[#FFEBCF]', text: 'text-[#B4650B]', darkBg: 'bg-[#3A2A12]', darkText: 'text-[#F0B872]' },
    Guardian: { bg: 'bg-[#D6F3F2]', text: 'text-[#0B7C79]', darkBg: 'bg-[#0F2F2E]', darkText: 'text-[#7CD9D5]' },
    Other: { bg: 'bg-[#E7E9EF]', text: 'text-[#4B5468]', darkBg: 'bg-[#232B3D]', darkText: 'text-[#B7C0D4]' },
  };
  const colors = palette[relationship];
  return isDark ? { bg: colors.darkBg, text: colors.darkText } : { bg: colors.bg, text: colors.text };
}

export function formatAddedDate(value: string) {
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}
