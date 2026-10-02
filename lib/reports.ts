import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';
import * as ImageManipulator from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';

// Reasons offered when reporting a user. 'payment' is filed separately from
// the trip screen's payment section, so it isn't one of the chips.
export const REPORT_TYPES = ['safety', 'behavior', 'other'] as const;
export type ReportType = (typeof REPORT_TYPES)[number] | 'payment';

export const REPORT_TYPE_LABELS: Record<(typeof REPORT_TYPES)[number], string> = {
  safety: 'Safety concern',
  behavior: 'Inappropriate behavior',
  other: 'Other',
};

export const MAX_REPORT_EVIDENCE_PHOTOS = 5;

// Mirrors uploadVerificationImage in lib/verification.ts -- re-encoding to a
// real JPEG here (rather than trusting the source format/extension) and
// reading bytes back via the manipulator's own base64 output avoids the
// binary corruption issues that affected fetch(localUri).arrayBuffer().
// Uploads to report-evidence at `path` and returns it.
export async function uploadReportEvidence(path: string, uri: string) {
  const normalized = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  if (!normalized.base64) {
    throw new Error('Failed to process a photo.');
  }

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
      ? await Promise.all(params.evidenceUris.map((uri, index) => uploadReportEvidence(`${userId}/${Date.now()}-${index}.jpg`, uri)))
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
