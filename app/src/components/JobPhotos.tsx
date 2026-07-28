import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

import { AppText } from './ui/Text';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { JobPhoto } from '@/types/db';

/**
 * Photos attached to a booking.
 *
 * The bucket is private (migration 0021) — a job photo can show the inside of
 * someone's home — so every URL here is a short-lived signed one, fetched on
 * mount rather than stored.
 */
export function JobPhotos({ photos }: { photos: JobPhoto[] }) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (photos.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.storage
        .from('job-photos')
        .createSignedUrls(photos.map((photo) => photo.storage_path), 3600);
      if (cancelled || !data) return;
      const next: Record<string, string> = {};
      data.forEach((row) => {
        if (row.path && row.signedUrl) next[row.path] = row.signedUrl;
      });
      setUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [photos]);

  if (photos.length === 0) return null;

  return (
    <View style={{ gap: space.s2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
        <Ionicons name="camera-outline" size={15} color={colors.textMuted} />
        <AppText variant="caption" color="textMuted">
          {photos.length === 1 ? '1 photo' : `${photos.length} photos`}
        </AppText>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: space.s2 }}>
          {photos.map((photo, index) => (
            <Pressable
              key={photo.id}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Photo ${index + 1}`}
              onPress={() => setOpen(index)}
            >
              <Image
                source={{ uri: urls[photo.storage_path] }}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceRaised,
                }}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={open !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' }}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {photos.map((photo) => (
              <View
                key={photo.id}
                style={{ width, height, alignItems: 'center', justifyContent: 'center' }}
              >
                <Image
                  source={{ uri: urls[photo.storage_path] }}
                  style={{ width, height: height * 0.75 }}
                  resizeMode="contain"
                />
              </View>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => setOpen(null)}
            hitSlop={12}
            style={{ position: 'absolute', top: 54, right: space.s5 }}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
