import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { AppText } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

/**
 * BizBot's face.
 *
 * The assistant had no visual identity at all — its answers were grey bubbles
 * indistinguishable from a system error. A mark gives the replies an author,
 * which is most of what made them feel impersonal.
 */
export function BizBotMark({ size = 32, thinking = false }: { size?: number; thinking?: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!thinking) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [thinking, pulse]);

  return (
    <Animated.View
      style={{
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
      }}
    >
      <LinearGradient
        colors={['#7C4DFF', '#3B9EFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.32,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="sparkles" size={size * 0.52} color="#FFFFFF" />
      </LinearGradient>
    </Animated.View>
  );
}

/** The header lockup: mark, name, and what it is. */
export function BizBotHeader() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
      <BizBotMark size={28} />
      <View>
        <AppText variant="label">BizBot</AppText>
        <AppText variant="caption" color="textMuted" style={{ fontSize: 10, lineHeight: 12 }}>
          Grounded in official sources
        </AppText>
      </View>
    </View>
  );
}

/** Small pill naming where an answer came from. */
export function AnswerBadge({
  kind,
}: {
  kind: 'written' | 'quoted' | 'your-record';
}) {
  const { colors } = useTheme();
  const config = {
    written: { label: 'From official sources', icon: 'library-outline' as const, tone: colors.accent, soft: colors.accentSoft },
    quoted: { label: 'Quoted from the documents', icon: 'document-text-outline' as const, tone: colors.warning, soft: colors.warningSoft },
    'your-record': { label: 'From your myB record', icon: 'person-circle-outline' as const, tone: colors.success, soft: colors.successSoft },
  }[kind];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s1,
        alignSelf: 'flex-start',
        paddingHorizontal: space.s2,
        paddingVertical: 3,
        borderRadius: radius.full,
        backgroundColor: config.soft,
      }}
    >
      <Ionicons name={config.icon} size={11} color={config.tone} />
      <AppText variant="caption" style={{ color: config.tone, fontSize: 10 }}>
        {config.label}
      </AppText>
    </View>
  );
}
