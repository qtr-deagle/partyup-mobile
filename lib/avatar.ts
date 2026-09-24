import { supabase } from '@/lib/supabase';
import * as ImageManipulator from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';

// Same re-encode-to-JPEG + base64 byte path as uploadReportEvidenceImage in
// lib/reports.ts. Resized to 512px wide since avatars never render larger
// than ~112px.
export async function uploadAvatar(uri: string) {
  const { data: sessionResult } = await supabase.auth.getSession();
  const userId = sessionResult.session?.user.id;
  if (!userId) {
    return { data: null, error: new Error('You are not signed in.') };
  }

  try {
    const normalized = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 512 } }], {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (!normalized.base64) {
      throw new Error('Failed to process the photo.');
    }

    // New filename each time so the public CDN URL changes and stale cached
    // avatars don't linger on other devices.
    const path = `${userId}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, toByteArray(normalized.base64), {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (uploadError) {
      throw new Error(`Failed to upload photo: ${uploadError.message}`);
    }

    const publicUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
    if (updateError) {
      throw updateError;
    }

    // Best-effort cleanup of previous avatars; failure here is harmless.
    const { data: existing } = await supabase.storage.from('avatars').list(userId);
    const stale = (existing ?? []).map((file) => `${userId}/${file.name}`).filter((name) => name !== path);
    if (stale.length) {
      void supabase.storage.from('avatars').remove(stale);
    }

    return { data: publicUrl, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Failed to update photo.') };
  }
}
