import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';
import * as ImageManipulator from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';

export type DocumentType = 'passport' | 'driver_license' | 'national_id' | 'other';
export type VerificationRowStatus = 'pending' | 'approved' | 'rejected' | 'resubmitted';

export type IdVerification = {
  id: string;
  user_id: string;
  document_type: DocumentType;
  document_country: string | null;
  document_last4: string | null;
  front_image_path: string | null;
  back_image_path: string | null;
  selfie_image_path: string | null;
  status: VerificationRowStatus;
  reviewer_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  ai_similarity_score: number | null;
  ai_age_low: number | null;
  ai_age_high: number | null;
  ai_flag: 'high_confidence' | 'needs_review' | 'low_similarity' | 'error' | null;
  ai_underage_flag: boolean;
  ai_error: string | null;
};

export type PendingVerification = IdVerification & {
  display_name: string;
  avatar_url: string | null;
};

export type SubmitIdVerificationInput = {
  documentType: DocumentType;
  documentCountry?: string;
  documentLast4?: string;
  frontUri: string;
  backUri?: string;
  selfieUri: string;
};

async function uploadVerificationImage(userId: string, label: 'front' | 'back' | 'selfie', uri: string) {
  // Source photos can arrive as HEIC (iOS gallery) or other formats the
  // capture UI doesn't fully control. Re-encoding here guarantees a real
  // JPEG on disk regardless of source format or file extension, since
  // Rekognition rejects anything that isn't genuinely JPEG/PNG.
  //
  // We read the bytes back via the manipulator's own base64 output rather
  // than fetch(localUri).arrayBuffer() — React Native's Blob/URL polyfill
  // has a known history of silently corrupting binary data read that way,
  // which is what was landing broken images in Supabase Storage.
  const normalized = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  if (!normalized.base64) {
    throw new Error(`Failed to process ${label} image.`);
  }

  const path = `${userId}/${Date.now()}-${label}.jpg`;
  const bytes = toByteArray(normalized.base64);

  const { error } = await supabase.storage.from('id-verifications').upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to upload ${label} image: ${error.message}`);
  }

  return path;
}

export async function submitIdVerification(input: SubmitIdVerificationInput) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: userError ?? new Error('You must be signed in to submit a verification.') };
  }

  const userId = userData.user.id;

  try {
    const frontPath = await uploadVerificationImage(userId, 'front', input.frontUri);
    const backPath = input.backUri ? await uploadVerificationImage(userId, 'back', input.backUri) : null;
    const selfiePath = await uploadVerificationImage(userId, 'selfie', input.selfieUri);

    const { data: insertedRow, error: insertError } = await withRequestTimeout(
      supabase
        .from('id_verifications')
        .insert({
          user_id: userId,
          submitted_by: userId,
          document_type: input.documentType,
          document_country: input.documentCountry ?? null,
          document_last4: input.documentLast4 ?? null,
          front_image_path: frontPath,
          back_image_path: backPath,
          selfie_image_path: selfiePath,
          status: 'pending',
        })
        .select('id')
        .single(),
      'Submitting verification'
    );

    if (insertError) {
      return { error: insertError };
    }

    // Fire-and-forget: an advisory AI pre-check (facial similarity + age
    // estimate) runs in the background so the user isn't kept waiting on an
    // AWS round trip. Staff review is still required either way, so a
    // failure here must never surface as a submission failure.
    if (insertedRow?.id) {
      supabase.functions
        .invoke('verify-id-ai', { body: { verificationId: insertedRow.id } })
        .catch((error) => console.warn('AI verification pre-check failed to run:', error));
    }

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Failed to submit verification.') };
  }
}

// Staff/admin only -- RLS on id_verifications only lets non-staff see their
// own row, so this naturally returns nothing for a regular traveler account.
export async function listPendingVerifications() {
  let response;
  try {
    response = await withRequestTimeout(
      supabase.from('id_verifications').select('*').eq('status', 'pending').order('submitted_at', { ascending: true }),
      'Loading pending verifications'
    );
  } catch (error) {
    return { data: [] as PendingVerification[], error: error instanceof Error ? error : new Error('Unable to load pending verifications.') };
  }
  const { data, error } = response;
  if (error || !data?.length) {
    return { data: [] as PendingVerification[], error };
  }

  const rows = data as IdVerification[];
  const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const { data: profiles } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds);
  const profileById = new Map((profiles ?? []).map((row) => [row.id as string, row]));

  const merged: PendingVerification[] = rows.map((row) => ({
    ...row,
    display_name: (profileById.get(row.user_id)?.display_name as string) ?? 'Unknown traveler',
    avatar_url: (profileById.get(row.user_id)?.avatar_url as string | null) ?? null,
  }));

  return { data: merged, error: null };
}

export async function getVerificationImageUrl(path: string) {
  const { data, error } = await supabase.storage.from('id-verifications').createSignedUrl(path, 600);
  if (error || !data) {
    return null;
  }
  return data.signedUrl;
}

export async function reviewVerification(verificationId: string, decision: 'approved' | 'rejected', notes?: string) {
  return withRequestTimeout(
    supabase.rpc('review_id_verification', { p_verification_id: verificationId, p_decision: decision, p_notes: notes ?? null }),
    'Submitting review'
  );
}

export async function getMyVerification() {
  let response;
  try {
    response = await withRequestTimeout(
      supabase.from('id_verifications').select('*').order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
      'Loading verification status'
    );
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to load verification status.') };
  }
  const { data, error } = response;
  return { data: (data ?? null) as IdVerification | null, error };
}
