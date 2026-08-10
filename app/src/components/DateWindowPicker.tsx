import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText } from './ui/Text';
import { lightTap } from './ui/animated';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

/** How far ahead a customer can book. Beyond this they should just message. */
const DAYS_AHEAD = 45;

export interface DateWindow {
  /** ISO yyyy-mm-dd, or null for "no preference". */
  from: string | null;
  to: string | null;
}

export const EMPTY_WINDOW: DateWindow = { from: null, to: null };

/** Local yyyy-mm-dd. `toISOString` would shift the date across the timezone. */
export function isoDate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseIso(iso: string): Date {
  const parts = iso.split('-');
  // Built from our own isoDate(), so this is well-formed; the fallbacks are
  // here to satisfy strict indexing rather than to handle real input.
  return new Date(Number(parts[0] ?? 0), Number(parts[1] ?? 1) - 1, Number(parts[2] ?? 1));
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today" / "Tomorrow" / "Fri 8 Aug" — how people actually say a date. */
export function describeDay(iso: string): string {
  const d = parseIso(iso);
  const today = new Date();
  const days = Math.round(
    (parseIso(iso).getTime() - parseIso(isoDate(today)).getTime()) / 86_400_000,
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}

/** How the chosen window reads back on the confirm screen. */
export function describeWindow(window: DateWindow): string {
  if (!window.from && !window.to) return 'Any time — I’m flexible';
  if (window.from && !window.to) return `From ${describeDay(window.from)}`;
  if (!window.from && window.to) return `By ${describeDay(window.to)}`;
  if (window.from === window.to) return describeDay(window.from!);
  return `${describeDay(window.from!)} – ${describeDay(window.to!)}`;
}

/**
 * When do you need this done?
 *
 * This replaced four urgency chips ("Whenever / This week / Soon / Emergency").
 * Those asked the customer to translate a real constraint — "before Friday,
 * because the tenant moves in Saturday" — into an adjective, and then asked the
 * worker to translate it back. Everyone lost information in both directions.
 *
 * Deliberately a horizontal strip of real days rather than a native date
 * spinner: a spinner is three coupled wheels and a confirm button, which is a
 * lot to ask of someone using their first structured app, and it hides the one
 * thing that matters here (how soon is soon). It also needs no native module,
 * so it runs in Expo Go — the date picker would not.
 *
 * Tap once to set the earliest day; tap a later day to close the window. Tap the
 * same day twice for a single day. The stored `urgency` is derived from the
 * window in the database (migration 0023), so the matching and reputation
 * weights that depend on it keep working untouched.
 */
export function DateWindowPicker({
  value,
  onChange,
}: {
  value: DateWindow;
  onChange: (next: DateWindow) => void;
}) {
  const { colors } = useTheme();
  const scroller = useRef<ScrollView>(null);

  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return isoDate(d);
    });
  }, []);

  const pick = (iso: string) => {
    lightTap();
    // No start yet, or the whole window is already set → begin a new one.
    if (!value.from || (value.from && value.to)) {
      onChange({ from: iso, to: iso });
      return;
    }
    // Tapping before the start moves the start rather than rejecting the tap —
    // refusing a tap with no explanation reads as the control being broken.
    if (iso < value.from) {
      onChange({ from: iso, to: value.from });
      return;
    }
    onChange({ from: value.from, to: iso });
  };

  const inWindow = (iso: string) =>
    value.from != null && value.to != null && iso >= value.from && iso <= value.to;

  return (
    <View style={{ gap: space.s2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
        <AppText variant="label" color="textMuted" style={{ flex: 1 }}>
          When do you need it done?
        </AppText>
        {(value.from || value.to) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear the dates"
            hitSlop={8}
            onPress={() => {
              lightTap();
              onChange(EMPTY_WINDOW);
            }}
          >
            <AppText variant="caption" color="accent">
              Clear
            </AppText>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.s2, paddingRight: space.s4 }}
      >
        {days.map((iso) => {
          const active = inWindow(iso);
          const isEdge = iso === value.from || iso === value.to;
          const d = parseIso(iso);
          return (
            <Pressable
              key={iso}
              accessibilityRole="button"
              accessibilityLabel={describeDay(iso)}
              accessibilityState={{ selected: active }}
              onPress={() => pick(iso)}
              style={{
                width: 54,
                paddingVertical: space.s2,
                borderRadius: radius.md,
                alignItems: 'center',
                gap: 1,
                borderWidth: 1,
                borderColor: isEdge ? colors.accent : active ? colors.accentSoft : colors.border,
                backgroundColor: isEdge
                  ? colors.accent
                  : active
                    ? colors.accentSoft
                    : colors.surface,
              }}
            >
              <AppText
                variant="caption"
                style={{
                  fontSize: 10,
                  color: isEdge ? '#FFFFFF' : colors.textMuted,
                }}
              >
                {DOW[d.getDay()]}
              </AppText>
              <AppText
                variant="label"
                style={{ color: isEdge ? '#FFFFFF' : active ? colors.accent : colors.text }}
              >
                {d.getDate()}
              </AppText>
              <AppText
                variant="caption"
                style={{
                  fontSize: 9,
                  color: isEdge ? 'rgba(255,255,255,0.85)' : colors.textMuted,
                }}
              >
                {MON[d.getMonth()]}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
        <Ionicons
          name={value.from ? 'calendar' : 'calendar-outline'}
          size={14}
          color={value.from ? colors.accent : colors.textMuted}
        />
        <AppText variant="caption" color={value.from ? 'accent' : 'textMuted'}>
          {value.from
            ? describeWindow(value)
            : 'Pick a day — or tap two days for a range. Leave blank if any time works.'}
        </AppText>
      </View>
    </View>
  );
}
