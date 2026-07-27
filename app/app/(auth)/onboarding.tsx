import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Rating } from '@/components/ui/Rating';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { Badge } from '@/components/ui/badges';
import { FadeSlideIn, lightTap } from '@/components/ui/animated';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { ColorTokens } from '@/theme/tokens';

const TRADE_TILES: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'water', label: 'Plumbing' },
  { icon: 'flash', label: 'Electrical' },
  { icon: 'hammer', label: 'Carpentry' },
  { icon: 'color-palette', label: 'Painting' },
  { icon: 'car-sport', label: 'Mechanics' },
  { icon: 'leaf', label: 'Landscaping' },
];

/** Slide 1 art: the trades you can hire for, as glowing icon tiles. */
function TradesArt({ colors }: { colors: ColorTokens }) {
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s3, justifyContent: 'center', maxWidth: 300 }}
    >
      {TRADE_TILES.map(({ icon, label }, index) => (
        <FadeSlideIn key={label} delay={150 + index * 90} from="bottom" distance={24}>
          <View
            accessibilityLabel={label}
            style={{
              width: 88,
              height: 84,
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: space.s1,
              gap: 6,
            }}
          >
            <Ionicons name={icon} size={24} color={colors.accent} />
            {/* Wide enough for "Landscaping" on one line — it was clipping. */}
            <AppText
              variant="caption"
              color="textMuted"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ fontSize: 11, textAlign: 'center' }}
            >
              {label}
            </AppText>
          </View>
        </FadeSlideIn>
      ))}
    </View>
  );
}

/** Slide 2 art: a mock pro card — the portable reputation story. */
function ReputationArt({ colors }: { colors: ColorTokens }) {
  return (
    <FadeSlideIn delay={200} from="bottom" distance={24} style={{ width: '100%', maxWidth: 320 }}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.lg,
          padding: space.s4,
          gap: space.s3,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: radius.full,
              backgroundColor: colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText variant="h3" color="accent">
              MA
            </AppText>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
              <AppText variant="h3">Marcus A.</AppText>
              <Badge kind="topPro" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
              <Rating value={4.9} />
              <AppText variant="caption" color="textMuted">
                · 213 jobs
              </AppText>
            </View>
          </View>
        </View>
        <ProgressBar label="Level 3 · Trusted Pro" trailing="720 / 1000 XP" progress={0.72} />
      </View>
    </FadeSlideIn>
  );
}

/** Slide 3 art: the formalization checklist + BizBot bubble. */
function GrowArt({ colors }: { colors: ColorTokens }) {
  const steps = ['Get your TRN', 'Open a bank account', 'Register your business'];
  return (
    <View style={{ width: '100%', maxWidth: 320, gap: space.s3 }}>
      <FadeSlideIn delay={150} from="bottom" distance={24}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.lg,
            padding: space.s4,
            gap: space.s3,
          }}
        >
          {steps.map((step, index) => (
            <View key={step} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
              <Ionicons
                name={index < 2 ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={index < 2 ? colors.success : colors.textMuted}
              />
              <AppText variant="body" color={index < 2 ? undefined : 'textMuted'}>
                {step}
              </AppText>
            </View>
          ))}
        </View>
      </FadeSlideIn>
      <FadeSlideIn delay={420} from="left" distance={20}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.s2,
            backgroundColor: colors.accentSoft,
            borderRadius: radius.lg,
            borderBottomLeftRadius: radius.sm,
            padding: space.s3,
            alignSelf: 'flex-start',
            maxWidth: 300,
          }}
        >
          <Ionicons name="sparkles" size={16} color={colors.accent} />
          <AppText variant="bodySm" color="accent">
            BizBot: A TRN is free — mi can walk yuh through it.
          </AppText>
        </View>
      </FadeSlideIn>
    </View>
  );
}

interface Slide {
  key: string;
  title: string;
  body: string;
  art: (colors: ColorTokens) => React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    key: 'discover',
    title: 'All you need.\nOne place.',
    body: 'Find trusted, rated professionals for any job — plumbing, electrical, carpentry and more, right in your parish.',
    art: (colors) => <TradesArt colors={colors} />,
  },
  {
    key: 'reputation',
    title: 'Reputation that\ntravels with you.',
    body: 'Every completed job and review builds a track record you own — proof of your work for customers, banks and bigger contracts.',
    art: (colors) => <ReputationArt colors={colors} />,
  },
  {
    key: 'grow',
    title: 'From hustle\nto business.',
    body: 'When you’re ready, myB guides you step by step to formalize — and BizBot answers every question in plain language.',
    art: (colors) => <GrowArt colors={colors} />,
  },
];

/** Onboarding (design 02): animated value-prop carousel → sign up / sign in. */
export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<Animated.FlatList<Slide>>(null);

  const isLast = page === SLIDES.length - 1;

  const goTo = (index: number) => {
    listRef.current?.scrollToOffset({ offset: index * width, animated: true });
  };

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <Screen safeTop scroll={false} padded={false}>
      {/* Ambient glow — the diamond-blue arc from the brand visuals. */}
      <LinearGradient
        colors={[colors.accentSoft, 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 420 }}
        pointerEvents="none"
      />

      {/* Skip */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: space.s4,
        }}
      >
        <AppText variant="h3" color="accent">
          myB.
        </AppText>
        {!isLast && (
          <Pressable accessibilityRole="button" onPress={() => goTo(SLIDES.length - 1)} hitSlop={8}>
            <AppText variant="label" color="textMuted">
              Skip
            </AppText>
          </Pressable>
        )}
      </View>

      <Animated.FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={({ item, index }) => {
          const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
          return (
            <View style={{ width, padding: space.s6, justifyContent: 'center', gap: space.s8 }}>
              <Animated.View
                style={{
                  alignItems: 'center',
                  transform: [
                    {
                      translateX: scrollX.interpolate({
                        inputRange,
                        outputRange: [width * 0.35, 0, -width * 0.35],
                      }),
                    },
                  ],
                  opacity: scrollX.interpolate({ inputRange, outputRange: [0, 1, 0] }),
                }}
              >
                {item.art(colors)}
              </Animated.View>
              <Animated.View
                style={{
                  gap: space.s3,
                  opacity: scrollX.interpolate({ inputRange, outputRange: [0, 1, 0] }),
                }}
              >
                <AppText variant="h1" style={{ textAlign: 'center' }}>
                  {item.title}
                </AppText>
                <AppText variant="body" color="textMuted" style={{ textAlign: 'center' }}>
                  {item.body}
                </AppText>
              </Animated.View>
            </View>
          );
        }}
      />

      {/* Dots */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          paddingBottom: space.s5,
        }}
      >
        {SLIDES.map((slide, index) => {
          const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
          return (
            // The dot grows via scaleX, not width: scrollX drives the native
            // animated module, which only supports transforms and opacity.
            <Animated.View
              key={slide.key}
              style={{
                width: 8,
                height: 8,
                borderRadius: radius.full,
                backgroundColor: colors.accent,
                marginHorizontal: 4,
                transform: [
                  {
                    scaleX: scrollX.interpolate({
                      inputRange,
                      outputRange: [1, 3, 1],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
                opacity: scrollX.interpolate({
                  inputRange,
                  outputRange: [0.35, 1, 0.35],
                  extrapolate: 'clamp',
                }),
              }}
            />
          );
        })}
      </View>

      {/* CTAs */}
      <View style={{ paddingHorizontal: space.s4, paddingBottom: space.s6, gap: space.s4 }}>
        <Button
          title={isLast ? 'Get started' : 'Next'}
          fullWidth
          onPress={() => {
            if (isLast) {
              router.push('/(auth)/sign-up');
            } else {
              lightTap();
              goTo(page + 1);
            }
          }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.s1 }}>
          <AppText variant="bodySm" color="textMuted">
            Already have an account?
          </AppText>
          <Pressable accessibilityRole="link" onPress={() => router.push('/(auth)/sign-in')}>
            <AppText variant="bodySm" color="accent">
              Sign in
            </AppText>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
