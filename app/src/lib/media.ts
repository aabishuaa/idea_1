import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

export interface PickedImage {
  uri: string;
  mimeType: string;
  extension: string;
}

/**
 * Opens the photo library and returns one image, or null if the user backed
 * out or refused access.
 *
 * Permission is requested explicitly rather than relying on the picker to
 * prompt: on Android the silent denial looked exactly like "the button does
 * nothing", which is the worst possible failure for this audience.
 */
export async function pickImage(
  options: { square?: boolean } = {},
): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    allowsEditing: options.square === true,
    aspect: options.square === true ? [1, 1] : undefined,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;

  const extension = asset.uri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    extension,
  };
}

/**
 * Uploads an image into a bucket under `<userId>/…`.
 *
 * The path prefix is not cosmetic: the portfolios storage policies authorise
 * writes with `(storage.foldername(name))[1] = auth.uid()::text`, so the
 * folder IS the permission check.
 */
export async function uploadUserImage(
  bucket: string,
  userId: string,
  image: PickedImage,
  name?: string,
): Promise<string | null> {
  const filename = `${name ?? Date.now()}.${image.extension}`;
  const path = `${userId}/${filename}`;

  const response = await fetch(image.uri);
  const bytes = await response.arrayBuffer();

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: image.mimeType,
    upsert: true,
  });
  if (error) return null;
  return path;
}

/** Public URL for a file in a public bucket (portfolios). */
export function publicUrl(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
