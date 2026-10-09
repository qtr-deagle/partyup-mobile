import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';
import * as ImageManipulator from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';

export type VehicleVerificationStatus = 'unverified' | 'pending' | 'approved' | 'rejected';

export type VehicleOwnershipType = 'owned' | 'borrowed';

export type VehicleAiFlag = 'passed' | 'needs_review' | 'mismatch' | 'error';

export type VehicleType = 'sedan' | 'hatchback' | 'suv' | 'mpv' | 'van' | 'pickup';

/** Seats include the driver; `seats` is the usual count, used as the default. */
export const VEHICLE_TYPES: { value: VehicleType; label: string; seats: number }[] = [
  { value: 'sedan', label: 'Sedan', seats: 5 },
  { value: 'hatchback', label: 'Hatchback', seats: 5 },
  { value: 'suv', label: 'SUV', seats: 7 },
  { value: 'mpv', label: 'MPV', seats: 7 },
  { value: 'van', label: 'Van', seats: 12 },
  { value: 'pickup', label: 'Pickup', seats: 5 },
];

export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = Object.fromEntries(VEHICLE_TYPES.map((type) => [type.value, type.label])) as Record<VehicleType, string>;

/** Common brands in the Philippines, for the make picker ("Other" types it). */
export const COMMON_MAKES = ['Toyota', 'Mitsubishi', 'Honda', 'Nissan', 'Suzuki', 'Hyundai', 'Ford', 'Isuzu', 'Kia', 'Mazda', 'Geely', 'Chevrolet'];

export const VEHICLE_COLORS: { name: string; hex: string }[] = [
  { name: 'White', hex: '#F8FAFC' },
  { name: 'Pearl White', hex: '#EEF0F2' },
  { name: 'Silver', hex: '#C0C6CF' },
  { name: 'Gray', hex: '#6B7280' },
  { name: 'Black', hex: '#111827' },
  { name: 'Red', hex: '#DC2626' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Brown', hex: '#7C4A2D' },
  { name: 'Beige', hex: '#D6C3A1' },
  { name: 'Green', hex: '#15803D' },
  { name: 'Orange', hex: '#EA580C' },
  { name: 'Yellow', hex: '#EAB308' },
];

/** "ABC 1234", "abc-1234" and "ABC1234" are the same plate (matches normalize_plate in SQL). */
export function normalizePlate(plate: string) {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type Vehicle = {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  plate_number: string | null;
  vehicle_type: VehicleType | null;
  /** Seats including the driver. */
  seat_capacity: number | null;
  /** OR/CR registration valid until (YYYY-MM-DD). */
  registration_expiry: string | null;
  verification_status: VehicleVerificationStatus;
  is_primary: boolean;
  notes: string | null;
  exterior_image_path: string | null;
  orcr_image_path: string | null;
  plate_image_path: string | null;
  ownership_type: VehicleOwnershipType;
  authorization_letter_path: string | null;
  owner_id_front_path: string | null;
  owner_id_back_path: string | null;
  owner_signatures_path: string | null;
  reviewer_notes: string | null;
  // Advisory OCR pre-check (verify-vehicle-ai); admins still decide.
  ai_plate_detected: string | null;
  ai_plate_match: boolean | null;
  ai_orcr_plate_match: boolean | null;
  ai_owner_match: boolean | null;
  ai_flag: VehicleAiFlag | null;
  ai_error: string | null;
  ai_checked_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PendingVehicleVerification = Vehicle & {
  display_name: string;
  avatar_url: string | null;
};

export type CreateVehicleInput = {
  make: string;
  model: string;
  year?: number | null;
  color?: string | null;
  plateNumber?: string | null;
  vehicleType?: VehicleType | null;
  seatCapacity?: number | null;
  registrationExpiry?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
};

export type UpdateVehicleInput = Partial<CreateVehicleInput>;

export type BorrowedVehicleDocuments = {
  authorizationLetterUri: string;
  ownerIdFrontUri: string;
  ownerIdBackUri: string;
  ownerSignaturesUri: string;
};

export type SubmitVehicleVerificationInput = {
  exteriorUri: string;
  orcrUri: string;
  plateUri: string;
  ownershipType: VehicleOwnershipType;
  // Required when ownershipType is 'borrowed'.
  borrowed?: BorrowedVehicleDocuments;
};

type VehiclePhotoLabel =
  | 'exterior'
  | 'orcr'
  | 'plate'
  | 'authorization-letter'
  | 'owner-id-front'
  | 'owner-id-back'
  | 'owner-signatures'
  | 'license-front'
  | 'license-back';

async function uploadVehiclePhoto(userId: string, label: VehiclePhotoLabel, uri: string) {
  // Same re-encode-to-JPEG + base64-js decode approach as ID verification's
  // uploadVerificationImage: source photos can arrive as HEIC or other
  // formats the capture UI doesn't fully control, and fetch(uri).arrayBuffer()
  // is known to corrupt binary data through React Native's Blob polyfill.
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

  const { error } = await supabase.storage.from('vehicle-verifications').upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to upload ${label} image: ${error.message}`);
  }

  return path;
}

export async function createVehicle(input: CreateVehicleInput) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { data: null, error: userError ?? new Error('You must be signed in to add a vehicle.') };
  }

  const { data, error } = await withRequestTimeout(
    supabase
      .from('vehicles')
      .insert({
        user_id: userData.user.id,
        make: input.make.trim(),
        model: input.model.trim(),
        year: input.year ?? null,
        color: input.color?.trim() || null,
        plate_number: input.plateNumber?.trim() || null,
        vehicle_type: input.vehicleType ?? null,
        seat_capacity: input.seatCapacity ?? null,
        registration_expiry: input.registrationExpiry ?? null,
        is_primary: input.isPrimary ?? false,
        notes: input.notes?.trim() || null,
      })
      .select('*')
      .single(),
    'Adding vehicle'
  );

  return { data: (data ?? null) as Vehicle | null, error };
}

export async function updateVehicle(vehicleId: string, patch: UpdateVehicleInput) {
  const payload: Record<string, unknown> = {};
  if (patch.make !== undefined) payload.make = patch.make.trim();
  if (patch.model !== undefined) payload.model = patch.model.trim();
  if (patch.year !== undefined) payload.year = patch.year;
  if (patch.color !== undefined) payload.color = patch.color?.trim() || null;
  if (patch.plateNumber !== undefined) payload.plate_number = patch.plateNumber?.trim() || null;
  if (patch.vehicleType !== undefined) payload.vehicle_type = patch.vehicleType;
  if (patch.seatCapacity !== undefined) payload.seat_capacity = patch.seatCapacity;
  if (patch.registrationExpiry !== undefined) payload.registration_expiry = patch.registrationExpiry;
  if (patch.isPrimary !== undefined) payload.is_primary = patch.isPrimary;
  if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;

  return withRequestTimeout(supabase.from('vehicles').update(payload).eq('id', vehicleId), 'Updating vehicle');
}

/** Blocked server-side while the car is on an upcoming or ongoing trip. */
export async function deleteVehicle(vehicleId: string) {
  return withRequestTimeout(supabase.from('vehicles').delete().eq('id', vehicleId), 'Removing vehicle');
}

export function isRegistrationExpired(vehicle: Pick<Vehicle, 'registration_expiry'>) {
  return !!vehicle.registration_expiry && vehicle.registration_expiry < new Date().toISOString().slice(0, 10);
}

/** Within 30 days of expiring (and not yet expired). */
export function isRegistrationExpiringSoon(vehicle: Pick<Vehicle, 'registration_expiry'>) {
  if (!vehicle.registration_expiry || isRegistrationExpired(vehicle)) return false;
  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  return vehicle.registration_expiry <= soon;
}

export type TripVehicle = {
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  vehicle_type: VehicleType | null;
  seat_capacity: number | null;
  /** Only for the driver and accepted riders. */
  plate_number: string | null;
};

/** The car riders should look for on a trip. */
export async function getTripVehicle(tripId: string) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('get_trip_vehicle', { p_trip_id: tripId }), 'Loading vehicle');
  } catch (error) {
    return { data: null as TripVehicle | null, error: error instanceof Error ? error : new Error('Unable to load the vehicle.') };
  }
  const rows = (response.data ?? []) as TripVehicle[];
  return { data: rows[0] ?? null, error: response.error };
}

export async function listMyVehicles() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { data: [] as Vehicle[], error: userError ?? new Error('You must be signed in to view vehicles.') };
  }

  let response;
  try {
    response = await withRequestTimeout(
      supabase.from('vehicles').select('*').eq('user_id', userData.user.id).order('created_at', { ascending: true }),
      'Loading your vehicles'
    );
  } catch (error) {
    return { data: [] as Vehicle[], error: error instanceof Error ? error : new Error('Unable to load your vehicles.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as Vehicle[], error };
}

export async function listMyApprovedVehicles() {
  const { data, error } = await listMyVehicles();
  return { data: data.filter((vehicle) => vehicle.verification_status === 'approved'), error };
}

export async function submitVehicleForVerification(vehicleId: string, input: SubmitVehicleVerificationInput) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: userError ?? new Error('You must be signed in to submit a verification.') };
  }

  const userId = userData.user.id;
  const borrowed = input.ownershipType === 'borrowed' ? input.borrowed : undefined;

  if (input.ownershipType === 'borrowed' && !borrowed) {
    return { error: new Error('Borrowed vehicles need the letter of authorization, owner ID, and owner signatures.') };
  }

  try {
    const exteriorPath = await uploadVehiclePhoto(userId, 'exterior', input.exteriorUri);
    const orcrPath = await uploadVehiclePhoto(userId, 'orcr', input.orcrUri);
    const platePath = await uploadVehiclePhoto(userId, 'plate', input.plateUri);
    const authorizationLetterPath = borrowed ? await uploadVehiclePhoto(userId, 'authorization-letter', borrowed.authorizationLetterUri) : null;
    const ownerIdFrontPath = borrowed ? await uploadVehiclePhoto(userId, 'owner-id-front', borrowed.ownerIdFrontUri) : null;
    const ownerIdBackPath = borrowed ? await uploadVehiclePhoto(userId, 'owner-id-back', borrowed.ownerIdBackUri) : null;
    const ownerSignaturesPath = borrowed ? await uploadVehiclePhoto(userId, 'owner-signatures', borrowed.ownerSignaturesUri) : null;

    const { error: updateError } = await withRequestTimeout(
      supabase
        .from('vehicles')
        .update({
          exterior_image_path: exteriorPath,
          orcr_image_path: orcrPath,
          plate_image_path: platePath,
          ownership_type: input.ownershipType,
          authorization_letter_path: authorizationLetterPath,
          owner_id_front_path: ownerIdFrontPath,
          owner_id_back_path: ownerIdBackPath,
          owner_signatures_path: ownerSignaturesPath,
          verification_status: 'pending',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', vehicleId),
      'Submitting verification'
    );

    if (updateError) {
      return { error: updateError };
    }

    // Fire-and-forget, like verify-id-ai: an advisory OCR check of the plate
    // and OR/CR runs in the background. Admin review is required either way,
    // so a failure here must never surface as a submission failure.
    supabase.functions
      .invoke('verify-vehicle-ai', { body: { vehicleId } })
      .catch((error) => console.warn('Vehicle AI pre-check failed to run:', error));

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Failed to submit verification.') };
  }
}

// Staff/admin only -- RLS on vehicles only lets non-staff see their own
// rows, so this naturally returns nothing for a regular traveler account.
export async function listPendingVehicleVerifications() {
  let response;
  try {
    response = await withRequestTimeout(
      supabase.from('vehicles').select('*').eq('verification_status', 'pending').order('submitted_at', { ascending: true }),
      'Loading pending vehicle verifications'
    );
  } catch (error) {
    return {
      data: [] as PendingVehicleVerification[],
      error: error instanceof Error ? error : new Error('Unable to load pending vehicle verifications.'),
    };
  }
  const { data, error } = response;
  if (error || !data?.length) {
    return { data: [] as PendingVehicleVerification[], error };
  }

  const rows = data as Vehicle[];
  const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const { data: profiles } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds);
  const profileById = new Map((profiles ?? []).map((row) => [row.id as string, row]));

  const merged: PendingVehicleVerification[] = rows.map((row) => ({
    ...row,
    display_name: (profileById.get(row.user_id)?.display_name as string) ?? 'Unknown traveler',
    avatar_url: (profileById.get(row.user_id)?.avatar_url as string | null) ?? null,
  }));

  return { data: merged, error: null };
}

export async function getVehiclePhotoUrl(path: string) {
  const { data, error } = await supabase.storage.from('vehicle-verifications').createSignedUrl(path, 600);
  if (error || !data) {
    return null;
  }
  return data.signedUrl;
}

export async function reviewVehicleVerification(vehicleId: string, decision: 'approved' | 'rejected', notes?: string) {
  return withRequestTimeout(
    supabase.rpc('review_vehicle_verification', { p_vehicle_id: vehicleId, p_decision: decision, p_notes: notes ?? null }),
    'Submitting review'
  );
}

// ---------------------------------------------------------------------
// Driver's license (one per person, required to create carpools)
// ---------------------------------------------------------------------
export type DriverLicense = {
  user_id: string;
  source: 'id_verification' | 'upload';
  id_verification_id: string | null;
  front_image_path: string;
  back_image_path: string | null;
  status: 'pending' | 'approved' | 'rejected';
  expiry_date: string | null;
  restriction_codes: string[];
  ai_name_match: boolean | null;
  // QR on the back (scanned live) vs the printed card and the driver's name.
  qr_data: string | null;
  license_number: string | null;
  ai_qr_match: boolean | null;
  ai_flag: VehicleAiFlag | null;
  ai_error: string | null;
  ai_checked_at: string | null;
  reviewer_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

// Approved and not expired (an unread expiry counts as valid). Mirrors
// public.has_valid_driver_license().
export function isLicenseValid(license: DriverLicense | null, on: Date = new Date()) {
  if (!license || license.status !== 'approved') return false;
  return !license.expiry_date || license.expiry_date >= on.toISOString().slice(0, 10);
}

export function isLicenseExpired(license: DriverLicense | null) {
  return !!license?.expiry_date && license.expiry_date < new Date().toISOString().slice(0, 10);
}

export async function getMyDriverLicense() {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { data: null as DriverLicense | null, error: null };
  }
  try {
    const { data, error } = await withRequestTimeout(
      supabase.from('driver_licenses').select('*').eq('user_id', userData.user.id).maybeSingle(),
      "Loading driver's license"
    );
    return { data: (data ?? null) as DriverLicense | null, error };
  } catch (error) {
    return { data: null as DriverLicense | null, error: error instanceof Error ? error : new Error("Unable to load driver's license.") };
  }
}

// Admin review: the license of the person who submitted a vehicle.
export async function getDriverLicenseFor(userId: string) {
  const { data } = await supabase.from('driver_licenses').select('*').eq('user_id', userId).maybeSingle();
  return (data ?? null) as DriverLicense | null;
}

// True when the user's approved ID verification was a driver's license, so
// it can be reused in one tap.
export async function hasVerifiedIdLicense() {
  try {
    const { data } = await withRequestTimeout(supabase.rpc('get_verified_id_license'), "Checking your verified ID");
    return !!data;
  } catch {
    return false;
  }
}

// Fire-and-forget OCR of the license (name, expiry, restriction codes).
function runLicenseAiCheck() {
  supabase.functions
    .invoke('verify-vehicle-ai', { body: { license: true } })
    .catch((error) => console.warn('License AI check failed to run:', error));
}

export async function reuseVerifiedIdAsLicense(qrData: string) {
  try {
    const { data, error } = await withRequestTimeout(
      supabase.rpc('use_verified_id_as_license', { p_qr_data: qrData }),
      "Saving driver's license"
    );
    if (!error) runLicenseAiCheck();
    return { data: (data ?? null) as DriverLicense | null, error };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Unable to use your verified license.") };
  }
}

export async function submitDriverLicense(frontUri: string, backUri: string, qrData: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: userError ?? new Error('You must be signed in.') };
  }
  try {
    const frontPath = await uploadVehiclePhoto(userData.user.id, 'license-front', frontUri);
    const backPath = await uploadVehiclePhoto(userData.user.id, 'license-back', backUri);
    const { error } = await withRequestTimeout(
      supabase.rpc('submit_driver_license', { p_front_path: frontPath, p_back_path: backPath, p_qr_data: qrData }),
      "Submitting driver's license"
    );
    if (!error) runLicenseAiCheck();
    return { error };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error("Failed to submit driver's license.") };
  }
}

export async function getDriverLicensePhotoUrl(license: DriverLicense, path: string) {
  const bucket = license.source === 'id_verification' ? 'id-verifications' : 'vehicle-verifications';
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
  return error || !data ? null : data.signedUrl;
}

export async function reviewDriverLicense(userId: string, decision: 'approved' | 'rejected', notes?: string) {
  return withRequestTimeout(
    supabase.rpc('review_driver_license', { p_user_id: userId, p_decision: decision, p_notes: notes ?? null }),
    "Reviewing driver's license"
  );
}
