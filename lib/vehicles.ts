import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';
import * as ImageManipulator from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';

export type VehicleVerificationStatus = 'unverified' | 'pending' | 'approved' | 'rejected';

export type VehicleOwnershipType = 'owned' | 'borrowed';

export type Vehicle = {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  plate_number: string | null;
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

type VehiclePhotoLabel = 'exterior' | 'orcr' | 'plate' | 'authorization-letter' | 'owner-id-front' | 'owner-id-back' | 'owner-signatures';

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
  if (patch.isPrimary !== undefined) payload.is_primary = patch.isPrimary;
  if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;

  return withRequestTimeout(supabase.from('vehicles').update(payload).eq('id', vehicleId), 'Updating vehicle');
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
