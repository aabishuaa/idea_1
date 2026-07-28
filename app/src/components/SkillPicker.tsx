import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Input } from './ui/Input';
import { AppText } from './ui/Text';
import { lightTap, successTap } from './ui/animated';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { Trade } from '@/types/db';

/** One thing a worker offers. `custom` skills carry their own typed label. */
export interface Skill {
  /** Trade slug, or 'other' for something not in the catalogue. */
  trade_slug: string;
  /** What is shown and what search matches on. */
  title: string;
  custom?: boolean;
}

interface SkillPickerProps {
  trades: Trade[];
  value: Skill[];
  onChange: (skills: Skill[]) => void;
}

const MAX_SKILLS = 8;

/**
 * Pick everything you actually do.
 *
 * The old picker showed all 48 trades as a flat wall of chips and let you
 * choose exactly one, which is wrong twice over: people are not one thing
 * (someone bakes AND teaches), and a wall of 48 chips is not a choice, it is a
 * search problem.
 *
 * So: type to filter, categories collapsed until they are relevant, chosen
 * skills lifted to the top where you can see and remove them — and if the
 * catalogue does not have your thing, the search box becomes the way to add
 * it. Nothing about a Jamaican side hustle fits neatly into 48 buckets.
 */
export function SkillPicker({ trades, value, onChange }: SkillPickerProps) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const term = query.trim().toLowerCase();
  const atLimit = value.length >= MAX_SKILLS;

  const groups = useMemo(() => {
    const map = new Map<string, Trade[]>();
    trades
      .filter((trade) => trade.slug !== 'other')
      .forEach((trade) => {
        const key = trade.category ?? 'Other';
        map.set(key, [...(map.get(key) ?? []), trade]);
      });
    return [...map.entries()];
  }, [trades]);

  const matches = useMemo(() => {
    if (!term) return [];
    return trades
      .filter(
        (trade) =>
          trade.slug !== 'other' &&
          (trade.label.toLowerCase().includes(term) ||
            (trade.category ?? '').toLowerCase().includes(term)),
      )
      .slice(0, 12);
  }, [trades, term]);

  const isSelected = (slug: string, title: string) =>
    value.some((skill) => skill.trade_slug === slug && skill.title === title);

  const toggle = (trade: Trade) => {
    const existing = value.find(
      (skill) => skill.trade_slug === trade.slug && !skill.custom,
    );
    if (existing) {
      lightTap();
      onChange(value.filter((skill) => skill !== existing));
      return;
    }
    if (atLimit) return;
    lightTap();
    onChange([...value, { trade_slug: trade.slug, title: trade.label }]);
  };

  const addCustom = () => {
    const label = query.trim();
    if (!label || atLimit) return;
    if (value.some((skill) => skill.title.toLowerCase() === label.toLowerCase())) return;
    successTap();
    onChange([...value, { trade_slug: 'other', title: label.slice(0, 80), custom: true }]);
    setQuery('');
  };

  const remove = (skill: Skill) => {
    lightTap();
    onChange(value.filter((item) => item !== skill));
  };

  return (
    <View style={{ gap: space.s4 }}>
      <View style={{ gap: 2 }}>
        <AppText variant="label" color="textMuted">
          What do you do?
        </AppText>
        <AppText variant="caption" color="textMuted">
          Pick everything — trades, teaching, beauty, food, care, tech. If people pay you for
          it, it belongs here.
        </AppText>
      </View>

      {/* Chosen, and removable. */}
      {value.length > 0 && (
        <View style={{ gap: space.s2 }}>
          <AppText variant="caption" color="accent">
            Your skills · {value.length}
            {atLimit ? ` (max ${MAX_SKILLS})` : ''}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
            {value.map((skill, index) => (
              <Pressable
                key={`${skill.trade_slug}-${skill.title}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${skill.title}`}
                onPress={() => remove(skill)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.s2,
                  paddingLeft: space.s3,
                  paddingRight: space.s2,
                  paddingVertical: space.s2,
                  borderRadius: radius.full,
                  backgroundColor: colors.accentSoft,
                  borderWidth: 1,
                  borderColor: colors.accent,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                {skill.custom && <Ionicons name="sparkles" size={11} color={colors.accent} />}
                <AppText variant="caption" color="accent">
                  {skill.title}
                </AppText>
                <Ionicons name="close-circle" size={14} color={colors.accent} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Input
        icon="search"
        placeholder="Search skills, or type your own…"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        returnKeyType="done"
        onSubmitEditing={() => {
          if (matches.length === 0) addCustom();
        }}
      />

      {/* Typing: matching skills, plus the escape hatch. */}
      {term.length > 0 ? (
        <View style={{ gap: space.s3 }}>
          {matches.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
              {matches.map((trade) => (
                <SkillChip
                  key={trade.slug}
                  label={`${trade.emoji} ${trade.label}`}
                  selected={isSelected(trade.slug, trade.label)}
                  disabled={atLimit && !isSelected(trade.slug, trade.label)}
                  onPress={() => toggle(trade)}
                />
              ))}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={atLimit}
            onPress={addCustom}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.s3,
              padding: space.s3,
              borderRadius: radius.md,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.accent,
              opacity: pressed || atLimit ? 0.6 : 1,
            })}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <AppText variant="label" color="accent" numberOfLines={1}>
                Add “{query.trim()}” as your own skill
              </AppText>
              <AppText variant="caption" color="textMuted">
                {matches.length > 0
                  ? 'Not quite what you do? Use your own words.'
                  : 'Nothing in the list matches — customers can still find you by these words.'}
              </AppText>
            </View>
          </Pressable>
        </View>
      ) : (
        /* Browsing: categories, collapsed. */
        <View style={{ gap: space.s2 }}>
          {groups.map(([category, items]) => {
            const open = openCategory === category;
            const chosen = items.filter((trade) =>
              value.some((skill) => skill.trade_slug === trade.slug),
            ).length;
            return (
              <View
                key={category}
                style={{
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: open ? colors.accent : colors.border,
                  overflow: 'hidden',
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  onPress={() => {
                    lightTap();
                    setOpenCategory(open ? null : category);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.s2,
                    padding: space.s3,
                    backgroundColor: open ? colors.accentSoft : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <AppText variant="label" style={{ flex: 1 }}>
                    {category}
                  </AppText>
                  {chosen > 0 && (
                    <View
                      style={{
                        minWidth: 20,
                        height: 20,
                        borderRadius: 10,
                        paddingHorizontal: 6,
                        backgroundColor: colors.accent,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <AppText variant="caption" style={{ color: '#FFFFFF', fontSize: 10 }}>
                        {chosen}
                      </AppText>
                    </View>
                  )}
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.textMuted}
                  />
                </Pressable>
                {open && (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: space.s2,
                      padding: space.s3,
                    }}
                  >
                    {items.map((trade) => (
                      <SkillChip
                        key={trade.slug}
                        label={`${trade.emoji} ${trade.label}`}
                        selected={value.some((skill) => skill.trade_slug === trade.slug)}
                        disabled={
                          atLimit && !value.some((skill) => skill.trade_slug === trade.slug)
                        }
                        onPress={() => toggle(trade)}
                      />
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function SkillChip({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s1,
        backgroundColor: selected ? colors.accentSoft : colors.surface,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        borderRadius: radius.full,
        paddingHorizontal: space.s3,
        paddingVertical: space.s2,
        opacity: pressed ? 0.8 : disabled ? 0.4 : 1,
      })}
    >
      {selected && <Ionicons name="checkmark" size={12} color={colors.accent} />}
      <AppText variant="caption" style={{ color: selected ? colors.accent : colors.textMuted }}>
        {label}
      </AppText>
    </Pressable>
  );
}
