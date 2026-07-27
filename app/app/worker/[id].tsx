import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Badge, Chip } from '@/components/ui/badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Rating } from '@/components/ui/Rating';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { lightTap, successTap } from '@/components/ui/animated';
import { formatRate, timeAgo } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { Profile, Review, ServiceDescription, WorkerProfile } from '@/types/db';

interface WorkerDetail {
  profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'identity_verified'>;
  worker: WorkerProfile;
  services: ServiceDescription[];
  reviews: (Review & { reviewer: { full_name: string } | null })[];
}

/** Pro profile (design 06): identity, services, bio, rate + Book now. */
export default function WorkerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [detail, setDetail] = useState<WorkerDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setFailed(false);
    const [profileRes, workerRes, servicesRes, reviewsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, avatar_url, identity_verified')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('worker_profiles').select('*').eq('user_id', id).maybeSingle(),
      supabase.from('service_descriptions').select('*').eq('user_id', id),
      supabase
        .from('reviews')
        .select('*, reviewer:profiles!reviews_reviewer_id_fkey(full_name)')
        .eq('worker_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    if (session) {
      const { data: favorite } = await supabase
        .from('favorites')
        .select('worker_id')
        .eq('user_id', session.user.id)
        .eq('worker_id', id)
        .maybeSingle();
      setSaved(favorite != null);
    }

    if (!workerRes.data) {
      setFailed(true);
      return;
    }
    // profileRes can be null if this profile is not readable — render the
    // worker row rather than crashing on a missing name.
    const workerRow = workerRes.data as WorkerProfile;
    setDetail({
      profile: (profileRes.data as WorkerDetail['profile'] | null) ?? {
        id: workerRow.user_id,
        full_name: workerRow.headline || 'myB pro',
        avatar_url: null,
        identity_verified: false,
      },
      worker: workerRes.data as WorkerProfile,
      services: (servicesRes.data as ServiceDescription[] | null) ?? [],
      reviews: (reviewsRes.data as WorkerDetail['reviews'] | null) ?? [],
    });
    // session intentionally omitted: the favourite state reloads on toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Save / unsave this pro (FR-DISC-8). */
  const toggleSaved = async () => {
    if (!session || !id) return;
    if (saved) {
      lightTap();
      setSaved(false);
      await supabase
        .from('favorites')
        .delete()
        .eq('user_id', session.user.id)
        .eq('worker_id', id);
    } else {
      successTap();
      setSaved(true);
      await supabase.from('favorites').insert({ user_id: session.user.id, worker_id: id });
    }
  };

  if (failed) {
    return (
      <Screen scroll={false}>
        <ErrorState
          title="Profile unavailable"
          message="This worker profile could not be loaded."
          actionTitle="Try again"
          onAction={() => void load()}
        />
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen scroll={false}>
        <LoadingState label="Loading profile…" />
      </Screen>
    );
  }

  const { profile, worker, services, reviews } = detail;
  const isSelf = session?.user.id === worker.user_id;

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        <View style={{ alignItems: 'center', gap: space.s3 }}>
          {!isSelf && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={saved ? 'Remove from favourites' : 'Save to favourites'}
              accessibilityState={{ selected: saved }}
              onPress={() => void toggleSaved()}
              hitSlop={8}
              style={({ pressed }) => ({
                position: 'absolute',
                right: 0,
                top: 0,
                width: 40,
                height: 40,
                borderRadius: radius.full,
                borderWidth: 1,
                borderColor: saved ? colors.error : colors.border,
                backgroundColor: saved ? colors.errorSoft : colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons
                name={saved ? 'heart' : 'heart-outline'}
                size={20}
                color={saved ? colors.error : colors.textMuted}
              />
            </Pressable>
          )}
          <Avatar name={profile.full_name} uri={profile.avatar_url} size="xl" />
          <View style={{ alignItems: 'center', gap: space.s1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
              <AppText variant="h2">{profile.full_name}</AppText>
              {worker.tier_skill && <Badge kind="topPro" />}
            </View>
            {profile.identity_verified && <Badge kind="verified" />}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
              <Rating value={Number(worker.rating_avg)} count={worker.rating_count} />
              <AppText variant="bodySm" color="textMuted">
                · {worker.jobs_completed} jobs · {worker.parish}
              </AppText>
            </View>
          </View>
        </View>

        {services.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, justifyContent: 'center' }}>
            {services.map((service) => (
              <Chip key={service.id} label={service.title} />
            ))}
          </View>
        )}

        {worker.bio ? (
          <AppText variant="body" color="textMuted" style={{ textAlign: 'center' }}>
            {worker.bio}
          </AppText>
        ) : null}

        {/* Rate + book (design: rate card with primary CTA) */}
        <Card raised>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <AppText variant="h3" color="accent">
                {formatRate(worker.rate_min_jmd, worker.rate_max_jmd, worker.rate_unit)}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {worker.available ? 'Available now' : worker.availability_note || 'Limited availability'}
              </AppText>
            </View>
            {!isSelf && (
              <Button
                title="Book now"
                onPress={() =>
                  router.push({ pathname: '/job/new', params: { workerId: worker.user_id } })
                }
              />
            )}
          </View>
        </Card>

        {!isSelf && (
          <Button
            title="Message"
            variant="secondary"
            fullWidth
            onPress={async () => {
              if (!session) return;
              // Find or create the thread, then open the chat.
              const { data: existing } = await supabase
                .from('threads')
                .select('id')
                .eq('customer_id', session.user.id)
                .eq('worker_id', worker.user_id)
                .maybeSingle();
              if (existing) {
                router.push(`/thread/${existing.id}`);
                return;
              }
              const { data: created } = await supabase
                .from('threads')
                .insert({ customer_id: session.user.id, worker_id: worker.user_id })
                .select('id')
                .single();
              if (created) router.push(`/thread/${created.id}`);
            }}
          />
        )}

        {reviews.length > 0 && (
          <View style={{ gap: space.s4 }}>
            <AppText variant="h3">Reviews</AppText>
            {reviews.map((review) => (
              <Card key={review.id}>
                <View style={{ gap: space.s2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <AppText variant="label">{review.reviewer?.full_name ?? 'Customer'}</AppText>
                    <AppText variant="caption" color="textMuted">
                      {timeAgo(review.created_at)}
                    </AppText>
                  </View>
                  <Rating value={review.rating} />
                  {review.comment ? (
                    <AppText variant="bodySm" color="textMuted">
                      {review.comment}
                    </AppText>
                  ) : null}
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
