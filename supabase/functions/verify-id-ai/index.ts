// Supabase Edge Function: verify-id-ai
//
// Advisory-only AI pre-check for ID verification submissions. Given a
// verification row id, it:
//   1. Confirms the caller owns that row (via their JWT).
//   2. Downloads the front-of-ID and selfie images from private storage.
//   3. Calls AWS Rekognition CompareFaces (selfie vs ID photo) for a
//      similarity score, and DetectFaces (on the ID photo) for an
//      estimated age range.
//   4. Writes ai_* columns back onto the row.
//
// It NEVER sets `status` or `profiles.verification_status` — those remain
// exclusively controlled by the staff-only review_id_verification() RPC.
// This function only produces a hint for whoever reviews the queue.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { compareFaces, detectFaceAgeRange, type AwsCredentials } from './aws-sigv4.ts';

const MAX_IMAGE_BYTES = 5_000_000; // Rekognition's limit for inline (non-S3) image bytes

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

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image is ${(bytes.length / 1_000_000).toFixed(1)}MB, over the 5MB analysis limit`);
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

type AiResult = {
  ai_similarity_score: number | null;
  ai_age_low: number | null;
  ai_age_high: number | null;
  ai_flag: 'high_confidence' | 'needs_review' | 'low_similarity' | 'error';
  ai_underage_flag: boolean;
  ai_error: string | null;
};

function flagFromSimilarity(similarity: number | null): AiResult['ai_flag'] {
  if (similarity === null) return 'error';
  if (similarity >= 90) return 'high_confidence';
  if (similarity >= 70) return 'needs_review';
  return 'low_similarity';
}

async function runAiChecks(creds: AwsCredentials, selfieBase64: string, frontBase64: string): Promise<AiResult> {
  let similarity: number | null = null;
  let ageLow: number | null = null;
  let ageHigh: number | null = null;
  const errors: string[] = [];

  try {
    const compareResult = await compareFaces(creds, selfieBase64, frontBase64);
    const matches = compareResult.FaceMatches ?? [];
    similarity = matches.length > 0 ? matches[0].Similarity : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Face match failed: ${message}`);
  }

  try {
    const detectResult = await detectFaceAgeRange(creds, frontBase64);
    const faces = detectResult.FaceDetails ?? [];
    if (faces.length > 0 && faces[0].AgeRange) {
      ageLow = faces[0].AgeRange.Low ?? null;
      ageHigh = faces[0].AgeRange.High ?? null;
    } else {
      errors.push('No face detected in ID photo for age estimation');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Age detection failed: ${message}`);
  }

  return {
    ai_similarity_score: similarity,
    ai_age_low: ageLow,
    ai_age_high: ageHigh,
    ai_flag: flagFromSimilarity(similarity),
    ai_underage_flag: ageHigh !== null && ageHigh < 18,
    ai_error: errors.length > 0 ? errors.join('; ') : null,
  };
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[verify-id-ai] UNCAUGHT top-level error:', message, error);
    return jsonResponse({ error: `Unhandled error: ${message}` }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  console.log('[verify-id-ai] checkpoint: got env + auth header');

  // Caller-context client: only used to verify who the JWT actually belongs to.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  console.log('[verify-id-ai] checkpoint: caller client created, calling auth.getUser()');
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  console.log('[verify-id-ai] checkpoint: auth.getUser() returned', { hasUser: !!userData?.user, userError: userError?.message });
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401);
  }
  const callerId = userData.user.id;

  let verificationId: string | undefined;
  try {
    const body = await req.json();
    verificationId = body.verificationId;
  } catch {
    // fall through to the missing-id check below
  }
  if (!verificationId) {
    return jsonResponse({ error: 'verificationId is required' }, 400);
  }

  console.log('[verify-id-ai] checkpoint: verificationId parsed', { verificationId });

  // Service-role client: bypasses RLS for storage download + write-back.
  // Safe because ownership is checked explicitly right below.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  console.log('[verify-id-ai] checkpoint: admin client created, fetching row', {
    serviceKeyPrefix: serviceRoleKey?.slice(0, 12),
    serviceKeyLength: serviceRoleKey?.length,
  });
  const { data: row, error: rowError } = await adminClient
    .from('id_verifications')
    .select('id, user_id, front_image_path, selfie_image_path')
    .eq('id', verificationId)
    .maybeSingle();
  console.log('[verify-id-ai] checkpoint: row fetch done', { hasRow: !!row, rowError: rowError?.message });

  if (rowError) {
    return jsonResponse({ error: rowError.message }, 500);
  }
  if (!row) {
    return jsonResponse({ error: 'Verification not found' }, 404);
  }
  if (row.user_id !== callerId) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }
  if (!row.front_image_path || !row.selfie_image_path) {
    return jsonResponse({ error: 'Verification is missing required images' }, 400);
  }

  const writeResult = async (result: AiResult) => {
    await adminClient
      .from('id_verifications')
      .update({ ...result, ai_processed_at: new Date().toISOString() })
      .eq('id', verificationId);
  };

  try {
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const region = Deno.env.get('AWS_REGION');
    if (!accessKeyId || !secretAccessKey || !region) {
      throw new Error('AWS credentials are not configured for this function');
    }
    const creds: AwsCredentials = { accessKeyId, secretAccessKey, region };
    console.log('[verify-id-ai] checkpoint: AWS creds loaded, downloading images', { region });

    const [frontBlob, selfieBlob] = await Promise.all([
      adminClient.storage.from('id-verifications').download(row.front_image_path),
      adminClient.storage.from('id-verifications').download(row.selfie_image_path),
    ]);
    console.log('[verify-id-ai] checkpoint: images downloaded', {
      frontOk: !frontBlob.error,
      selfieOk: !selfieBlob.error,
      frontSize: frontBlob.data?.size,
      selfieSize: selfieBlob.data?.size,
    });
    if (frontBlob.error || !frontBlob.data) throw new Error(`Could not download ID photo: ${frontBlob.error?.message}`);
    if (selfieBlob.error || !selfieBlob.data) throw new Error(`Could not download selfie: ${selfieBlob.error?.message}`);

    const [frontBase64, selfieBase64] = await Promise.all([
      blobToBase64(frontBlob.data),
      blobToBase64(selfieBlob.data),
    ]);
    console.log('[verify-id-ai] checkpoint: base64 encoded, calling Rekognition');

    const result = await runAiChecks(creds, selfieBase64, frontBase64);
    console.log('[verify-id-ai] checkpoint: Rekognition calls done', result);
    await writeResult(result);
    console.log('[verify-id-ai] checkpoint: DB write-back done');

    return jsonResponse({
      ai_flag: result.ai_flag,
      ai_similarity_score: result.ai_similarity_score,
      ai_underage_flag: result.ai_underage_flag,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeResult({
      ai_similarity_score: null,
      ai_age_low: null,
      ai_age_high: null,
      ai_flag: 'error',
      ai_underage_flag: false,
      ai_error: message,
    });
    return jsonResponse({ ai_flag: 'error', error: message }, 200);
  }
}
