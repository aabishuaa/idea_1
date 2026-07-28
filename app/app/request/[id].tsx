import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { JobPhotos } from '@/components/JobPhotos';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn, lightTap } from '@/components/ui/animated';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { formatDateTime, formatJmd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { openThread, sendMessage } from '@/lib/threads';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { IncomingRequest, JobPhoto, JobUrgency } from '@/types/db';

const URGENCY_COPY: Record<JobUrgency, string> = {
  low: 'Whenever you can fit it in',
  normal: 'Within the next few days',
  high: 'Needs attention soon',
  emergency: 'Needs someone right now',
};

/**
 * Review a job request before answering it (FR-JOB-2, worker side).
 *
 * The whole point of this screen is that accepting work is a judgement call:
 * who is asking, is their identity verified, what exactly do they want, and
 * can I ask them something first. Only then Accept or Decline — and accepting
 * is the app's biggest moment, so it gets the full-screen celebration.
 */
export default function RequestReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { colors } = useTheme();

  const [request, setRequest] = useState<IncomingRequest | null>(null);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [busy, setBusy] = useState<null | 'accept' | 'decline' | 'message'>(null);
  const [note, setNote] = useState('');
  const [noteSent, setNoteSent] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setPhase('missing');
      return;
    }
    const [{ data }, photosRes] = await Promise.all([
      supabase.rpc('get_incoming_requests'),
      supabase.from('job_photos').select('*').eq('job_id', id).order('created_at'),
    ]);
    const rows = (data as IncomingRequest[] | null) ?? [];
    const found = rows.find((row) => row.id === id) ?? null;
    setPhotos((photosRes.data as JobPhoto[] | null) ?? []);
    setRequest(found);
    setPhase(found ? 'ready' : 'missing');
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === 'loading') {
    return (
      <Screen scroll={false}>
        <LoadingState label="Loading request…" />
      </Screen>
    );
  }

  if (phase === 'missing' || !request) {
    return (
      <Screen scroll={false}>
        <ErrorState
          title="Request unavailable"
          message="This request has already been answered, or it was cancelled."
          actionTitle="Back to bookings"
          onAction={() => router.replace('/(tabs)/bookings')}
        />
      </Screen>
    );
  }

  const respond = async (status: 'accepted' | 'declined') => {
    if (!session) return;
    setBusy(status === 'accepted' ? 'accept' : 'decline');
    setError(null);
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status })
      .eq('id', request.id);
    setBusy(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (status === 'accepted') {
      setAccepted(true);
    } else {
      router.replace('/(tabs)/bookings');
    }
  };

  /** Ask a question without committing — the thread stays after either answer. */
  const askQuestion = async () => {
    if (!session || !note.trim()) return;
    setBusy('message');
    setError(null);
    const threadId = await openThread({
      customerId: request.customer_id,
      workerId: session.user.id,
      jobId: request.id,
    });
    if (!threadId) {
      setBusy(null);
      setError('Could not open the chat. Try again.');
      return;
    }
    const ok = await sendMessage(threadId, session.user.id, note);
    setBusy(null);
    if (!ok) {
      setError('Message did not send. Try again.');
      return;
    }
    setNote('');
    setNoteSent(true);
  };

  const openChat = async () => {
    if (!session) return;
    lightTap();
    const threadId = await openThread({
      customerId: request.customer_id,
      workerId: session.user.id,
      jobId: request.id,
    });
    if (threadId) router.push(`/thread/${threadId}`);
  };

  const budget =
    request.budget_min_jmd != null && request.budget_max_jmd != null
      ? `${formatJmd(request.budget_min_jmd)} – ${formatJmd(request.budget_max_jmd)}`
      : formatJmd(request.budget_max_jmd ?? request.budget_min_jmd);

  return (
    <Screen>
      {accepted && (
        <SuccessOverlay
          visible
          icon="briefcase"
          title="Job accepted!"
          message={`${request.customer_name} has been told you're on it. This job is now tracked in your bookings.`}
          actionTitle="Track this job"
          onAction={() => router.replace({ pathname: '/job/[id]', params: { id: request.id } })}
          secondaryTitle="Message the customer"
          onSecondary={() => {
            setAccepted(false);
            void openChat();
          }}
        />
      )}

      <View style={{ gap: space.s4 }}>
        <FadeSlideIn>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.s2,
              alignSelf: 'flex-start',
              paddingHorizontal: space.s3,
              paddingVertical: space.s1,
              borderRadius: radius.full,
              backgroundColor: colors.warningSoft,
            }}
          >
            <Ionicons name="hand-left-outline" size={13} color={colors.warning} />
            <AppText variant="caption" style={{ color: colors.warning }}>
              Waiting on your answer
            </AppText>
          </View>
        </FadeSlideIn>

        {/* Who is asking (FR-TRU: identity before commitment) */}
        <FadeSlideIn delay={60}>
          <Card raised>
            <View style={{ gap: space.s3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
                <Avatar
                  name={request.customer_name}
                  uri={request.customer_avatar}
                  size="lg"
                />
                <View style={{ flex: 1, gap: space.s1 }}>
                  <AppText variant="h3" numberOfLines={1}>
                    {request.customer_name}
                  </AppText>
                  {request.customer_verified ? (
                    <Badge kind="verified" />
                  ) : (
                    <AppText variant="caption" color="textMuted">
                      Identity not verified yet
                    </AppText>
                  )}
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={openChat}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: space.s2,
                  paddingVertical: space.s3,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.accent} />
                <AppText variant="label" color="accent">
                  Open full chat
                </AppText>
              </Pressable>
            </View>
          </Card>
        </FadeSlideIn>

        {/* What they want */}
        <FadeSlideIn delay={120}>
          <Card>
            <View style={{ gap: space.s3 }}>
              <AppText variant="h3">{request.title}</AppText>
              {request.description ? (
                <AppText variant="body" color="textMuted">
                  {request.description}
                </AppText>
              ) : null}
              {/* The pro is deciding whether they can do this job — the photo
                  is often the deciding fact. */}
              <JobPhotos photos={photos} />
              <View style={{ gap: space.s2, paddingTop: space.s1 }}>
                <Detail icon="location-outline" label="Where" value={request.parish ?? 'Jamaica'} />
                <Detail
                  icon="alarm-outline"
                  label="How soon"
                  value={URGENCY_COPY[request.urgency]}
                />
                {budget !== '—' && (
                  <Detail icon="cash-outline" label="Budget" value={budget} highlight />
                )}
                <Detail
                  icon="calendar-outline"
                  label="Requested"
                  value={formatDateTime(request.requested_at)}
                />
              </View>
            </View>
          </Card>
        </FadeSlideIn>

        {/* Ask before you commit */}
        <FadeSlideIn delay={180}>
          <Card>
            <View style={{ gap: space.s3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                <Ionicons name="help-circle-outline" size={18} color={colors.accent} />
                <AppText variant="label">Not sure yet? Ask first</AppText>
              </View>
              <AppText variant="caption" color="textMuted">
                Send a question without accepting. Your reply time is part of your reputation, so
                answering quickly counts either way.
              </AppText>
              <Input
                placeholder="e.g. Is there parking at the address?"
                value={note}
                onChangeText={(text) => {
                  setNote(text);
                  setNoteSent(false);
                }}
                multiline
              />
              <Button
                title={noteSent ? 'Question sent ✓' : 'Send question'}
                variant="secondary"
                icon={noteSent ? undefined : 'paper-plane-outline'}
                fullWidth
                disabled={note.trim().length === 0}
                loading={busy === 'message'}
                onPress={askQuestion}
              />
            </View>
          </Card>
        </FadeSlideIn>

        {error ? (
          <AppText variant="caption" style={{ color: colors.error }}>
            {error}
          </AppText>
        ) : null}

        {/* The decision */}
        <FadeSlideIn delay={240}>
          <View style={{ gap: space.s3 }}>
            <Button
              title="Accept this job"
              icon="checkmark-circle"
              fullWidth
              loading={busy === 'accept'}
              disabled={busy !== null}
              onPress={() => respond('accepted')}
              accessibilityHint="Confirms the booking and notifies the customer"
            />
            <Button
              title="Decline"
              variant="secondary"
              fullWidth
              loading={busy === 'decline'}
              disabled={busy !== null}
              onPress={() => respond('declined')}
            />
          </View>
        </FadeSlideIn>
      </View>
    </Screen>
  );
}

function Detail({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <AppText variant="bodySm" color="textMuted" style={{ width: 92 }}>
        {label}
      </AppText>
      <AppText
        variant="bodySm"
        color={highlight ? 'accent' : 'text'}
        style={{ flex: 1 }}
        numberOfLines={2}
      >
        {value}
      </AppText>
    </View>
  );
}
