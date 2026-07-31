import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { CategoryGrid } from '@/components/CategoryGrid';
import { WorkerCard } from '@/components/WorkerCard';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { StatusPill } from '@/components/ui/badges';
import { FadeSlideIn, ScalePress, Skeleton, Stagger } from '@/components/ui/animated';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useRequests } from '@/providers/RequestsProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { AppNotification, Job, MatchedWorker, Trade, WorkerProfile } from '@/types/db';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Shown before the trades table loads (and if it is empty). */
const FALLBACK_TRADES: Trade[] = [
  { slug: 'plumbing', label: 'Plumbing', emoji: '🔧' },
  { slug: 'electrical', label: 'Electrical', emoji: '⚡' },
  { slug: 'carpentry', label: 'Carpentry', emoji: '🪚' },
  { slug: 'painting', label: 'Painting', emoji: '🎨' },
];

/** Home (design 04): greeting, search, categories, top pros, recent bookings. */
export default function HomeScreen() {
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [topPros, setTopPros] = useState<MatchedWorker[] | null>(null);
  const [suggestion, setSuggestion] = useState<AppNotification | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null);
  const [alerts, setAlerts] = useState(0);
  const [pulse, setPulse] = useState<{ pros: number; services: number; reviews: number } | null>(
    null,
  );
  const { count: waiting } = useRequests();

  const load = useCallback(async () => {
    if (!session) return;
    const userId = session.user.id;
    const [tradesRes, prosRes, suggestionRes, jobsRes, workerRes, unreadRes] = await Promise.all([
      // Popularity, not a fixed list: ranked by real bookings in the last
      // 90 days so the home grid reflects what people actually hire for.
      supabase.rpc('get_popular_trades', { p_limit: 8 }),
      supabase.rpc('match_workers', { p_limit: 6 }),
      supabase
        .from('notifications')
        .select('*')
        .eq('type', 'formalization_suggestion')
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('jobs')
        .select('*')
        .or(`customer_id.eq.${userId},worker_id.eq.${userId}`)
        .order('requested_at', { ascending: false })
        .limit(3),
      profile?.is_worker
        ? supabase.from('worker_profiles').select('*').eq('user_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null),
    ]);
    setTrades((tradesRes.data as Trade[] | null) ?? []);
    setTopPros((prosRes.data as MatchedWorker[] | null) ?? []);
    setSuggestion((suggestionRes.data as AppNotification | null) ?? null);
    setRecentJobs((jobsRes.data as Job[] | null) ?? []);
    setWorkerProfile((workerRes.data as WorkerProfile | null) ?? null);
    setAlerts(('count' in unreadRes ? unreadRes.count : 0) ?? 0);

    // The marketplace, in three real numbers. Counted, never hardcoded — a
    // pitch slide that claims scale should be reading the same database the
    // demo is running on.
    const [proCountRes, serviceCountRes, reviewCountRes] = await Promise.all([
      supabase.from('worker_profiles').select('user_id', { count: 'exact', head: true }),
      supabase.from('trades').select('slug', { count: 'exact', head: true }),
      supabase.from('reviews').select('id', { count: 'exact', head: true }),
    ]);
    setPulse({
      pros: proCountRes.count ?? 0,
      services: serviceCountRes.count ?? 0,
      reviews: reviewCountRes.count ?? 0,
    });
  }, [session, profile?.is_worker]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const firstName = profile?.full_name.split(' ')[0] ?? 'there';

  // Level from the portable reputation score (same rule as Profile).
  const xp = Math.round(Number(workerProfile?.reputation ?? 0) * 10);
  const level = Math.min(4, Math.floor(xp / 250) + 1);

  return (
    <Screen safeTop>
      <LinearGradient
        colors={[colors.accentSoft, 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 240 }}
        pointerEvents="none"
      />
      <View style={{ gap: space.s5 }}>
        <Stagger interval={60} gap={space.s5}>
          {/* App bar: ☰ · myB. · notifications · search */}
          <AppHeader alerts={alerts} />

          {/* Hero: who you are, what's live, what the market looks like.
              The first screen has to say more than hello — it is where the
              three pillars have to be legible: a reputation you own, a market
              you can search, a path to being formal. */}
          <View style={{ gap: space.s4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
              <Avatar name={profile?.full_name ?? 'myB'} uri={profile?.avatar_url} size="md" />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="caption" color="textMuted">
                  {greeting()}
                </AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                  <AppText variant="h2" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {firstName}
                  </AppText>
                  {/* The wave is back, as an icon rather than an emoji: emoji
                      render at the system font's whim and never match the
                      type or the theme. */}
                  <WavingHand />
                </View>
              </View>
              <View
                style={{
                  paddingHorizontal: space.s3,
                  paddingVertical: space.s1,
                  borderRadius: radius.full,
                  backgroundColor: colors.accentSoft,
                }}
              >
                <AppText variant="caption" color="accent">
                  {profile?.is_worker ? 'Pro' : 'Customer'}
                </AppText>
              </View>
            </View>

            {/* Live marketplace pulse — counted from the database, not copy.
                Each stat carries its own colour so the row reads as three
                facts about a living market rather than one grey panel. */}
            <View style={{ flexDirection: 'row', gap: space.s2 }}>
              <Pulse
                value={pulse ? formatCount(pulse.pros) : '—'}
                label="pros listed"
                icon="people"
                tint={colors.accent}
                soft={colors.accentSoft}
                onPress={() => router.push('/search')}
              />
              <Pulse
                value={pulse ? formatCount(pulse.services) : '—'}
                label="services"
                icon="color-wand"
                tint={colors.success}
                soft={colors.successSoft}
                onPress={() => router.push('/search')}
              />
              <Pulse
                value={pulse ? formatCount(pulse.reviews) : '—'}
                label="reviews"
                icon="star"
                tint={colors.star}
                soft={colors.warningSoft}
              />
            </View>
          </View>

          {/* Requests waiting — the most urgent thing a pro can see, so it
              sits above everything the app wants them to do. */}
          {waiting > 0 && (
            <ScalePress haptic onPress={() => router.push('/(tabs)/bookings')}>
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: radius.lg,
                  padding: space.s4,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.s3,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.md,
                    backgroundColor: 'rgba(255,255,255,0.22)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="hand-left" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label" style={{ color: '#FFFFFF' }}>
                    {waiting === 1 ? '1 job request waiting' : `${waiting} job requests waiting`}
                  </AppText>
                  <AppText variant="bodySm" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    Answering quickly lifts your reputation score.
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
              </LinearGradient>
            </ScalePress>
          )}

          {/* Search, and — for anyone who cannot yet name what they need —
              Explore. A search box is useless if you do not know the word for
              the thing you want, which is most first-time customers. */}
          <View style={{ flexDirection: 'row', gap: space.s2 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search for a service"
              onPress={() => router.push('/search')}
              style={{ flex: 1 }}
            >
              <View pointerEvents="none">
                <Input icon="search" placeholder="Search a service or a name" editable={false} />
              </View>
            </Pressable>
            <ScalePress
              haptic
              onPress={() => router.push('/explore')}
              containerStyle={{ alignSelf: 'stretch' }}
            >
              <View
                accessibilityRole="button"
                accessibilityLabel="Explore work from pros"
                style={{
                  height: '100%',
                  minWidth: 60,
                  paddingHorizontal: space.s3,
                  borderRadius: radius.md,
                  backgroundColor: colors.accentSoft,
                  borderWidth: 1,
                  borderColor: colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                }}
              >
                <Ionicons name="grid-outline" size={18} color={colors.accent} />
                <AppText variant="caption" color="accent" style={{ fontSize: 10 }}>
                  Explore
                </AppText>
              </View>
            </ScalePress>
          </View>

          {/* Category cards — most-booked services right now */}
          <View style={{ gap: space.s3 }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <AppText variant="label" color="textMuted">
                Popular right now
              </AppText>
            </View>
            <CategoryGrid
              trades={trades.length > 0 ? trades : FALLBACK_TRADES}
              preserveOrder
              onSelect={(slug) =>
                router.push({ pathname: '/search', params: { trade: slug } })
              }
            />
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/search')}
              style={{ alignSelf: 'flex-end' }}
              hitSlop={8}
            >
              <AppText variant="bodySm" color="accent">
                View all →
              </AppText>
            </Pressable>
          </View>

          {/* Verification prompt — trust is the product; surface the gate. */}
          {profile && !profile.identity_verified && (
            <Card raised onPress={() => router.push('/verification')}>
              <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'center' }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.md,
                    backgroundColor: colors.accentSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="shield-checkmark" size={22} color={colors.accent} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label">Verify your identity</AppText>
                  <AppText variant="bodySm" color="textMuted">
                    ID + liveness check unlocks the Verified badge people trust.
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </Card>
          )}

          {/* Formalization suggestion (FR-BIZ-6: suggest, never enroll) */}
          {suggestion && (
            <Card raised onPress={() => void markSuggestionRead(suggestion, () => router.push('/formalize'))}>
              <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'center' }}>
                <Ionicons name="ribbon" size={28} color={colors.accent} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label">{suggestion.title}</AppText>
                  <AppText variant="bodySm" color="textMuted">
                    {suggestion.body}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </Card>
          )}

          {/* BizBot is worker-facing: it answers business-formalization
              questions, which a customer-only account has no use for. */}
          {profile?.is_worker && (
          <ScalePress haptic onPress={() => router.push('/formalize/bizbot')}>
            <LinearGradient
              colors={[colors.primary, colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: radius.lg, padding: space.s4 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.md,
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="sparkles" size={22} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label" style={{ color: '#FFFFFF' }}>
                    Ask BizBot
                  </AppText>
                  <AppText
                    variant="bodySm"
                    numberOfLines={2}
                    style={{ color: 'rgba(255,255,255,0.85)' }}
                  >
                    {profile?.is_worker
                      ? '“Do I need a TRN?” · “What is GCT?” — answers from official sources.'
                      : 'Questions about starting a business in Jamaica? Get plain answers, free.'}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
              </View>
            </LinearGradient>
          </ScalePress>
          )}

          {/* Worker snapshot: level + the doors into the dashboard and earnings */}
          {profile?.is_worker && workerProfile && (
            <Card>
              <View style={{ gap: space.s4 }}>
                <ProgressBar
                  label={`Level ${level} · ${level >= 3 ? 'Trusted Pro' : 'Rising'}`}
                  trailing={`${xp} / ${level * 250} XP`}
                  progress={(xp % 250) / 250}
                  helper={`${workerProfile.jobs_completed} jobs completed · rating ${Number(workerProfile.rating_avg).toFixed(1)}`}
                />
                {/* Full-width stacked-icon tiles: the old inline pills were
                    a row of two 18px icons plus a label, which clipped on a
                    narrow phone and read as an afterthought. */}
                <View style={{ flexDirection: 'row', gap: space.s3 }}>
                  <ScalePress haptic onPress={() => router.push('/dashboard')} containerStyle={{ flex: 1 }}>
                    <View
                      style={{
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: space.s2,
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: colors.border,
                        paddingVertical: space.s4,
                        minHeight: 88,
                      }}
                    >
                      <Ionicons name="grid" size={22} color={colors.accent} />
                      <AppText variant="label" numberOfLines={1}>
                        Dashboard
                      </AppText>
                    </View>
                  </ScalePress>
                  <ScalePress haptic onPress={() => router.push('/earnings')} containerStyle={{ flex: 1 }}>
                    <View
                      style={{
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: space.s2,
                        borderRadius: radius.md,
                        backgroundColor: colors.accentSoft,
                        borderWidth: 1,
                        borderColor: colors.accent,
                        paddingVertical: space.s4,
                        minHeight: 88,
                      }}
                    >
                      <Ionicons name="wallet" size={22} color={colors.accent} />
                      <AppText variant="label" color="accent" numberOfLines={1}>
                        Earnings
                      </AppText>
                    </View>
                  </ScalePress>
                </View>
              </View>
            </Card>
          )}

          {/* Grow prompt for customers who haven't listed their skills yet */}
          {profile && !profile.is_worker && (
            <Card onPress={() => router.push('/worker-setup')}>
              <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'center' }}>
                <Ionicons name="trending-up" size={26} color={colors.accent} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label">Have a skill? Earn with it.</AppText>
                  <AppText variant="bodySm" color="textMuted">
                    List your services and start building your reputation.
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </Card>
          )}

          {/* Top pros */}
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <AppText variant="h3">Top rated professionals</AppText>
            <Pressable accessibilityRole="link" onPress={() => router.push('/search')} hitSlop={8}>
              <AppText variant="bodySm" color="accent">
                See all
              </AppText>
            </Pressable>
          </View>

          {topPros === null ? (
            <View style={{ gap: space.s4 }}>
              <Skeleton height={128} radius={radius.lg} />
              <Skeleton height={128} radius={radius.lg} />
            </View>
          ) : topPros.length === 0 ? (
            <Card>
              <AppText variant="bodySm" color="textMuted">
                No workers yet — check back soon, or become the first pro in your parish
                from your profile.
              </AppText>
            </Card>
          ) : (
            <View style={{ gap: space.s4 }}>
              {topPros.map((worker, index) => (
                <FadeSlideIn key={worker.worker_id} delay={120 + index * 80}>
                  <WorkerCard
                    worker={worker}
                    onPress={() => router.push(`/worker/${worker.worker_id}`)}
                  />
                </FadeSlideIn>
              ))}
            </View>
          )}

          {/* Recent bookings */}
          {recentJobs.length > 0 && (
            <View style={{ gap: space.s4 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <AppText variant="h3">Recent bookings</AppText>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push('/(tabs)/bookings')}
                  hitSlop={8}
                >
                  <AppText variant="bodySm" color="accent">
                    View all
                  </AppText>
                </Pressable>
              </View>
              {recentJobs.map((job) => (
                <Card key={job.id} onPress={() => router.push(`/job/${job.id}`)}>
                  <View style={{ gap: space.s2 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: space.s2,
                      }}
                    >
                      <AppText variant="label" style={{ flex: 1 }} numberOfLines={1}>
                        {job.title}
                      </AppText>
                      <StatusPill status={job.status} />
                    </View>
                    <AppText variant="caption" color="textMuted">
                      {formatDateTime(job.requested_at)}
                      {job.parish ? ` · ${job.parish}` : ''}
                    </AppText>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </Stagger>
      </View>
    </Screen>
  );
}

/** A hand that actually waves. Rotation only, so it stays on the native driver. */
function WavingHand() {
  const { colors } = useTheme();
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wave, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(wave, { toValue: -1, duration: 180, useNativeDriver: true }),
        Animated.timing(wave, { toValue: 0, duration: 180, useNativeDriver: true }),
        // A long pause, so it greets you rather than fidgeting forever.
        Animated.delay(2600),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [wave]);

  return (
    <Animated.View
      style={{
        transform: [
          { rotate: wave.interpolate({ inputRange: [-1, 1], outputRange: ['-18deg', '18deg'] }) },
        ],
      }}
    >
      <Ionicons name="hand-left" size={20} color={colors.star} />
    </Animated.View>
  );
}

/** 1124 → "1.1k". Keeps three stats on one line on a small phone. */
function formatCount(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}k`;
}

/** One live number, in its own colour, rising into place. */
function Pulse({
  value,
  label,
  icon,
  tint,
  soft,
  onPress,
}: {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  soft: string;
  onPress?: () => void;
}) {
  const enter = useRef(new Animated.Value(0)).current;
  const ready = value !== '\u2014';

  useEffect(() => {
    if (!ready) return;
    Animated.spring(enter, {
      toValue: 1,
      speed: 14,
      bounciness: 10,
      useNativeDriver: true,
    }).start();
  }, [ready, enter]);

  const body = (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: space.s1,
        paddingVertical: space.s3,
        borderRadius: radius.lg,
        backgroundColor: soft,
        borderWidth: 1,
        borderColor: soft,
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={14} color="#FFFFFF" />
      </View>
      <Animated.View
        style={{
          opacity: enter,
          transform: [
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
          ],
        }}
      >
        <AppText variant="h3" style={{ color: tint }}>
          {value}
        </AppText>
      </Animated.View>
      <AppText
        variant="caption"
        color="textMuted"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontSize: 11 }}
      >
        {label}
      </AppText>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.8 : 1 })}
    >
      {body}
    </Pressable>
  );
}

async function markSuggestionRead(suggestion: AppNotification, then: () => void) {
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', suggestion.id);
  then();
}
