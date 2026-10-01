import type { OutgoingPhoto } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { toByteArray } from 'base64-js';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

const BUCKET = 'chat-media';
const MAX_SIDE = 1280;
const SIGNED_URL_SECONDS = 60 * 60;

export type PickedPhoto = { uri: string; width: number; height: number };

// Asks for permission, then opens the camera or the gallery. null = cancelled.
export async function pickChatPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission needed', source === 'camera' ? 'Camera access is needed to take a photo.' : 'Photo library access is needed to send a photo.');
    return null;
  }

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

// Shrinks to at most 1280px on the long side (keeps uploads small on the free
// storage tier) and uploads to <threadId>/<random>.jpg.
export async function uploadChatPhoto(threadId: string, photo: PickedPhoto): Promise<{ data: OutgoingPhoto | null; error: Error | null }> {
  try {
    const landscape = photo.width >= photo.height;
    const needsResize = Math.max(photo.width, photo.height) > MAX_SIDE;
    const normalized = await ImageManipulator.manipulateAsync(
      photo.uri,
      needsResize ? [{ resize: landscape ? { width: MAX_SIDE } : { height: MAX_SIDE } }] : [],
      { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!normalized.base64) throw new Error('Failed to process the photo.');

    const path = `${threadId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, toByteArray(normalized.base64), { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error(`Failed to upload photo: ${error.message}`);

    return { data: { path, width: normalized.width, height: normalized.height }, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Failed to send photo.') };
  }
}

// Photos are private, so they're shown through short-lived signed URLs.
// Cached so scrolling and re-renders don't re-sign the same files.
const urlCache = new Map<string, { url: string; expiresAt: number }>();

export async function getChatPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const result: Record<string, string> = {};
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const cached = urlCache.get(path);
    // Re-sign a few minutes early so an open screen never shows an expired link.
    if (cached && cached.expiresAt - 5 * 60 * 1000 > now) result[path] = cached.url;
    else missing.push(path);
  }

  if (missing.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(missing, SIGNED_URL_SECONDS);
    for (const item of data ?? []) {
      if (!item.path || !item.signedUrl) continue;
      urlCache.set(item.path, { url: item.signedUrl, expiresAt: now + SIGNED_URL_SECONDS * 1000 });
      result[item.path] = item.signedUrl;
    }
  }

  return result;
}
