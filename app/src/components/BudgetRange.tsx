import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { AppText } from './ui/Text';
import { lightTap } from './ui/animated';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

export interface Budget {
  /** Digits only, as typed. Empty string means "not said". */
  min: string;
  max: string;
}

export const EMPTY_BUDGET: Budget = { min: '', max: '' };

/** Common brackets, so most people never type a number at all. */
const PRESETS: { label: string; min: string; max: string }[] = [
  { label: 'Under $5k', min: '', max: '5000' },
  { label: '$5k–15k', min: '5000', max: '15000' },
  { label: '$15k–40k', min: '15000', max: '40000' },
  { label: '$40k+', min: '40000', max: '' },
];

const digits = (t: string) => t.replace(/[^0-9]/g, '');
export const budgetNumber = (v: string): number | null =>
  v.trim() === '' ? null : Number(digits(v));

/** "JMD 5,000 – 15,000" / "Up to JMD 5,000" / "JMD 40,000+" */
export function describeBudget(budget: Budget): string {
  const min = budgetNumber(budget.min);
  const max = budgetNumber(budget.max);
  const money = (n: number) => `JMD ${n.toLocaleString('en-JM')}`;
  if (min == null && max == null) return 'Open — suggest a price';
  if (min == null) return `Up to ${money(max!)}`;
  if (max == null) return `${money(min)}+`;
  if (min === max) return money(min);
  // Currency once, not twice — "JMD 5,000 – JMD 15,000" reads as two prices.
  return `${money(min)} – ${max!.toLocaleString('en-JM')}`;
}

/** True when the customer typed a max below their own min. */
export function budgetInverted(budget: Budget): boolean {
  const min = budgetNumber(budget.min);
  const max = budgetNumber(budget.max);
  return min != null && max != null && max < min;
}

/**
 * What the customer is willing to spend, as a range.
 *
 * It was a single number, which forced a bad guess: put one figure in and it
 * reads to the worker as a ceiling, so a customer who would happily pay
 * 12–18k types 12k and prices themselves out of the person they wanted. A range
 * is also what the database has always stored (budget_min_jmd / budget_max_jmd
 * — both were being written with the same value).
 *
 * Presets come first because most people think in brackets, not figures; the
 * two fields are there for when they know exactly.
 */
export function BudgetRange({
  value,
  onChange,
}: {
  value: Budget;
  onChange: (next: Budget) => void;
}) {
  const { colors } = useTheme();
  const inverted = budgetInverted(value);

  const activePreset = PRESETS.findIndex((p) => p.min === value.min && p.max === value.max);

  const field = (
    which: 'min' | 'max',
    label: string,
    placeholder: string,
  ) => (
    <View style={{ flex: 1, gap: space.s1 }}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s1,
          borderWidth: 1,
          borderColor: inverted ? colors.error : colors.border,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          paddingHorizontal: space.s3,
          height: 46,
        }}
      >
        <AppText variant="bodySm" color="textMuted">
          $
        </AppText>
        <TextInput
          value={value[which]}
          onChangeText={(text) => onChange({ ...value, [which]: digits(text) })}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          style={{
            flex: 1,
            color: colors.text,
            fontFamily: 'PlusJakartaSans_500Medium',
            fontSize: 15,
          }}
        />
      </View>
    </View>
  );

  return (
    <View style={{ gap: space.s2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
        <AppText variant="label" color="textMuted" style={{ flex: 1 }}>
          Your budget (optional)
        </AppText>
        {(value.min !== '' || value.max !== '') && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear the budget"
            hitSlop={8}
            onPress={() => {
              lightTap();
              onChange(EMPTY_BUDGET);
            }}
          >
            <AppText variant="caption" color="accent">
              Clear
            </AppText>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
        {PRESETS.map((preset, index) => {
          const active = index === activePreset;
          return (
            <Pressable
              key={preset.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                lightTap();
                onChange({ min: preset.min, max: preset.max });
              }}
              style={{
                paddingHorizontal: space.s3,
                paddingVertical: space.s2,
                borderRadius: radius.full,
                borderWidth: 1,
                borderColor: active ? colors.accent : colors.border,
                backgroundColor: active ? colors.accentSoft : colors.surface,
              }}
            >
              <AppText variant="bodySm" color={active ? 'accent' : 'text'}>
                {preset.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s3 }}>
        {field('min', 'From', 'no minimum')}
        <View style={{ paddingBottom: 14 }}>
          <AppText variant="bodySm" color="textMuted">
            –
          </AppText>
        </View>
        {field('max', 'Up to', 'no maximum')}
      </View>

      {inverted ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
          <Ionicons name="alert-circle" size={14} color={colors.error} />
          <AppText variant="caption" color="error">
            The top of your range is below the bottom — swap them around.
          </AppText>
        </View>
      ) : (
        <AppText variant="caption" color="textMuted">
          {describeBudget(value)}
          {value.min === '' && value.max === '' ? ' · pros will quote you' : ''}
        </AppText>
      )}
    </View>
  );
}
