// Supabase Edge Function: verify-vehicle-ai
//
// Advisory-only AI pre-check for vehicle verification submissions. Given a
// vehicle id, it:
//   1. Confirms the caller owns that vehicle (via their JWT).
//   2. Downloads the plate photo and OR/CR (plus the owner's ID for borrowed
//      vehicles) from private storage.
//   3. Runs AWS Rekognition DetectText on them and checks that
//        - the plate photo shows the declared plate number,
//        - the OR/CR lists the same plate number,
//        - the OR/CR owner is the submitter (their legal name), or for a
//          borrowed vehicle, the person on the owner's ID.
//   4. Writes ai_* columns back onto the vehicle row.
//
// It NEVER sets verification_status -- that stays with the admin-only
// review_vehicle_verification() RPC. This is a hint for the reviewer.
//
// Called with { license: true } instead, it checks the caller's driver's
// license (driver_licenses row): name vs their legal name, expiry date, and
// LTO restriction codes, and the QR on the back (scanned live by the app)
// against the printed card. The parsed expiry IS enforced (carpool creation
// needs an unexpired license); the rest is advisory.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { detectText, type AwsCredentials } from '../verify-id-ai/aws-sigv4.ts';

const MAX_IMAGE_BYTES = 5_000_000; // Rekognition's limit for inline image bytes

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

type AiFlag = 'passed' | 'needs_review' | 'mismatch' | 'error';

type AiResult = {
  ai_plate_detected: string | null;
  ai_plate_match: boolean | null;
  ai_orcr_plate_match: boolean | null;
  ai_owner_match: boolean | null;
  ai_flag: AiFlag;
  ai_error: string | null;
};

// "abc-1234 " -> "ABC1234"
function normalizePlate(value: string | null | undefined) {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Uppercase, accents stripped, letters/digits/spaces only.
function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// PH plates: cars "ABC 1234" / older "ABC 123", motorcycles "123 ABC",
// "AB 12345" and similar. Matches spaced or dashed forms too.
const PLATE_PATTERN = /\b([A-Z]{1,3})[\s-]?(\d{3,5})\b|\b(\d{3,4})[\s-]?([A-Z]{2,3})\b/g;

function plateCandidates(lines: string[]) {
  const found = new Set<string>();
  for (const line of lines) {
    const upper = line.toUpperCase();
    for (const match of upper.matchAll(PLATE_PATTERN)) {
      found.add(normalizePlate(match[0]));
    }
  }
  return [...found];
}

async function readLines(creds: AwsCredentials, imageBase64: string) {
  const result = await detectText(creds, imageBase64);
  return (result.TextDetections ?? [])
    .filter((detection: { Type?: string }) => detection.Type === 'LINE')
    .map((detection: { DetectedText?: string }) => detection.DetectedText ?? '') as string[];
}

// Words that appear on most IDs / OR/CRs and say nothing about who owns them.
const COMMON_WORDS = new Set([
  'REPUBLIC', 'PHILIPPINES', 'PILIPINAS', 'REPUBLIKA', 'LAND', 'TRANSPORTATION', 'OFFICE', 'DEPARTMENT',
  'CERTIFICATE', 'REGISTRATION', 'OFFICIAL', 'RECEIPT', 'OWNER', 'NAME', 'ADDRESS', 'DRIVER', 'LICENSE',
  'CARD', 'NATIONAL', 'IDENTIFICATION', 'BULACAN', 'CITY', 'PROVINCE', 'BARANGAY', 'STREET', 'MOTOR',
  'VEHICLE', 'PLATE', 'NUMBER', 'DATE', 'BIRTH', 'SEX', 'MALE', 'FEMALE', 'VALID', 'UNTIL', 'EXPIRATION',
]);

function distinctiveWords(lines: string[]) {
  return new Set(
    normalizeText(lines.join(' '))
      .split(' ')
      .filter((word) => word.length >= 3 && /^[A-Z]+$/.test(word) && !COMMON_WORDS.has(word))
  );
}

// The OR/CR owner is the submitter when both their first and last name
// appear on it.
function ownerIsSubmitter(orcrLines: string[], firstName: string | null, lastName: string | null) {
  if (!firstName || !lastName) return null;
  const text = ` ${normalizeText(orcrLines.join(' '))} `;
  const first = normalizeText(firstName).split(' ')[0];
  const last = normalizeText(lastName);
  if (!first || !last) return null;
  return text.includes(` ${first} `) && text.includes(` ${last} `);
}

// Borrowed vehicle: the OR/CR owner should be the person on the owner's ID,
// so at least two distinctive name words must appear on both.
function ownerMatchesOwnerId(orcrLines: string[], ownerIdLines: string[]) {
  if (!ownerIdLines.length) return null;
  const orcrWords = distinctiveWords(orcrLines);
  let shared = 0;
  for (const word of distinctiveWords(ownerIdLines)) {
    if (orcrWords.has(word)) shared += 1;
  }
  return shared >= 2;
}

function decideFlag(result: Omit<AiResult, 'ai_flag' | 'ai_error'>, declaredPlate: string): AiFlag {
  const plateReadButDifferent = !!result.ai_plate_detected && !!declaredPlate && result.ai_plate_match === false;
  if (plateReadButDifferent || result.ai_orcr_plate_match === false || result.ai_owner_match === false) {
    return 'mismatch';
  }
  if (result.ai_plate_match && result.ai_orcr_plate_match && result.ai_owner_match) {
    return 'passed';
  }
  return 'needs_review';
}

// ---------------------------------------------------------------------
// Driver's license
// ---------------------------------------------------------------------
type LicenseResult = {
  ai_name_match: boolean | null;
  ai_qr_match: boolean | null;
  license_number: string | null;
  expiry_date: string | null;
  restriction_codes: string[];
  ai_flag: AiFlag;
  ai_error: string | null;
};

// LTO license numbers look like "N01-23-456789" (letter, 2, 2, 6 digits).
const LICENSE_NUMBER_PATTERN = /\b([A-Z]\d{2})[\s-]?(\d{2})[\s-]?(\d{6})\b/;

function findLicenseNumber(text: string) {
  const match = text.toUpperCase().match(LICENSE_NUMBER_PATTERN);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

// Every QR check that could run must pass; null when none could run.
function combineChecks(checks: (boolean | null)[]) {
  const ran = checks.filter((check): check is boolean => check !== null);
  return ran.length ? ran.every(Boolean) : null;
}

function toIsoDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// LTO licenses print dates as YYYY/MM/DD; older cards use MM/DD/YYYY. The
// expiration is the latest date on the card (birth and issue dates are
// earlier), so take the max.
function parseExpiry(lines: string[]) {
  const dates: string[] = [];
  const text = lines.join(' ');
  for (const match of text.matchAll(/\b(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})\b/g)) {
    const iso = toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (iso) dates.push(iso);
  }
  for (const match of text.matchAll(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/g)) {
    const iso = toIsoDate(Number(match[3]), Number(match[1]), Number(match[2]));
    if (iso) dates.push(iso);
  }
  return dates.length ? dates.sort()[dates.length - 1] : null;
}

// Current LTO codes (A, A1, B, B1, B2, BE, C, CE, D) and the old numeric
// restriction codes (1-8), read from the line(s) that mention restrictions
// or DL codes.
const LTO_CODES = ['A', 'A1', 'B', 'B1', 'B2', 'BE', 'C', 'CE', 'D'];

function parseRestrictionCodes(lines: string[]) {
  const codes = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const upper = line.toUpperCase();
    if (!/RESTRICTION|CODE/.test(upper)) continue;
    // Codes may sit on the same line or the next one.
    const window = `${upper} ${(lines[index + 1] ?? '').toUpperCase()}`;
    for (const token of window.split(/[^A-Z0-9]+/)) {
      if (LTO_CODES.includes(token) || /^[1-8]$/.test(token)) codes.add(token);
    }
  }
  return [...codes].sort();
}

// B-family codes, or the old light-vehicle codes 2/3 (1 alone is motorcycle only).
function allowsCar(codes: string[]) {
  return codes.some((code) => ['B', 'B1', 'B2', 'BE', '2', '3'].includes(code));
}

function loadAwsCreds(): AwsCredentials {
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  const region = Deno.env.get('AWS_REGION');
  if (!accessKeyId || !secretAccessKey || !region) {
    throw new Error('AWS credentials are not configured for this function');
  }
  return { accessKeyId, secretAccessKey, region };
}

async function checkLicense(adminClient: ReturnType<typeof createClient>, creds: AwsCredentials, userId: string): Promise<LicenseResult> {
  const { data: license, error } = await adminClient
    .from('driver_licenses')
    .select('user_id, source, front_image_path, back_image_path, qr_data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!license) throw new Error("No driver's license on file");

  // Reused licenses live with the ID verification photos.
  const bucket = adminClient.storage.from(license.source === 'id_verification' ? 'id-verifications' : 'vehicle-verifications');
  const [front, back, profile] = await Promise.all([
    bucket.download(license.front_image_path),
    license.back_image_path ? bucket.download(license.back_image_path) : null,
    adminClient.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle(),
  ]);
  if (front.error || !front.data) throw new Error(`Could not download license photo: ${front.error?.message}`);

  const frontLines = await blobToBase64(front.data).then((image) => readLines(creds, image));
  const backLines = back?.data ? await blobToBase64(back.data).then((image) => readLines(creds, image)) : [];
  const lines = [...frontLines, ...backLines];

  const firstName = profile.data?.first_name ?? null;
  const lastName = profile.data?.last_name ?? null;
  const nameMatch = ownerIsSubmitter(frontLines, firstName, lastName);
  const cardExpiry = parseExpiry(lines);
  const codes = parseRestrictionCodes(lines);
  const today = new Date().toISOString().slice(0, 10);

  // QR vs card: the QR's license number must be printed on the card, the
  // QR's name must be the driver, and the QR's expiry must equal the card's.
  // A photo edited after the fact (name, expiry) or another person's QR
  // fails one of these.
  const qr = (license.qr_data as string | null) ?? '';
  const qrNumber = qr ? findLicenseNumber(qr) : null;
  const cardNumber = findLicenseNumber(lines.join(' '));
  const cardText = normalizePlate(lines.join(' '));
  const numberMatch = qrNumber ? (cardNumber ? qrNumber === cardNumber : cardText.includes(normalizePlate(qrNumber))) : null;
  const qrNameMatch = qr ? ownerIsSubmitter([qr], firstName, lastName) : null;
  const qrExpiry = qr ? parseExpiry([qr]) : null;
  const expiryMatch = qrExpiry && cardExpiry ? qrExpiry === cardExpiry : null;
  const qrMatch = qr ? combineChecks([numberMatch, qrNameMatch, expiryMatch]) : null;

  // The card's printed date wins; the QR's fills in when the photo is unreadable.
  const expiry = cardExpiry ?? qrExpiry;

  let flag: AiFlag = 'needs_review';
  if (nameMatch === false || qrMatch === false || (expiry && expiry < today)) flag = 'mismatch';
  else if (nameMatch && qrMatch && expiry && allowsCar(codes)) flag = 'passed';

  return {
    ai_name_match: nameMatch,
    ai_qr_match: qrMatch,
    license_number: qrNumber ?? cardNumber,
    expiry_date: expiry,
    restriction_codes: codes,
    ai_flag: flag,
    ai_error: null,
  };
}

async function handleLicenseRequest(adminClient: ReturnType<typeof createClient>, userId: string) {
  const write = async (result: LicenseResult) => {
    const { error } = await adminClient
      .from('driver_licenses')
      .update({ ...result, ai_checked_at: new Date().toISOString() })
      .eq('user_id', userId);
    return error;
  };
  try {
    let result = await checkLicense(adminClient, loadAwsCreds(), userId);
    const writeError = await write(result);
    // 23505: the unique index on license_number -- this license is already
    // on another account.
    if (writeError?.code === '23505') {
      result = { ...result, license_number: null, ai_flag: 'mismatch', ai_error: 'This license is already used by another PartyUp account' };
      await write(result);
    }
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await write({
      ai_name_match: null,
      ai_qr_match: null,
      license_number: null,
      expiry_date: null,
      restriction_codes: [],
      ai_flag: 'error',
      ai_error: message,
    });
    return jsonResponse({ ai_flag: 'error', error: message }, 200);
  }
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[verify-vehicle-ai] UNCAUGHT top-level error:', message, error);
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

  // Caller-context client: only used to verify who the JWT belongs to.
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401);
  }
  const callerId = userData.user.id;

  const body: { vehicleId?: string; license?: boolean } = await req.json().catch(() => ({}));

  // Service-role client: bypasses RLS for storage download + write-back.
  // Safe because ownership is checked explicitly (the license check only
  // ever runs on the caller's own row).
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  if (body.license) {
    return handleLicenseRequest(adminClient, callerId);
  }

  const vehicleId = body.vehicleId;
  if (!vehicleId) {
    return jsonResponse({ error: 'vehicleId or license is required' }, 400);
  }

  const { data: vehicle, error: vehicleError } = await adminClient
    .from('vehicles')
    .select('id, user_id, plate_number, ownership_type, verification_status, orcr_image_path, plate_image_path, owner_id_front_path')
    .eq('id', vehicleId)
    .maybeSingle();
  if (vehicleError) return jsonResponse({ error: vehicleError.message }, 500);
  if (!vehicle) return jsonResponse({ error: 'Vehicle not found' }, 404);
  if (vehicle.user_id !== callerId) return jsonResponse({ error: 'Forbidden' }, 403);
  if (vehicle.verification_status !== 'pending') return jsonResponse({ error: 'Vehicle is not awaiting review' }, 400);
  if (!vehicle.orcr_image_path || !vehicle.plate_image_path) {
    return jsonResponse({ error: 'Vehicle is missing the OR/CR or plate photo' }, 400);
  }

  const writeResult = async (result: AiResult) => {
    await adminClient
      .from('vehicles')
      .update({ ...result, ai_checked_at: new Date().toISOString() })
      .eq('id', vehicleId);
  };

  try {
    const creds = loadAwsCreds();

    const borrowed = vehicle.ownership_type === 'borrowed';
    const bucket = adminClient.storage.from('vehicle-verifications');
    const [plateBlob, orcrBlob, ownerIdBlob, profileResult] = await Promise.all([
      bucket.download(vehicle.plate_image_path),
      bucket.download(vehicle.orcr_image_path),
      borrowed && vehicle.owner_id_front_path ? bucket.download(vehicle.owner_id_front_path) : null,
      adminClient.from('profiles').select('first_name, last_name').eq('id', vehicle.user_id).maybeSingle(),
    ]);
    if (plateBlob.error || !plateBlob.data) throw new Error(`Could not download plate photo: ${plateBlob.error?.message}`);
    if (orcrBlob.error || !orcrBlob.data) throw new Error(`Could not download OR/CR: ${orcrBlob.error?.message}`);

    const [plateLines, orcrLines, ownerIdLines] = await Promise.all([
      blobToBase64(plateBlob.data).then((image) => readLines(creds, image)),
      blobToBase64(orcrBlob.data).then((image) => readLines(creds, image)),
      ownerIdBlob?.data ? blobToBase64(ownerIdBlob.data).then((image) => readLines(creds, image)) : Promise.resolve([] as string[]),
    ]);

    const declaredPlate = normalizePlate(vehicle.plate_number);
    const photoPlates = plateCandidates(plateLines);
    const orcrText = normalizePlate(orcrLines.join(' '));

    const partial = {
      ai_plate_detected: photoPlates[0] ?? null,
      ai_plate_match: declaredPlate ? photoPlates.includes(declaredPlate) : null,
      ai_orcr_plate_match: declaredPlate && orcrLines.length ? orcrText.includes(declaredPlate) : null,
      ai_owner_match: borrowed
        ? ownerMatchesOwnerId(orcrLines, ownerIdLines)
        : ownerIsSubmitter(orcrLines, profileResult.data?.first_name ?? null, profileResult.data?.last_name ?? null),
    };
    const result: AiResult = { ...partial, ai_flag: decideFlag(partial, declaredPlate), ai_error: null };
    await writeResult(result);

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeResult({
      ai_plate_detected: null,
      ai_plate_match: null,
      ai_orcr_plate_match: null,
      ai_owner_match: null,
      ai_flag: 'error',
      ai_error: message,
    });
    return jsonResponse({ ai_flag: 'error', error: message }, 200);
  }
}
