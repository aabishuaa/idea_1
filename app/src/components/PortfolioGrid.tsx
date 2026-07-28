import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';

import { AppText } from './ui/Text';
import { lightTap } from './ui/animated';
import { publicUrl } from '@/lib/media';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { PortfolioItem } from '@/types/db';

const BUCKET = 'portfolios';
const COLUMNS = 3;
const GAP = 3;

interface PortfolioGridProps {
  items: PortfolioItem[];
  /** Shows the "add work" tile and per-photo delete. */
  editable?: boolean;
  uploading?: boolean;
  onAdd?: () => void;
  onDelete?: (item: PortfolioItem) => void;
}

/**
 * The worker's work, laid out the way people already read a portfolio: a tight
 * square grid, tap to open full-screen with the caption.
 *
 * This is the part of the profile that argues for someone. Reviews say a
 * stranger was happy; photos say "this is the standard of my work", which is
 * what an informal tradesperson has instead of a CV.
 */
export function PortfolioGrid({
  items,
  editable = false,
  uploading = false,
  onAdd,
  onDelete,
}: PortfolioGridProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<number | null>(null);

  // Grid sits inside the screen's 16pt padding.
  const tile = Math.floor((width - space.s4 * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  if (items.length === 0 && !editable) return null;

  return (
    <View style={{ gap: space.s3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
        <Ionicons name="images-outline" size={16} color={colors.textMuted} />
        <AppText variant="overline" color="textMuted" style={{ flex: 1 }}>
          Work {items.length > 0 ? `· ${items.length}` : ''}
        </AppText>
      </View>

      {items.length === 0 && editable ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            lightTap();
            onAdd?.();
          }}
          style={({ pressed }) => ({
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.s2,
            paddingVertical: space.s8,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          {uploading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Ionicons name="add-circle-outline" size={28} color={colors.accent} />
          )}
          <AppText variant="label" color="accent">
            Add your first photo
          </AppText>
          <AppText
            variant="caption"
            color="textMuted"
            style={{ textAlign: 'center', paddingHorizontal: space.s6 }}
          >
            Before-and-afters, finished jobs, your setup. Customers pick the pro they can
            picture doing the work.
          </AppText>
        </Pressable>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {editable && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add work photo"
              onPress={() => {
                lightTap();
                onAdd?.();
              }}
              style={({ pressed }) => ({
                width: tile,
                height: tile,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.accent,
                backgroundColor: colors.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              {uploading ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <>
                  <Ionicons name="add" size={22} color={colors.accent} />
                  <AppText variant="caption" color="accent">
                    Add
                  </AppText>
                </>
              )}
            </Pressable>
          )}

          {items.map((item, index) => (
            <Tile
              key={item.id}
              item={item}
              size={tile}
              index={index}
              onPress={() => setOpen(index)}
            />
          ))}
        </View>
      )}

      <Lightbox
        items={items}
        index={open}
        editable={editable}
        onClose={() => setOpen(null)}
        onDelete={(item) => {
          setOpen(null);
          onDelete?.(item);
        }}
      />
    </View>
  );
}

function Tile({
  item,
  size,
  index,
  onPress,
}: {
  item: PortfolioItem;
  size: number;
  index: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 280,
      delay: Math.min(index, 9) * 45,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
      }}
    >
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={item.caption || 'Work photo'} onPress={onPress}>
        {({ pressed }) => (
          <View
            style={{
              width: size,
              height: size,
              borderRadius: radius.sm,
              overflow: 'hidden',
              backgroundColor: colors.surfaceRaised,
              opacity: pressed ? 0.85 : 1,
            }}
          >
            <Image
              source={{ uri: publicUrl(BUCKET, item.storage_path) }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
            {item.caption ? (
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingHorizontal: 5,
                  paddingVertical: 3,
                  backgroundColor: 'rgba(0,0,0,0.45)',
                }}
              >
                <AppText
                  variant="caption"
                  style={{ color: '#FFFFFF', fontSize: 10 }}
                  numberOfLines={1}
                >
                  {item.caption}
                </AppText>
              </View>
            ) : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Full-screen viewer: swipe between photos, caption underneath. */
function Lightbox({
  items,
  index,
  editable,
  onClose,
  onDelete,
}: {
  items: PortfolioItem[];
  index: number | null;
  editable: boolean;
  onClose: () => void;
  onDelete: (item: PortfolioItem) => void;
}) {
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(index ?? 0);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    if (index != null) {
      setPage(index);
      // Wait for layout before jumping to the tapped photo.
      requestAnimationFrame(() => {
        scroller.current?.scrollTo({ x: index * width, animated: false });
      });
    }
  }, [index, width]);

  if (index == null) return null;
  const current = items[page];

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' }}>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) =>
            setPage(Math.round(event.nativeEvent.contentOffset.x / width))
          }
          style={{ flex: 1 }}
        >
          {items.map((item) => (
            <View
              key={item.id}
              style={{ width, height, alignItems: 'center', justifyContent: 'center' }}
            >
              <Image
                source={{ uri: publicUrl(BUCKET, item.storage_path) }}
                style={{ width, height: height * 0.7 }}
                resizeMode="contain"
              />
            </View>
          ))}
        </ScrollView>

        {/* Close */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={12}
          style={{ position: 'absolute', top: 54, right: space.s5 }}
        >
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </Pressable>

        {editable && current && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove this photo"
            onPress={() => onDelete(current)}
            hitSlop={12}
            style={{ position: 'absolute', top: 54, left: space.s5 }}
          >
            <Ionicons name="trash-outline" size={24} color="#FFFFFF" />
          </Pressable>
        )}

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 48,
            alignItems: 'center',
            gap: space.s2,
            paddingHorizontal: space.s6,
          }}
        >
          {current?.caption ? (
            <AppText
              variant="body"
              style={{ color: '#FFFFFF', textAlign: 'center' }}
            >
              {current.caption}
            </AppText>
          ) : null}
          <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {page + 1} of {items.length}
          </AppText>
        </View>
      </View>
    </Modal>
  );
}
