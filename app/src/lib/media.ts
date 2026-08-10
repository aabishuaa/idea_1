import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

import { supabase } from './supabase';

export interface PickedImage {
  uri: string;
  mimeType: string;
  extension: string;
  /** Raw bytes, read at pick time — see uploadUserImage for why. */
  base64: string;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * base64 → bytes.
 *
 * Hand-rolled because React Native has no reliable `atob`, and the usual
 * `await fetch(uri).then(r => r.arrayBuffer())` trick — which this module used
 * to do — is exactly why uploads silently failed: RN's fetch polyfill routes
 * arrayBuffer() through its Blob implementation, which returns an empty or
 * detached buffer for file:// URIs. Supabase then stored a 0-byte object and
 * the app showed a broken image with no error anywhere.
 */
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const length = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(length);

  let byte = 0;
  let bits = 0;
  let out = 0;
  for (let index = 0; index < clean.length; index += 1) {
    const value = B64.indexOf(clean[index] as string);
    if (value === -1) continue;
    byte = (byte << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out] = (byte >> bits) & 0xff;
      out += 1;
    }
  }
  return out === length ? bytes : bytes.subarray(0, out);
}

/**
 * Opens the photo library and returns one image, or null if the user backed
 * out.
 *
 * A denied permission is NOT silent: it used to return null and the button
 * looked broken forever, because iOS never asks twice. Now it says so and
 * offers Settings.
 */
export async function pickImage(
  options: { square?: boolean } = {},
): Promise<PickedImage | null> {
  const existing = await ImagePicker.getMediaLibraryPermissionsAsync();
  let granted = existing.granted;

  if (!granted && existing.canAskAgain) {
    const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
    granted = asked.granted;
  }

  if (!granted) {
    Alert.alert(
      'Photo access is off',
      'myB needs permission to your photos to add pictures. Turn it on in Settings › myB › Photos.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ],
    );
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    // Read the bytes here rather than re-fetching the URI later.
    base64: true,
    allowsEditing: options.square === true,
    aspect: options.square === true ? [1, 1] : undefined,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;

  if (!asset.base64) {
    Alert.alert('Could not read that photo', 'Try another one, or take a new picture.');
    return null;
  }

  const extension = asset.uri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    extension,
    base64: asset.base64,
  };
}

/**
 * Uploads an image into a bucket under `<userId>/…`.
 *
 * The path prefix is not cosmetic: the portfolios storage policies authorise
 * writes with `(storage.foldername(name))[1] = auth.uid()::text`, so the
 * folder IS the permission check.
 *
 * Returns the storage path, or null with the reason surfaced to the caller.
 */
export async function uploadUserImage(
  bucket: string,
  userId: string,
  image: PickedImage,
  name?: string,
): Promise<string | null> {
  const filename = `${name ?? Date.now()}.${image.extension}`;
  const path = `${userId}/${filename}`;
  return uploadTo(bucket, path, image);
}

/** Uploads to an exact path (job photos are keyed by job id, not user id). */
export async function uploadTo(
  bucket: string,
  path: string,
  image: PickedImage,
): Promise<string | null> {
  const bytes = base64ToBytes(image.base64);
  if (bytes.length === 0) {
    Alert.alert('Upload failed', 'That photo came back empty. Try another one.');
    return null;
  }

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: image.mimeType,
    upsert: true,
  });
  if (error) {
    // Loud on purpose: a failed upload used to leave the button looking dead.
    Alert.alert('Upload failed', error.message);
    return null;
  }
  return path;
}

/**
 * Public URL for a file in a public bucket (portfolios).
 *
 * An absolute URL is returned untouched. Rows can therefore hold either a
 * bucket-relative path (everything the app itself uploads) or a full remote
 * URL — which is what `supabase/scripts/seed-images.mjs --mode=link` writes
 * when demo imagery is pointed at a CDN instead of being copied into Storage.
 * Without this, getPublicUrl would happily glue the bucket prefix onto an
 * "https://…" string and every seeded photo would render as a grey box.
 */
export function publicUrl(bucket: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
