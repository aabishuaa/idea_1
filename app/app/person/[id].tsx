import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn } from '@/components/ui/animated';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { supabase } from '@/lib/supabase';
import { openThread } from '@/lib/threads';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

interface PersonDetail {
  id: string;
  full_name: string;
  avatar_url: string | null;
  identity_verified: boolean;
  parish: string | null;
  is_worker: boolean;
  jobsBooked: number;
}

/**
 * Whoever is on the other side of a booking.
 *
 * You could always open a PRO's profile, but never a customer's — so a worker
 * deciding whether to accept a job could see a name and nothing else, and
 * every "With: …" line in the app was dead text. Trust has to run both ways:
 * the person asking you into their home is as worth checking as the person
 * you are letting in.
 *
 * If this person happens to be a worker, we hand straight over to the full
 * portfolio profile rather than showing a lesser version of it.
 */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { colors, isDark } = useTheme();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing'>('loading');

  const load = useCallback(async () => {
    if (!id) {
      setPhase('missing');
      return;
    }
    const [profileRes, jobsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, avatar_url, identity_verified, parish, is_worker')
        .eq('id', id)
        .maybeSingle(),
      // Jobs they have BOOKED — a customer's track record is how many times
      // they have actually gone through with hiring somebody.
      supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', id)
        .eq('status', 'completed'),
    ]);

    const row = profileRes.data as Omit<PersonDetail, 'jobsBooked'> | null;
    if (!row) {
      setPhase('missing');
      return;
    }
    setPerson({ ...row, jobsBooked: jobsRes.count ?? 0 });
    setPhase('ready');
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === 'loading') {
    return (
      <Screen scroll={false}>
        <LoadingState label="Loading profile…" />
      </Screen>
    );
  }

  if (phase === 'missing' || !person) {
    return (
      <Screen scroll={false}>
        <ErrorState
          title="Profile unavailable"
          message="This profile could not be loaded, or it is not shared with you."
          actionTitle="Go back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  // A worker has a richer profile already — send them there instead.
  if (person.is_worker) {
    return <Redirect href={{ pathname: '/worker/[id]', params: { id: person.id } }} />;
  }

  const isSelf = session?.user.id === person.id;

  return (
    <Screen padded={false}>
      <View style={{ height: 96 }}>
        <LinearGradient
          colors={isDark ? [colors.primary, '#0B0E16'] : [colors.primary, colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        />
      </View>

      <View style={{ paddingHorizontal: space.s4, gap: space.s5, paddingBottom: space.s12 }}>
        <View style={{ marginTop: -40, gap: space.s3, zIndex: 2, elevation: 2 }}>
          <View
            style={{
              alignSelf: 'flex-start',
              borderRadius: radius.full,
              borderWidth: 4,
              borderColor: colors.bg,
              backgroundColor: colors.bg,
              overflow: 'hidden',
            }}
          >
            <Avatar name={person.full_name} uri={person.avatar_url} size="xl" />
          </View>

          <View style={{ gap: space.s2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
              <AppText variant="h2" style={{ flexShrink: 1 }}>
                {person.full_name}
              </AppText>
              {person.identity_verified && <Badge kind="verified" compact />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s1 }}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <AppText variant="bodySm" color="textMuted">
                {person.parish ?? 'Jamaica'}
              </AppText>
            </View>
          </View>
        </View>

        {/* The two things that matter when deciding whether to take their job */}
        <FadeSlideIn>
          <Card>
            <View style={{ gap: space.s3 }}>
              <Row
                icon={person.identity_verified ? 'shield-checkmark' : 'shield-outline'}
                tone={person.identity_verified ? 'success' : undefined}
                label="Identity"
                value={
                  person.identity_verified
                    ? 'Verified with ID and a liveness check'
                    : 'Not verified yet'
                }
              />
              <Row
                icon="briefcase-outline"
                label="Hiring history"
                value={
                  person.jobsBooked === 0
                    ? 'No completed bookings yet'
                    : `${person.jobsBooked} job${person.jobsBooked === 1 ? '' : 's'} booked and completed`
                }
              />
            </View>
          </Card>
        </FadeSlideIn>

        {!isSelf && (
          <Button
            title="Message"
            variant="secondary"
            icon="chatbubble-ellipses-outline"
            fullWidth
            onPress={async () => {
              if (!session) return;
              // This person is a customer, so they are the customer side of
              // the thread and the signed-in user is the worker side.
              const threadId = await openThread({
                customerId: person.id,
                workerId: session.user.id,
              });
              if (threadId) router.push(`/thread/${threadId}`);
            }}
          />
        )}

        <AppText variant="caption" color="textMuted">
          myB only shows what someone has chosen to verify and what they have actually done on
          the platform. Nothing here is scraped from anywhere else.
        </AppText>
      </View>
    </Screen>
  );
}

function Row({
  icon,
  label,
  value,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: 'success';
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
      <Ionicons
        name={icon}
        size={18}
        color={tone === 'success' ? colors.success : colors.textMuted}
      />
      <View style={{ flex: 1, gap: 1 }}>
        <AppText variant="caption" color="textMuted">
          {label}
        </AppText>
        <AppText variant="bodySm" style={tone === 'success' ? { color: colors.success } : undefined}>
          {value}
        </AppText>
      </View>
    </View>
  );
}
