import React from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

/**
 * Renders BizBot's answer as structured text rather than one grey slab.
 *
 * The model is told to use short lists for steps, and the quoted-source tier
 * emits "[1] Title\nbody" blocks — both of which were being flattened into a
 * wall of prose. Handling three shapes (paragraph, bullet, numbered/citation
 * block) is the difference between something you can skim at an agency
 * counter and something you give up on.
 *
 * Deliberately not a markdown library: the surface is small, and shipping a
 * parser to render three cases would be the wrong trade in an app that has to
 * stay light.
 */
export function AnswerBody({ content }: { content: string }) {
  const { colors } = useTheme();

  const blocks = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return (
    <View style={{ gap: space.s2 }}>
      {blocks.map((line, index) => {
        // "[1] Getting a TRN" — a quoted source heading.
        const citation = /^\[(\d+)\]\s*(.*)$/.exec(line);
        if (citation) {
          return (
            <View
              key={index}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.s2,
                paddingTop: index === 0 ? 0 : space.s1,
              }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: radius.sm,
                  backgroundColor: colors.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppText variant="caption" style={{ color: colors.accent, fontSize: 10 }}>
                  {citation[1]}
                </AppText>
              </View>
              <AppText variant="label" style={{ flex: 1 }}>
                {citation[2]}
              </AppText>
            </View>
          );
        }

        // "- item" / "• item" / "* item"
        const bullet = /^[-•*]\s+(.*)$/.exec(line);
        if (bullet) {
          return (
            <View key={index} style={{ flexDirection: 'row', gap: space.s2 }}>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: colors.accent,
                  marginTop: 8,
                }}
              />
              <AppText variant="bodySm" style={{ flex: 1 }}>
                {bullet[1]}
              </AppText>
            </View>
          );
        }

        // "1. step"
        const numbered = /^(\d+)[.)]\s+(.*)$/.exec(line);
        if (numbered) {
          return (
            <View key={index} style={{ flexDirection: 'row', gap: space.s2 }}>
              <AppText variant="label" color="accent" style={{ width: 16 }}>
                {numbered[1]}.
              </AppText>
              <AppText variant="bodySm" style={{ flex: 1 }}>
                {numbered[2]}
              </AppText>
            </View>
          );
        }

        return (
          <AppText key={index} variant="bodySm" style={{ lineHeight: 21 }}>
            {line}
          </AppText>
        );
      })}
    </View>
  );
}
