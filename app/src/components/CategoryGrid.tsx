import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View, useWindowDimensions } from 'react-native';

import { AppText } from './ui/Text';
import { ScalePress } from './ui/animated';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { Trade } from '@/types/db';

/** Line icon per trade (falls back to the emoji from the trades table). */
export const TRADE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  plumbing: 'water',
  electrical: 'flash',
  carpentry: 'hammer',
  painting: 'color-palette',
  masonry: 'cube',
  tiling: 'grid',
  welding: 'flame',
  mechanics: 'car-sport',
  'appliance-repair': 'build',
  landscaping: 'leaf',
  'ac-refrigeration': 'snow',
  roofing: 'home',
  // Service economy (migration 0014)
  tutoring: 'school',
  'exam-prep': 'document-text',
  'music-lessons': 'musical-notes',
  'driving-lessons': 'car',
  hairdressing: 'cut',
  barbering: 'cut',
  'nail-tech': 'hand-left',
  makeup: 'color-wand',
  massage: 'body',
  fitness: 'barbell',
  catering: 'restaurant',
  baking: 'ice-cream',
  bartending: 'wine',
  'event-planning': 'sparkles',
  'dj-music': 'headset',
  photography: 'camera',
  cleaning: 'sparkles',
  laundry: 'shirt',
  childcare: 'happy',
  'elder-care': 'heart',
  'pest-control': 'bug',
  'pool-cleaning': 'water',
  security: 'shield',
  dressmaking: 'shirt',
  'shoe-repair': 'footsteps',
  upholstery: 'bed',
  'furniture-making': 'cube',
  'computer-repair': 'laptop',
  'phone-repair': 'phone-portrait',
  'web-design': 'color-palette',
  bookkeeping: 'calculator',
  'social-media': 'megaphone',
  delivery: 'bicycle',
  moving: 'bus',
  'car-detailing': 'car-sport',
  'generator-repair': 'flash',
};

/**
 * Display labels for the tight tile grid. The database labels are the formal
 * names ("AC & Refrigeration"); these are the short forms that fit a tile
 * without truncating. Search and profile screens keep the full labels.
 */
const SHORT_LABELS: Record<string, string> = {
  'ac-refrigeration': 'AC & Fridge',
  'appliance-repair': 'Appliances',
  mechanics: 'Auto Repair',
  'dressmaking': 'Tailoring',
  'furniture-making': 'Furniture',
  'computer-repair': 'Computers',
  'phone-repair': 'Phones',
  'web-design': 'Design',
  'social-media': 'Social',
  'driving-lessons': 'Driving',
  'music-lessons': 'Music',
  'exam-prep': 'Exam Prep',
  'event-planning': 'Events',
  'pool-cleaning': 'Pools',
  'generator-repair': 'Generators',
  'car-detailing': 'Detailing',
  'nail-tech': 'Nails',
  'elder-care': 'Elder Care',
  'pest-control': 'Pest',
  landscaping: 'Yard Care',
  photography: 'Photo',
  'dj-music': 'DJ',
};

/**
 * Featured order for the home grid — the trades customers look for most,
 * matching the design mockup's first row. Anything not listed follows in the
 * table's own order, so new trades still appear.
 */
const FEATURED_ORDER = [
  'plumbing',
  'electrical',
  'carpentry',
  'painting',
  'mechanics',
  'ac-refrigeration',
  'masonry',
  'appliance-repair',
];

export function orderTrades(trades: Trade[]): Trade[] {
  const rank = (slug: string) => {
    const index = FEATURED_ORDER.indexOf(slug);
    return index === -1 ? FEATURED_ORDER.length : index;
  };
  return [...trades].sort((a, b) => rank(a.slug) - rank(b.slug));
}

export function shortLabel(trade: Trade): string {
  return SHORT_LABELS[trade.slug] ?? trade.label;
}

interface CategoryGridProps {
  trades: Trade[];
  onSelect: (slug: string) => void;
  /** Tiles to show (default 8 — a 4×2 grid). */
  limit?: number;
  /**
   * Keep the caller's ordering instead of applying the featured order. Used
   * when the list already arrives ranked (e.g. by booking demand).
   */
  preserveOrder?: boolean;
  columns?: number;
  /** Horizontal padding already applied by the parent screen. */
  screenPadding?: number;
}

/**
 * Category cards: fixed-height tiles sized to the viewport so labels always
 * have two lines of room. Replaces the square aspect-ratio tiles, where long
 * trade names ("AC & Refrigeration") overflowed a single line.
 */
export function CategoryGrid({
  trades,
  onSelect,
  limit = 8,
  preserveOrder = false,
  columns = 4,
  screenPadding = space.s4,
}: CategoryGridProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();

  const gap = space.s3;
  const available = width - screenPadding * 2;
  const tileWidth = Math.floor((available - gap * (columns - 1)) / columns);

  const visible = (preserveOrder ? trades : orderTrades(trades)).slice(0, limit);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {visible.map((trade) => (
        <ScalePress
          key={trade.slug}
          haptic
          accessibilityRole="button"
          accessibilityLabel={trade.label}
          onPress={() => onSelect(trade.slug)}
          style={{ width: tileWidth }}
        >
          <View
            style={{
              height: 84,
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: space.s1,
              paddingVertical: space.s2,
              gap: space.s1,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: radius.md,
                backgroundColor: colors.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {TRADE_ICONS[trade.slug] ? (
                <Ionicons name={TRADE_ICONS[trade.slug]} size={19} color={colors.accent} />
              ) : (
                <AppText variant="bodySm">{trade.emoji}</AppText>
              )}
            </View>
            <AppText
              variant="caption"
              color="textMuted"
              numberOfLines={2}
              style={{ textAlign: 'center', fontSize: 11, lineHeight: 13 }}
            >
              {shortLabel(trade)}
            </AppText>
          </View>
        </ScalePress>
      ))}
    </View>
  );
}
