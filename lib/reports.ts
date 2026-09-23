import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';
import * as ImageManipulator from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';

export const REPORT_TYPES = ['safety', 'behavior', 'other'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  safety: 'Safety concern',
  behavior: 'Inappropriate behavior',
  other: 'Other',
};

export const MAX_REPORT_EVIDENCE_PHOTOS = 5;

// Mirrors uploadVerificationImage in lib/verification.ts -- re-encoding to a
// real JPEG here (rather than trusting the source format/extension) and
// reading bytes back via the manipulator's own base64 output avoids the
// binary corruption issues that affected fetch(localUri).arrayBuffer().
async function uploadReportEvidenceImage(userId: string, index: number, uri: string) {
  const normalized = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  if (!normalized.base64) {
    throw new Error('Failed to process a photo.');
  }

  const path = `${userId}/${Date.now()}-${index}.jpg`;
  const bytes = toByteArray(normalized.base64);

  const { error } = await supabase.storage.from('report-evidence').upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to upload photo: ${error.message}`);
  }

  return path;
}

export async function submitReport(params: {
  reportedUserId?: string;
  tripId?: string;
  reportType: ReportType;
  details: string;
  evidenceUris?: string[];
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { data: null, error: userError ?? new Error('You must be signed in to submit a report.') };
  }
  const userId = userData.user.id;

  try {
    const evidencePaths = params.evidenceUris?.length
      ? await Promise.all(params.evidenceUris.map((uri, index) => uploadReportEvidenceImage(userId, index, uri)))
      : [];

    return await withRequestTimeout(
      supabase.rpc('submit_report', {
        p_reported_user_id: params.reportedUserId ?? null,
        p_trip_id: params.tripId ?? null,
        p_report_type: params.reportType,
        p_details: params.details.trim(),
        p_evidence_paths: evidencePaths,
      }),
      'Submitting report'
    );
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Failed to submit report.') };
  }
}
