import { uploadReportEvidence } from '@/lib/reports';
import { withRequestTimeout } from '@/lib/social';
import { supabase } from '@/lib/supabase';

// Support tickets ("Help & Reports"). Admins answer from the website's
// Support page. See migration 202610030004_support_tickets.sql.

// Topics a traveler can pick. 'guild_leader' isn't a chip: it's preset when a
// member reports their Guild Leader from the guild screens.
export const TICKET_CATEGORIES = ['safety', 'account', 'payment', 'trip', 'bug', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number] | 'guild_leader';
export type TicketStatus = 'open' | 'answered' | 'closed';

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  safety: 'Safety or a user',
  account: 'My account',
  payment: 'Payments',
  trip: 'A trip',
  bug: 'App problem',
  other: 'Something else',
  guild_leader: 'Guild Leader',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Waiting for PartyUp',
  answered: 'PartyUp replied',
  closed: 'Closed',
};

export const MAX_TICKET_PHOTOS = 5;

export type SupportTicket = {
  id: string;
  user_id: string;
  category: TicketCategory;
  subject: string;
  status: TicketStatus;
  reported_user_id: string | null;
  guild_id: string | null;
  trip_id: string | null;
  report_id: string | null;
  evidence_paths: string[];
  user_unread: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

export type TicketMessage = {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  from_staff: boolean;
  body: string;
  created_at: string;
};

type Result<T> = { data: T; error: Error | null };

async function run<T>(request: PromiseLike<{ data: unknown; error: { message: string } | null }>, label: string, fallback: T): Promise<Result<T>> {
  try {
    const { data, error } = await withRequestTimeout(request, label);
    if (error) return { data: fallback, error: new Error(error.message) };
    return { data: (data ?? fallback) as T, error: null };
  } catch (error) {
    return { data: fallback, error: error instanceof Error ? error : new Error(`${label} failed.`) };
  }
}

export async function createSupportTicket(params: {
  category: TicketCategory;
  subject: string;
  body: string;
  reportedUserId?: string | null;
  guildId?: string | null;
  tripId?: string | null;
  evidenceUris?: string[];
}) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { data: null, error: new Error('You must be signed in to send a ticket.') };

  try {
    const stamp = Date.now();
    const evidencePaths = params.evidenceUris?.length
      ? await Promise.all(params.evidenceUris.map((uri, index) => uploadReportEvidence(`${userId}/support-${stamp}-${index}.jpg`, uri)))
      : [];

    return await run<SupportTicket | null>(
      supabase.rpc('create_support_ticket', {
        p_category: params.category,
        p_subject: params.subject.trim(),
        p_body: params.body.trim(),
        p_reported_user_id: params.reportedUserId ?? null,
        p_guild_id: params.guildId ?? null,
        p_trip_id: params.tripId ?? null,
        p_evidence_paths: evidencePaths,
      }),
      'Sending ticket',
      null
    );
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Failed to send ticket.') };
  }
}

// Newest activity first (RLS limits it to the caller's own tickets).
export async function listMyTickets() {
  return run<SupportTicket[]>(
    supabase.from('support_tickets').select('*').order('last_message_at', { ascending: false }).limit(100),
    'Loading tickets',
    []
  );
}

// For the Profile tab badge.
export async function countUnreadTickets() {
  try {
    const { count, error } = await withRequestTimeout(
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('user_unread', true),
      'Loading tickets'
    );
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

export async function getTicket(ticketId: string) {
  const [ticket, messages] = await Promise.all([
    run<SupportTicket | null>(supabase.from('support_tickets').select('*').eq('id', ticketId).maybeSingle(), 'Loading ticket', null),
    run<TicketMessage[]>(
      supabase.from('support_ticket_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true }),
      'Loading messages',
      []
    ),
  ]);
  return { ticket: ticket.data, messages: messages.data, error: ticket.error ?? messages.error };
}

export async function replyToTicket(ticketId: string, body: string) {
  return run<null>(supabase.rpc('reply_support_ticket', { p_ticket_id: ticketId, p_body: body.trim() }), 'Sending reply', null);
}

export async function closeTicket(ticketId: string) {
  return run<null>(supabase.rpc('set_support_ticket_status', { p_ticket_id: ticketId, p_status: 'closed' }), 'Closing ticket', null);
}

export async function markTicketRead(ticketId: string) {
  return run<null>(supabase.rpc('mark_support_ticket_read', { p_ticket_id: ticketId }), 'Updating ticket', null);
}

export async function getTicketPhotoUrls(paths: string[]) {
  if (paths.length === 0) return [];
  const { data } = await supabase.storage.from('report-evidence').createSignedUrls(paths, 60 * 30);
  return (data ?? []).map((row) => row.signedUrl).filter((url): url is string => !!url);
}
