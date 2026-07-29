import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, View } from 'react-native';

import { PersonLink } from '@/components/PersonLink';
import { PortfolioGrid } from '@/components/PortfolioGrid';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, Chip } from '@/components/ui/badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Rating } from '@/components/ui/Rating';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn, lightTap, successTap } from '@/components/ui/animated';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { formatRate, timeAgo } from '@/lib/format';
import { pickImage, publicUrl, uploadUserImage, type PickedImage } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import { openThread } from '@/lib/threads';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type {
  PortfolioItem,
  Profile,
  Review,
  ServiceDescription,
  WorkerProfile,
} from '@/types/db';

interface WorkerDetail {
  profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'identity_verified'>;
  worker: WorkerProfile;
  services: ServiceDescription[];
  reviews: (Review & { reviewer: { full_name: string } | null })[];
  portfolio: PortfolioItem[];
}

/**
 * The pro's profile — built as a portfolio, not a record card.
 *
 * An informal tradesperson has no CV and no company website. This screen is
 * the substitute: their face, their work, what people said, and a reputation
 * score they earned and own. Photos come first because they are the fastest
 * honest signal a customer can read.
 */
export default function WorkerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, refreshProfile } = useAuth();
  const { colors, isDark } = useTheme();
  const [detail, setDetail] = useState<WorkerDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<PickedImage | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setFailed(false);
    const [profileRes, workerRes, servicesRes, reviewsRes, portfolioRes] = await Promise.all([
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
      supabase
        .from('portfolio_items')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false }),
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
      worker: workerRow,
      services: (servicesRes.data as ServiceDescription[] | null) ?? [],
      reviews: (reviewsRes.data as WorkerDetail['reviews'] | null) ?? [],
      portfolio: (portfolioRes.data as PortfolioItem[] | null) ?? [],
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

  const { profile, worker, services, reviews, portfolio } = detail;
  const isSelf = session?.user.id === worker.user_id;

  /** Own profile: change the photo people see first. */
  const changeAvatar = async () => {
    if (!session || !isSelf) return;
    const image = await pickImage({ square: true });
    if (!image) return;
    setUploading(true);
    // Same filename every time so old avatars do not accumulate; a cache
    // buster on the URL keeps the new one from being masked by the old.
    const path = await uploadUserImage('portfolios', session.user.id, image, 'avatar');
    if (path) {
      await supabase
        .from('profiles')
        .update({ avatar_url: `${publicUrl('portfolios', path)}?v=${Date.now()}` })
        .eq('id', session.user.id);
      await refreshProfile();
      successTap();
      void load();
    }
    setUploading(false);
  };

  /** Pick first, caption second, then it goes up — one confirm, no edit step. */
  const startAddWork = async () => {
    const image = await pickImage();
    if (!image) return;
    setCaption('');
    setPending(image);
  };

  const confirmAddWork = async () => {
    if (!session || !pending) return;
    setUploading(true);
    const path = await uploadUserImage('portfolios', session.user.id, pending);
    if (path) {
      await supabase.rpc('add_portfolio_item', { p_path: path, p_caption: caption.trim() });
      successTap();
      void load();
    }
    setUploading(false);
    setPending(null);
    setCaption('');
  };

  const removeWork = async (item: PortfolioItem) => {
    if (!session) return;
    await supabase.from('portfolio_items').delete().eq('id', item.id);
    await supabase.storage.from('portfolios').remove([item.storage_path]);
    void load();
  };

  const years = worker.years_experience;

  return (
    <Screen padded={false}>
      {/* ── Cover ─────────────────────────────────────────────────────── */}
      <View style={{ height: 118 }}>
        <LinearGradient
          colors={
            isDark ? [colors.primary, '#0B0E16'] : [colors.primary, colors.accent]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        />
        {!isSelf && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove from favourites' : 'Save to favourites'}
            accessibilityState={{ selected: saved }}
            onPress={() => void toggleSaved()}
            hitSlop={8}
            style={({ pressed }) => ({
              position: 'absolute',
              right: space.s4,
              top: space.s4,
              width: 40,
              height: 40,
              borderRadius: radius.full,
              backgroundColor: 'rgba(0,0,0,0.28)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={20}
              color={saved ? colors.error : '#FFFFFF'}
            />
          </Pressable>
        )}
      </View>

      <View style={{ paddingHorizontal: space.s4, gap: space.s5, paddingBottom: space.s12 }}>
        {/* ── Identity, overlapping the cover ───────────────────────────
            zIndex + elevation are required, not decorative: a negative margin
            pulls this UP into the cover's box, and without an explicit stacking
            order the gradient (an earlier sibling with its own layer) painted
            over the avatar — you could see the ring but not the face. */}
        <View style={{ marginTop: -44, gap: space.s3, zIndex: 2, elevation: 2 }}>
          <Pressable
            accessibilityRole={isSelf ? 'button' : 'image'}
            accessibilityLabel={isSelf ? 'Change your photo' : `${profile.full_name}'s photo`}
            disabled={!isSelf}
            onPress={changeAvatar}
            style={{ alignSelf: 'flex-start' }}
          >
            <View
              style={{
                borderRadius: radius.full,
                borderWidth: 4,
                borderColor: colors.bg,
                backgroundColor: colors.bg,
                overflow: 'hidden',
              }}
            >
              <Avatar name={profile.full_name} uri={profile.avatar_url} size="xl" />
              {isSelf && (
                <View
                  style={{
                    position: 'absolute',
                    right: -2,
                    bottom: -2,
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: colors.primary,
                    borderWidth: 2,
                    borderColor: colors.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="camera" size={14} color="#FFFFFF" />
                </View>
              )}
            </View>
          </Pressable>

          <View style={{ gap: space.s2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
              <AppText variant="h2" style={{ flexShrink: 1 }}>
                {profile.full_name}
              </AppText>
              {profile.identity_verified && <Badge kind="verified" compact />}
              {worker.tier_skill && <Badge kind="topPro" compact />}
              {worker.tier_business && <Badge kind="pro" compact />}
            </View>
            {worker.headline ? (
              <AppText variant="body" color="accent">
                {worker.headline}
              </AppText>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s1 }}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <AppText variant="bodySm" color="textMuted">
                {worker.parish}
              </AppText>
              <View
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: colors.textMuted,
                  marginHorizontal: space.s1,
                }}
              />
              <AppText
                variant="bodySm"
                style={{ color: worker.available ? colors.success : colors.textMuted }}
              >
                {worker.available ? 'Available now' : worker.availability_note || 'Busy'}
              </AppText>
            </View>
          </View>
        </View>

        {/* ── Stats strip ─────────────────────────────────────────────── */}
        <FadeSlideIn>
          <View
            style={{
              flexDirection: 'row',
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingVertical: space.s3,
            }}
          >
            <Stat value={String(worker.jobs_completed)} label="jobs done" />
            <Divider />
            <Stat
              value={Number(worker.rating_avg) > 0 ? Number(worker.rating_avg).toFixed(1) : '—'}
              label={`${worker.rating_count} review${worker.rating_count === 1 ? '' : 's'}`}
              star
            />
            <Divider />
            <Stat value={years > 0 ? `${years}y` : 'New'} label="experience" />
          </View>
        </FadeSlideIn>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        {isSelf ? (
          <Button
            title="Edit profile & services"
            variant="secondary"
            icon="create-outline"
            fullWidth
            onPress={() => router.push('/worker-setup')}
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: space.s3 }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Book now"
                icon="calendar"
                fullWidth
                onPress={() =>
                  router.push({ pathname: '/job/new', params: { workerId: worker.user_id } })
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Message"
                variant="secondary"
                icon="chatbubble-ellipses-outline"
                fullWidth
                onPress={async () => {
                  if (!session) return;
                  const threadId = await openThread({
                    customerId: session.user.id,
                    workerId: worker.user_id,
                  });
                  if (threadId) router.push(`/thread/${threadId}`);
                }}
              />
            </View>
          </View>
        )}

        {/* ── Rate ────────────────────────────────────────────────────── */}
        <Card raised>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View style={{ gap: 2 }}>
              <AppText variant="overline" color="textMuted">
                Typical rate
              </AppText>
              <AppText variant="h3" color="accent">
                {formatRate(worker.rate_min_jmd, worker.rate_max_jmd, worker.rate_unit)}
              </AppText>
            </View>
            <View
              style={{
                alignItems: 'center',
                gap: 2,
                paddingLeft: space.s4,
                borderLeftWidth: 1,
                borderLeftColor: colors.border,
              }}
            >
              <AppText variant="overline" color="textMuted">
                Reputation
              </AppText>
              <AppText variant="h3">{Number(worker.reputation).toFixed(0)}</AppText>
            </View>
          </View>
        </Card>

        {/* ── What I do ───────────────────────────────────────────────── */}
        {services.length > 0 && (
          <View style={{ gap: space.s3 }}>
            <AppText variant="overline" color="textMuted">
              What I do
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
              {services.map((service) => (
                <Chip key={service.id} label={service.title} />
              ))}
            </View>
          </View>
        )}

        {worker.bio ? (
          <AppText variant="body" color="textMuted">
            {worker.bio}
          </AppText>
        ) : null}

        {/* ── The work ────────────────────────────────────────────────── */}
        <PortfolioGrid
          items={portfolio}
          editable={isSelf}
          uploading={uploading}
          onAdd={startAddWork}
          onDelete={removeWork}
        />

        {/* ── Reviews ─────────────────────────────────────────────────── */}
        {reviews.length > 0 && (
          <View style={{ gap: space.s3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
              <Ionicons name="chatbox-ellipses-outline" size={16} color={colors.textMuted} />
              <AppText variant="overline" color="textMuted" style={{ flex: 1 }}>
                What customers said
              </AppText>
              <Rating value={Number(worker.rating_avg)} count={worker.rating_count} />
            </View>
            {reviews.map((review, index) => (
              <FadeSlideIn key={review.id} delay={Math.min(index, 6) * 40}>
                <Card>
                  <View style={{ gap: space.s2 }}>
                    <View
                      style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s2, alignItems: 'center' }}
                    >
                      {/* Who left this review is checkable — an anonymous
                          five-star wall is exactly what fake reviews look
                          like, so the author has to be a real person you can
                          open. */}
                      <View style={{ flex: 1 }}>
                        <PersonLink
                          id={review.reviewer_id}
                          name={review.reviewer?.full_name ?? 'Customer'}
                          variant="inline"
                        />
                      </View>
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
              </FadeSlideIn>
            ))}
          </View>
        )}
      </View>

      {/* Caption sheet for a photo about to be added */}
      <Modal
        visible={pending !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setPending(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              padding: space.s5,
              gap: space.s4,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
              {pending && (
                <Image
                  source={{ uri: pending.uri }}
                  style={{ width: 72, height: 72, borderRadius: radius.md }}
                  resizeMode="cover"
                />
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="h3">Add to your work</AppText>
                <AppText variant="caption" color="textMuted">
                  Say what it was — customers scan captions.
                </AppText>
              </View>
            </View>
            <Input
              placeholder="e.g. Full bathroom refit, Portmore"
              value={caption}
              onChangeText={setCaption}
              maxLength={80}
            />
            <Button
              title="Add photo"
              fullWidth
              loading={uploading}
              onPress={confirmAddWork}
            />
            <Button title="Cancel" variant="text" fullWidth onPress={() => setPending(null)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Stat({ value, label, star = false }: { value: string; label: string; star?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {star && <Ionicons name="star" size={14} color={colors.star} />}
        <AppText variant="h3">{value}</AppText>
      </View>
      <AppText variant="caption" color="textMuted" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={{ width: 1, backgroundColor: colors.border, marginVertical: space.s1 }} />;
}
