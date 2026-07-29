import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { Badge } from '@/components/ui/badges';
import { FadeSlideIn, Skeleton, Stagger } from '@/components/ui/animated';
import { EmptyState } from '@/components/ui/states';
import { shareReputationPassport } from '@/features/reputation/passport';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { WorkerProfile } from '@/types/db';

interface ReputationRow {
  score: number;
  calculated_at: string;
  components: {
    review?: number;
    completion?: number;
    response?: number;
    disputes?: number;
    rating_avg?: number;
    rating_count?: number;
    jobs_completed?: number;
  };
}

/** The four inputs to the score, with what each one actually measures. */
const FACTORS: {
  key: 'review' | 'completion' | 'response' | 'disputes';
  label: string;
  weight: number;
  icon: keyof typeof Ionicons.glyphMap;
  explain: string;
}[] = [
  {
    key: 'review',
    label: 'Customer ratings',
    weight: 40,
    icon: 'star',
    explain: 'The average star rating across every review you have received.',
  },
  {
    key: 'completion',
    label: 'Jobs finished',
    weight: 25,
    icon: 'checkmark-done',
    explain: 'How often a job you accept gets completed rather than cancelled.',
  },
  {
    key: 'response',
    label: 'Response time',
    weight: 20,
    icon: 'time',
    explain: 'The share of job requests you answer within 24 hours.',
  },
  {
    key: 'disputes',
    label: 'Clean record',
    weight: 15,
    icon: 'shield-checkmark',
    explain: 'Stays at full marks unless a dispute is raised against you.',
  },
];

/**
 * The reputation passport — the "portable reputation" pillar made visible.
 *
 * The point of myB is that this record belongs to the worker, not the
 * platform: it is the alternative credit data an informal worker has never
 * been able to produce. So this screen shows exactly how the number is built
 * (no black box), and lets them share it as a summary a bank, a landlord or a
 * big customer can read.
 */
export default function ReputationScreen() {
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [reputation, setReputation] = useState<ReputationRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [workerRes, repRes] = await Promise.all([
      supabase.from('worker_profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
      supabase
        .from('reputation_scores')
        .select('score, calculated_at, components')
        .eq('worker_id', session.user.id)
        .maybeSingle(),
    ]);
    setWorker((workerRes.data as WorkerProfile | null) ?? null);
    setReputation((repRes.data as ReputationRow | null) ?? null);
    setLoaded(true);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /**
   * Export the record as a PDF document.
   *
   * It used to be nine lines of plain text in a share sheet. That is fine for a
   * WhatsApp group and no use at all for the job this feature exists to do:
   * give a worker with no payslip something a loan officer or a landlord will
   * accept as evidence. A "portable reputation" that arrives as an SMS is not
   * portable in any sense that matters.
   *
   * The text version survives as the fallback, because a device that cannot
   * print should still be able to send something.
   */
  const exportRecord = async () => {
    if (!worker) return;
    setExporting(true);
    const result = await shareReputationPassport({
      name: profile?.full_name ?? 'myB pro',
      headline: worker.headline,
      parish: worker.parish,
      score: Number(worker.reputation),
      ratingAvg: Number(worker.rating_avg),
      ratingCount: worker.rating_count,
      jobsCompleted: worker.jobs_completed,
      identityVerified: Boolean(profile?.identity_verified),
      memberSince: profile?.created_at ?? null,
      calculatedAt: reputation?.calculated_at ?? null,
      components: reputation?.components ?? {},
    });
    setExporting(false);

    if (result.ok) return;
    Alert.alert(
      'Could not create the PDF',
      `${result.message}\n\nSend it as text instead?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send as text', onPress: () => void shareAsText() },
      ],
    );
  };

  /** The fallback. Kept deliberately — see exportRecord. */
  const shareAsText = async () => {
    if (!worker) return;
    const lines = [
      `${profile?.full_name ?? 'myB pro'} — myB reputation record`,
      '',
      `Reputation score: ${Number(worker.reputation).toFixed(0)}/100`,
      `Rating: ${Number(worker.rating_avg).toFixed(1)}★ from ${worker.rating_count} verified reviews`,
      `Jobs completed: ${worker.jobs_completed}`,
      `Trade: ${worker.headline}`,
      `Parish: ${worker.parish}`,
      profile?.identity_verified ? 'Identity: verified' : 'Identity: not yet verified',
      '',
      'Every review here is tied to a real completed job on myB.',
    ];
    await Share.share({ message: lines.join('\n') });
  };

  if (!loaded) {
    return (
      <Screen>
        <View style={{ gap: space.s4 }}>
          <Skeleton height={180} radius={radius.lg} />
          <Skeleton height={120} radius={radius.lg} />
        </View>
      </Screen>
    );
  }

  if (!worker) {
    return (
      <Screen>
        <EmptyState
          title="No reputation record yet"
          message="Reputation is built from completed jobs and reviews. List your services and your record starts building from the first job."
          actionTitle="Set up your worker profile"
          onAction={() => router.push('/worker-setup')}
        />
      </Screen>
    );
  }

  const score = Number(worker.reputation);
  const components = reputation?.components ?? {};
  const xp = Math.round(score * 10);
  const level = Math.min(4, Math.floor(xp / 250) + 1);

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        <Stagger interval={70} gap={space.s5}>
          {/* The passport itself */}
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: radius.lg, padding: space.s5, gap: space.s4 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="overline" style={{ color: 'rgba(255,255,255,0.8)' }}>
                myB REPUTATION RECORD
              </AppText>
              <Ionicons name="shield-checkmark" size={18} color="rgba(255,255,255,0.9)" />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s2 }}>
              <AppText variant="display" style={{ color: '#FFFFFF', fontSize: 52, lineHeight: 56 }}>
                {score.toFixed(0)}
              </AppText>
              <AppText variant="h3" style={{ color: 'rgba(255,255,255,0.7)', paddingBottom: 8 }}>
                / 100
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', gap: space.s5 }}>
              <View>
                <AppText variant="label" style={{ color: '#FFFFFF' }}>
                  {Number(worker.rating_avg).toFixed(1)}★
                </AppText>
                <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {worker.rating_count} reviews
                </AppText>
              </View>
              <View>
                <AppText variant="label" style={{ color: '#FFFFFF' }}>
                  {worker.jobs_completed}
                </AppText>
                <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  jobs completed
                </AppText>
              </View>
              <View>
                <AppText variant="label" style={{ color: '#FFFFFF' }}>
                  Level {level}
                </AppText>
                <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {level >= 3 ? 'Trusted Pro' : 'Rising'}
                </AppText>
              </View>
            </View>
          </LinearGradient>

          {/* Why this matters — the pitch, in the product */}
          <Card>
            <View style={{ flexDirection: 'row', gap: space.s3 }}>
              <Ionicons name="briefcase-outline" size={22} color={colors.accent} />
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="label">This record belongs to you</AppText>
                <AppText variant="bodySm" color="textMuted">
                  Informal work leaves no paper trail, so banks have nothing to assess. Every
                  review here is tied to a real completed job — that is evidence of income and
                  reliability you can take to a lender, a landlord, or a bigger client.
                </AppText>
              </View>
            </View>
          </Card>

          {/* How the number is built */}
          <View style={{ gap: space.s3 }}>
            <AppText variant="h3">How your score is calculated</AppText>
            <AppText variant="bodySm" color="textMuted">
              No black box and no AI guesswork — the score is a fixed formula over your own
              job history, recalculated every time a job completes or a review lands.
            </AppText>

            {FACTORS.map((factor, index) => {
              const value = components[factor.key];
              return (
                <FadeSlideIn key={factor.key} delay={index * 60}>
                  <Card>
                    <View style={{ gap: space.s3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
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
                          <Ionicons name={factor.icon} size={17} color={colors.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppText variant="label">{factor.label}</AppText>
                          <AppText variant="caption" color="textMuted">
                            {factor.weight}% of your score
                          </AppText>
                        </View>
                        {value != null && (
                          <AppText variant="label" color="accent">
                            {Math.round(value * 100)}%
                          </AppText>
                        )}
                      </View>
                      {value != null && <ProgressBar progress={value} />}
                      <AppText variant="caption" color="textMuted">
                        {factor.explain}
                      </AppText>
                    </View>
                  </Card>
                </FadeSlideIn>
              );
            })}
          </View>

          {/* Trust tiers */}
          <Card onPress={() => router.push('/verification')}>
            <View style={{ gap: space.s3 }}>
              <AppText variant="label">Trust badges</AppText>
              <View style={{ flexDirection: 'row', gap: space.s2, flexWrap: 'wrap' }}>
                {profile?.identity_verified && <Badge kind="verified" />}
                {worker.tier_skill && <Badge kind="topPro" />}
                {worker.tier_business && <Badge kind="pro" />}
                {!profile?.identity_verified && !worker.tier_skill && (
                  <AppText variant="bodySm" color="textMuted">
                    Verify your identity to earn your first badge.
                  </AppText>
                )}
              </View>
              <AppText variant="caption" color="textMuted">
                Badges sit alongside your score and are what customers scan for first.
              </AppText>
            </View>
          </Card>

          <Button
            title="Download my reputation record"
            icon="document-text-outline"
            fullWidth
            loading={exporting}
            onPress={() => void exportRecord()}
          />
          <Button
            title="Send as a text summary"
            variant="secondary"
            icon="share-outline"
            fullWidth
            onPress={() => void shareAsText()}
          />

          <AppText variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
            A one-page PDF built on your phone, showing the score and exactly how it
            was calculated — the document you hand a bank, a landlord or a big
            customer. myB never sends your record anywhere on its own.
          </AppText>
        </Stagger>
      </View>
    </Screen>
  );
}
