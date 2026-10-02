import { uploadReportEvidence } from '@/lib/reports';
import { withRequestTimeout } from '@/lib/social';
import { supabase } from '@/lib/supabase';

// Guild reports (members -> Guild Leader -> admins) and the guild audit
// log. See migration 202610030002_guild_reports_audit.sql for the routing.

export const GUILD_REPORT_CATEGORIES = ['behavior', 'spam', 'safety', 'other'] as const;
export type GuildReportCategory = (typeof GUILD_REPORT_CATEGORIES)[number];

export const GUILD_REPORT_CATEGORY_LABELS: Record<GuildReportCategory, string> = {
  behavior: 'Behavior',
  spam: 'Spam or scam',
  safety: 'Safety concern',
  other: 'Other',
};

export const MAX_GUILD_REPORT_PHOTOS = 5;

export type GuildReportStatus = 'open' | 'resolved' | 'dismissed' | 'escalated';
export type EscalationReason = 'leader' | 'safety' | 'timeout';

export const ESCALATION_REASON_LABELS: Record<EscalationReason, string> = {
  leader: 'Escalated by the leader',
  safety: 'Safety report · sent to admins',
  timeout: 'Unanswered for 72h · sent to admins',
};

// A report as the Guild Leader sees it. reporter_* is null when anonymous.
export type GuildReport = {
  id: string;
  category: GuildReportCategory;
  details: string;
  evidence_paths: string[];
  anonymous: boolean;
  status: GuildReportStatus;
  escalation_reason: EscalationReason | null;
  created_at: string;
  handled_at: string | null;
  resolution_note: string | null;
  reporter_id: string | null;
  reporter_name: string | null;
  reported_user_id: string | null;
  reported_name: string | null;
  chat_message_id: string | null;
  message_excerpt: string | null;
  handled_by_name: string | null;
};

export type MyGuildReport = {
  id: string;
  guild_name: string | null;
  category: GuildReportCategory;
  details: string;
  status: GuildReportStatus;
  escalation_reason: EscalationReason | null;
  created_at: string;
  handled_at: string | null;
  resolution_note: string | null;
  reported_name: string | null;
  anonymous: boolean;
};

export type GuildAuditEvent = {
  id: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  target_user_id: string | null;
  target_name: string | null;
  metadata: Record<string, unknown>;
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

// Photos go under guild-reports/<guild_id>/ with no user id in the path, so
// an anonymous report doesn't give the reporter away.
export async function submitGuildReport(params: {
  guildId: string;
  category: GuildReportCategory;
  details: string;
  reportedUserId?: string | null;
  chatMessageId?: string | null;
  evidenceUris?: string[];
  anonymous?: boolean;
}) {
  try {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const evidencePaths = params.evidenceUris?.length
      ? await Promise.all(params.evidenceUris.map((uri, index) => uploadReportEvidence(`guild-reports/${params.guildId}/${stamp}-${index}.jpg`, uri)))
      : [];

    return await run<{ id: string; status: GuildReportStatus; escalation_reason: EscalationReason | null } | null>(
      supabase.rpc('submit_guild_report', {
        p_guild_id: params.guildId,
        p_category: params.category,
        p_details: params.details.trim(),
        p_reported_user_id: params.reportedUserId ?? null,
        p_chat_message_id: params.chatMessageId ?? null,
        p_evidence_paths: evidencePaths,
        p_anonymous: params.anonymous ?? false,
      }),
      'Submitting report',
      null
    );
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Failed to submit report.') };
  }
}

// Guild Leader (or admin) only.
export async function listGuildReports(guildId: string) {
  return run<GuildReport[]>(supabase.rpc('list_guild_reports', { p_guild_id: guildId }), 'Loading reports', []);
}

export async function listMyGuildReports() {
  return run<MyGuildReport[]>(supabase.rpc('list_my_guild_reports'), 'Loading your reports', []);
}

export async function resolveGuildReport(reportId: string, status: 'resolved' | 'dismissed', note?: string) {
  return run<null>(supabase.rpc('resolve_guild_report', { p_report_id: reportId, p_status: status, p_note: note?.trim() || null }), 'Updating report', null);
}

// Leader only. Files it in the admins' reports queue.
export async function escalateGuildReport(reportId: string, note?: string) {
  return run<string | null>(supabase.rpc('escalate_guild_report', { p_report_id: reportId, p_note: note?.trim() || null }), 'Escalating report', null);
}

// Signed URLs for the inbox's evidence thumbnails (private bucket).
export async function getGuildReportPhotoUrls(paths: string[]) {
  if (paths.length === 0) return [];
  const { data } = await supabase.storage.from('report-evidence').createSignedUrls(paths, 60 * 30);
  return (data ?? []).map((row) => row.signedUrl).filter((url): url is string => !!url);
}

export const AUDIT_PAGE_SIZE = 40;

// Newest first; pass the oldest created_at you have to load the next page.
export async function getGuildAuditLog(guildId: string, before?: string) {
  return run<GuildAuditEvent[]>(
    supabase.rpc('get_guild_audit_log', { p_guild_id: guildId, p_before: before ?? null, p_limit: AUDIT_PAGE_SIZE }),
    'Loading audit log',
    []
  );
}

const SETTING_LABELS: Record<string, string> = {
  name: 'name',
  tagline: 'tagline',
  join_policy: 'joining rule',
  min_rank: 'minimum rank',
  description: 'description',
  focus: 'focus',
  areas: 'areas',
  emblem: 'emblem',
  color: 'color',
};

// One readable sentence per event, e.g. "Ana removed Ben from the guild".
export function describeAuditEvent(event: GuildAuditEvent) {
  const actor = event.actor_name ?? (event.actor_id ? 'A former member' : 'PartyUp');
  const target = event.target_name ?? 'a member';
  const meta = event.metadata ?? {};
  const fields = Array.isArray(meta.fields) ? (meta.fields as string[]).map((field) => SETTING_LABELS[field] ?? field).join(', ') : '';
  const category = typeof meta.category === 'string' ? GUILD_REPORT_CATEGORY_LABELS[meta.category as GuildReportCategory]?.toLowerCase() : null;
  const about = event.target_user_id ? ` about ${target}` : '';

  switch (event.action) {
    case 'member_joined':
      return event.actor_id && event.actor_id !== event.target_user_id ? `${actor} added ${target} to the guild` : `${target} joined the guild`;
    case 'member_left':
      return `${target} left the guild`;
    case 'member_removed':
      return `${actor} removed ${target} from the guild`;
    case 'leadership_transferred':
      return `${target} became the Guild Leader`;
    case 'settings_changed':
      return typeof meta.new_name === 'string' && typeof meta.old_name === 'string'
        ? `${actor} renamed the guild from ${meta.old_name} to ${meta.new_name}`
        : `${actor} changed the guild's ${fields || 'settings'}`;
    case 'appearance_changed':
      return `${actor} changed the guild's ${fields || 'look'}`;
    case 'announcement_set':
      return `${actor} posted an announcement`;
    case 'announcement_cleared':
      return `${actor} removed the announcement`;
    case 'join_request_accepted':
      return `${actor} accepted ${target}'s join request`;
    case 'join_request_declined':
      return `${actor} declined ${target}'s join request`;
    case 'invite_sent':
      return `${actor} invited ${target}`;
    case 'chat_message_deleted':
      return `${actor} removed a chat message from ${target}`;
    case 'report_filed':
      return `${event.actor_id ? actor : 'Someone'} filed a ${category ?? ''} report${about}`.replace('  ', ' ');
    case 'report_resolved':
      return `${actor} resolved a report${about}`;
    case 'report_dismissed':
      return `${actor} dismissed a report${about}`;
    case 'report_escalated':
      return meta.reason === 'leader'
        ? `${actor} escalated a report${about} to admins`
        : meta.reason === 'timeout'
          ? `A report${about} was sent to admins after 72 hours`
          : `A safety report${about} was sent to admins`;
    default:
      return `${actor}: ${event.action.replace(/_/g, ' ')}`;
  }
}

// Which icon group an event belongs to, for the log's row icons.
export function auditEventKind(action: string): 'member' | 'role' | 'settings' | 'chat' | 'report' {
  if (action.startsWith('report_')) return 'report';
  if (action === 'leadership_transferred') return 'role';
  if (action === 'chat_message_deleted') return 'chat';
  if (action.startsWith('member_') || action.startsWith('join_request_') || action === 'invite_sent') return 'member';
  return 'settings';
}
