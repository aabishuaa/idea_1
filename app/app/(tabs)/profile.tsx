import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/badges';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { Stagger, successTap } from '@/components/ui/animated';
import { pickImage, publicUrl, uploadUserImage } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { PortfolioItem, WorkerProfile } from '@/types/db';

/*
  Avatar + camera-badge geometry. Derived, not eyeballed — see the comment at
  the Pressable for why the previous hand-picked offsets put the badge inside
  the photo.

  AVATAR_PX must match Avatar's 'xl' size. The badge centre sits
  (AVATAR_PX/2 + BADGE_PX/2) from the avatar centre along the 45° diagonal,
  which is √2 × BADGE_OFFSET_AXIS on each axis, leaving ~1px of overlap so the
  badge reads as attached to the photo rather than floating beside it.
*/
const AVATAR_PX = 88;
const BADGE_PX = 28;
/** Room on every side so the badge never overflows the parent (Android clips). */
const AVATAR_INSET = 10;
const AVATAR_BOX = AVATAR_PX + AVATAR_INSET * 2;
/** Per-axis distance from the avatar's top-left to the badge's top-left. */
const BADGE_OFFSET = AVATAR_INSET + 70;

interface MenuRow {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
}

/** Profile (design 10): identity, level progress, account menu. */
export default function ProfileScreen() {
  const { profile, signOut, refreshProfile } = useAuth();
  const { colors, isDark, setPreference } = useTheme();
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    await refreshProfile();
    if (!profile?.id) return;
    const [{ data }, portfolioRes] = await Promise.all([
      supabase
        .from('worker_profiles')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle<WorkerProfile>(),
      supabase
        .from('portfolio_items')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(6),
    ]);
    setPortfolio((portfolioRes.data as PortfolioItem[] | null) ?? []);
    setWorkerProfile(data ?? null);
    // refreshProfile intentionally omitted from deps: focus-triggered reload only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!profile) return <Screen safeTop scroll={false}>{null}</Screen>;

  /** The photo people see first, changed from where they look for it. */
  const changeAvatar = async () => {
    const image = await pickImage({ square: true });
    if (!image) return;
    setUploading(true);
    // One filename so old avatars do not pile up; the cache buster stops the
    // previous image from being served in its place.
    const path = await uploadUserImage('portfolios', profile.id, image, 'avatar');
    if (path) {
      await supabase
        .from('profiles')
        .update({ avatar_url: `${publicUrl('portfolios', path)}?v=${Date.now()}` })
        .eq('id', profile.id);
      successTap();
      await load();
    }
    setUploading(false);
  };

  // Level from the portable reputation score (deterministic, explainable):
  // XP = reputation × 10 (0–1000), 250 XP per level.
  const xp = Math.round(Number(workerProfile?.reputation ?? 0) * 10);
  const level = Math.min(4, Math.floor(xp / 250) + 1);
  const nextLevelXp = level * 250;

  const rows: MenuRow[] = [
    {
      icon: 'person-circle-outline',
      label: 'Account & password',
      onPress: () => router.push('/account'),
    },
    {
      icon: 'shield-checkmark-outline',
      label: 'Verification',
      detail: profile.identity_verified ? 'Verified' : 'Not verified',
      onPress: () => router.push('/verification'),
    },
    ...(profile.is_worker
      ? ([
          {
            icon: 'briefcase-outline',
            label: 'Your work & services',
            onPress: () => router.push('/worker-setup'),
          },
          {
            icon: 'wallet-outline',
            label: 'Earnings',
            onPress: () => router.push('/earnings'),
          },
          {
            icon: 'ribbon-outline',
            label: 'Formalize your business',
            onPress: () => router.push('/formalize'),
          },
        ] satisfies MenuRow[])
      : ([
          {
            icon: 'construct-outline',
            label: 'Become a worker',
            detail: 'Offer your skills',
            onPress: () => router.push('/worker-setup'),
          },
        ] satisfies MenuRow[])),
    {
      icon: isDark ? 'sunny-outline' : 'moon-outline',
      label: isDark ? 'Switch to light theme' : 'Switch to dark theme',
      onPress: () => setPreference(isDark ? 'light' : 'dark'),
    },
  ];

  return (
    <Screen safeTop>
      <View style={{ gap: space.s6 }}>
        <Stagger interval={70} gap={space.s6}>
        {/* Identity header */}
        <View style={{ alignItems: 'center', gap: space.s3, paddingTop: space.s4 }}>
          {/*
            The camera badge sits on the OUTSIDE edge of the photo.

            It used to be pinned to right:-2/bottom:-2 of the avatar, but the
            avatar is a circle inscribed in a square box: the box corner is
            ~14px further out than the circle's edge on the diagonal, so
            "just past the corner" landed a long way INSIDE the photo. The
            badge has to be placed against the circle, not the box.

            AVATAR_PX is the circle (Avatar 'xl'), so its centre is at
            AVATAR_PX/2 with radius AVATAR_PX/2. Sitting the badge tangent to
            that means offsetting its centre by (r + badgeRadius) along the
            45° diagonal. The wrapper is deliberately larger than the avatar so
            the badge stays inside its parent's bounds — Android clips
            absolutely-positioned children that overflow, so negative offsets
            would work on iOS and silently crop here.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change your photo"
            onPress={changeAvatar}
            disabled={uploading}
            style={{ width: AVATAR_BOX, height: AVATAR_BOX }}
          >
            <View style={{ position: 'absolute', left: AVATAR_INSET, top: AVATAR_INSET }}>
              <Avatar name={profile.full_name} uri={profile.avatar_url} size="xl" />
            </View>
            <View
              style={{
                position: 'absolute',
                left: BADGE_OFFSET,
                top: BADGE_OFFSET,
                width: BADGE_PX,
                height: BADGE_PX,
                borderRadius: BADGE_PX / 2,
                backgroundColor: colors.primary,
                // A ring in the page colour is what separates the badge from
                // the photo behind it; 2px read as a dark outline, not a gap.
                borderWidth: 3,
                borderColor: colors.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={15} color="#FFFFFF" />
              )}
            </View>
          </Pressable>
          <View style={{ alignItems: 'center', gap: space.s1 }}>
            <AppText variant="h2">{profile.full_name}</AppText>
            <AppText variant="bodySm" color="textMuted">
              {workerProfile?.headline || (profile.parish ?? 'Jamaica')}
            </AppText>
            <View style={{ flexDirection: 'row', gap: space.s2 }}>
              {profile.identity_verified && <Badge kind="verified" />}
              {workerProfile?.tier_skill && <Badge kind="topPro" />}
              {workerProfile?.tier_business && <Badge kind="pro" />}
            </View>
          </View>
        </View>

        {/* Your public portfolio — what a customer actually sees. Workers
            consistently underestimate this page, so surface it with the work
            already on it and a direct way in. */}
        {workerProfile && (
          <Card
            onPress={() => router.push({ pathname: '/worker/[id]', params: { id: profile.id } })}
          >
            <View style={{ gap: space.s3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                <Ionicons name="images-outline" size={18} color={colors.accent} />
                <AppText variant="label" style={{ flex: 1 }}>
                  Your public profile
                </AppText>
                <AppText variant="caption" color="accent">
                  {portfolio.length > 0 ? `${portfolio.length} photos` : 'Add work'}
                </AppText>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>

              {portfolio.length > 0 ? (
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {portfolio.slice(0, 5).map((item) => (
                    <Image
                      key={item.id}
                      source={{ uri: publicUrl('portfolios', item.storage_path) }}
                      style={{
                        flex: 1,
                        aspectRatio: 1,
                        borderRadius: radius.sm,
                        backgroundColor: colors.surfaceRaised,
                      }}
                      resizeMode="cover"
                    />
                  ))}
                </View>
              ) : (
                <AppText variant="caption" color="textMuted">
                  Photos of finished jobs are the fastest way to win work — customers pick the
                  pro they can picture doing it.
                </AppText>
              )}
            </View>
          </Card>
        )}

        {/* Level / reputation progress (worker) */}
        {workerProfile && (
          <Card>
            <ProgressBar
              label={`Level ${level} · ${level >= 3 ? 'Pro' : 'Rising'}`}
              trailing={`${xp} / ${nextLevelXp} XP`}
              progress={(xp % 250) / 250}
              helper={`Reputation ${Number(workerProfile.reputation).toFixed(0)} · ${workerProfile.jobs_completed} jobs completed`}
            />
          </Card>
        )}

        {/* Menu */}
        <Card style={{ padding: 0 }}>
          {rows.map((row, index) => (
            <Pressable
              key={row.label}
              accessibilityRole="button"
              onPress={row.onPress}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.s3,
                padding: space.s4,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name={row.icon} size={22} color={colors.accent} />
              <AppText variant="body" style={{ flex: 1 }}>
                {row.label}
              </AppText>
              {row.detail && (
                <AppText variant="caption" color="textMuted">
                  {row.detail}
                </AppText>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </Card>

        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.7 : 1 })}
        >
          <AppText variant="label" color="error">
            Log out
          </AppText>
        </Pressable>
        </Stagger>
      </View>
    </Screen>
  );
}
