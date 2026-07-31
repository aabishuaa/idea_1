import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import {
  BudgetRange,
  budgetInverted,
  budgetNumber,
  describeBudget,
  type Budget,
} from '@/components/BudgetRange';
import {
  DateWindowPicker,
  describeWindow,
  type DateWindow,
} from '@/components/DateWindowPicker';
import { PersonLink } from '@/components/PersonLink';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { lightTap } from '@/components/ui/animated';
import { extractIntent } from '@/lib/edge';
import { suggestJobTitle } from '@/lib/jobTitle';
import { logEvent } from '@/lib/events';
import { pickImage, uploadTo, type PickedImage } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useJobDraft } from '@/providers/JobDraftProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

const MAX_PHOTOS = 4;

/**
 * Job request (FR-JOB-1, FR-DISC-1/2): describe in plain language; the LLM
 * extracts structured intent to prefill; the customer confirms and sends.
 * If no worker was picked yet, we route to search with the description.
 *
 * The form is written ONCE. Everything typed here is kept in the job draft, so
 * coming back with a pro chosen shows a confirmation of what was already said
 * — not the same empty form again.
 */
export default function NewJobScreen() {
  const params = useLocalSearchParams<{ workerId?: string }>();
  const { session } = useAuth();
  const { colors } = useTheme();
  const { draft, hasDraft, setDraft, clearDraft } = useJobDraft();
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [workerAvatar, setWorkerAvatar] = useState<string | null>(null);
  const [description, setDescription] = useState(draft.description);
  const [title, setTitle] = useState(draft.title);
  const [when, setWhen] = useState<DateWindow>(draft.when);
  const [budget, setBudget] = useState<Budget>(draft.budget);
  const [tradeSlug, setTradeSlug] = useState<string | null>(draft.tradeSlug);
  const [parish, setParish] = useState<string | null>(draft.parish);
  /*
    Arriving with a pro already chosen AND a draft in hand means the customer
    has answered all of this on the previous screen. Show it back to them for
    a yes/no instead of making them type it twice — the review can be opened
    if they want to change something.
  */
  const [reviewing, setReviewing] = useState(Boolean(params.workerId) && hasDraft);
  // The title is generated unless the customer edits it. Tracking that lets
  // the generator keep improving as they type without overwriting their words.
  const [titleEdited, setTitleEdited] = useState(draft.understood);
  const [tradeLabels, setTradeLabels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [understanding, setUnderstanding] = useState(false);
  const [photos, setPhotos] = useState<PickedImage[]>(draft.photos);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.workerId) return;
    supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', params.workerId)
      .maybeSingle()
      .then(({ data }) => {
        setWorkerName(data?.full_name ?? null);
        setWorkerAvatar(data?.avatar_url ?? null);
      });
  }, [params.workerId]);

  // Trade labels make a far better title than a slug ("Plumbing job in
  // Kingston" beats "plumbing job").
  useEffect(() => {
    void supabase
      .from('trades')
      .select('slug, label')
      .then(({ data }) => {
        const map: Record<string, string> = {};
        ((data as { slug: string; label: string }[] | null) ?? []).forEach((trade) => {
          map[trade.slug] = trade.label;
        });
        setTradeLabels(map);
      });
  }, []);

  /*
    The title used to be `description.slice(0, 60)` — it just echoed back
    whatever was typed, which is not a title, it is the same sentence twice on
    the booking card. Now: the LLM proposes a real one, and when it cannot
    (no key, cold start, or it echoed), a deterministic generator builds one
    from the trade and parish. Never a copy of the description.
  */
  const autoTitle = (intentTitle?: string | null, slug?: string | null, where?: string | null) =>
    suggestJobTitle({
      llmTitle: intentTitle ?? null,
      description,
      tradeLabel: slug ? (tradeLabels[slug] ?? null) : null,
      parish: where ?? null,
    });

  // Mirror every field into the draft so leaving this screen never loses it.
  useEffect(() => {
    setDraft({
      description,
      title,
      when,
      budget,
      tradeSlug,
      parish,
      photos,
      understood: titleEdited || title.length > 0,
    });
    // setDraft is stable; the draft itself must not be a dependency or this
    // would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, title, when, budget, tradeSlug, parish, photos, titleEdited]);

  const understand = async () => {
    if (description.trim().length < 6) return;
    setUnderstanding(true);
    try {
      const { intent } = await extractIntent(description.trim());
      if (intent.job_type) setTradeSlug(intent.job_type);
      if (intent.location) setParish(intent.location);
      /*
        Urgency is no longer asked for or set here — the customer picks real
        dates and the database derives urgency from them. Letting the LLM write
        an urgency back would silently contradict the dates on screen.
      */
      if (intent.budget.min_jmd != null || intent.budget.max_jmd != null) {
        setBudget({
          min: intent.budget.min_jmd != null ? String(intent.budget.min_jmd) : '',
          max: intent.budget.max_jmd != null ? String(intent.budget.max_jmd) : '',
        });
      }
      if (!titleEdited) {
        setTitle(autoTitle(intent.title, intent.job_type, intent.location));
      }
    } catch {
      // LLM cold/down — the form still works, with a locally generated title.
      if (!titleEdited) setTitle(autoTitle(null, tradeSlug, parish));
    } finally {
      setUnderstanding(false);
    }
  };

  const budgetMin = budgetNumber(budget.min);
  const budgetMax = budgetNumber(budget.max);
  // A max below the min is the customer's typo, not a request we can send.
  const canSend = description.trim().length >= 3 && !budgetInverted(budget);

  const submit = async () => {
    if (!session) return;
    setError(null);

    if (!params.workerId) {
      // No worker picked: send them to matching with this description prefilled.
      router.replace({ pathname: '/search', params: { q: description.trim() } });
      return;
    }

    setBusy(true);
    const { data, error: insertError } = await supabase
      .from('jobs')
      .insert({
        customer_id: session.user.id,
        worker_id: params.workerId,
        title: title.trim() || autoTitle(null, tradeSlug, parish),
        description: description.trim(),
        trade_slug: tradeSlug,
        parish,
        // urgency is derived from the window by a trigger (migration 0023).
        needed_from: when.from,
        needed_by: when.to,
        budget_min_jmd: budgetMin,
        budget_max_jmd: budgetMax,
      })
      .select('id')
      .single();
    setBusy(false);

    if (insertError || !data) {
      setError(insertError?.message ?? 'Could not send the request. Try again.');
      return;
    }
    // Photos can only be uploaded once the job exists: the storage policy
    // authorises by job membership, and the path is <job_id>/…
    if (photos.length > 0) {
      await Promise.all(
        photos.map(async (photo, index) => {
          const path = await uploadTo(
            'job-photos',
            `${data.id}/${Date.now()}-${index}.${photo.extension}`,
            photo,
          );
          if (!path) return;
          await supabase
            .from('job_photos')
            .insert({ job_id: data.id, uploaded_by: session.user.id, storage_path: path });
        }),
      );
    }

    logEvent('job_request_created', {
      trade_slug: tradeSlug,
      parish,
      payload: { needed_from: when.from, needed_by: when.to },
    });
    // The request is sent; the draft has done its job.
    clearDraft();
    // Must be the ROUTE PATTERN, not the resolved path: passing
    // `/job/<uuid>` with a params object does not match any route, so the
    // navigation silently no-ops and the request looks like it never sent.
    router.replace({ pathname: '/job/[id]', params: { id: data.id, confirmed: '1' } });
  };

  /*
    The confirm screen. Everything below was already answered on the previous
    step, so this is a read-back with one button — the point is that choosing a
    pro should COMPLETE the request, not restart it.
  */
  if (reviewing) {
    return (
      <Screen>
        <View style={{ gap: space.s5 }}>
          <View style={{ gap: space.s2 }}>
            <AppText variant="h2">Send this to {workerName ?? 'this pro'}?</AppText>
            <AppText variant="bodySm" color="textMuted">
              We kept everything you already told us. Nothing to type again.
            </AppText>
          </View>

          {/* Check them before you commit — the profile is one tap from the
              confirm screen, not something you have to go back for. */}
          {workerName && params.workerId && (
            <Card raised>
              <PersonLink
                id={params.workerId}
                name={workerName}
                avatarUrl={workerAvatar}
                subtitle="Tap to see their work and reviews first"
              />
            </Card>
          )}

          <Card>
            <View style={{ gap: space.s3 }}>
              <AppText variant="h3">{title || 'Your job'}</AppText>
              <AppText variant="bodySm" color="textMuted">
                {description}
              </AppText>

              {photos.length > 0 && (
                <View style={{ flexDirection: 'row', gap: space.s2, flexWrap: 'wrap' }}>
                  {photos.map((photo) => (
                    <Image
                      key={photo.uri}
                      source={{ uri: photo.uri }}
                      style={{ width: 64, height: 64, borderRadius: radius.md }}
                      resizeMode="cover"
                    />
                  ))}
                </View>
              )}

              <View style={{ gap: space.s2, paddingTop: space.s1 }}>
                <SummaryRow icon="calendar-outline" label="When" value={describeWindow(when)} />
                {parish && (
                  <SummaryRow icon="location-outline" label="Where" value={parish} />
                )}
                {(budgetMin != null || budgetMax != null) && (
                  <SummaryRow icon="cash-outline" label="Budget" value={describeBudget(budget)} />
                )}
                {photos.length > 0 && (
                  <SummaryRow
                    icon="camera-outline"
                    label="Photos"
                    value={`${photos.length} attached`}
                  />
                )}
              </View>
            </View>
          </Card>

          {error && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <AppText variant="bodySm" color="error" style={{ flex: 1 }}>
                {error}
              </AppText>
            </View>
          )}

          <Button
            title="Send request"
            icon="send"
            fullWidth
            loading={busy}
            onPress={submit}
          />
          <Button
            title="Change something"
            variant="secondary"
            icon="create-outline"
            fullWidth
            onPress={() => setReviewing(false)}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        {workerName && params.workerId && (
          <Card>
            <PersonLink
              id={params.workerId}
              name={workerName}
              avatarUrl={workerAvatar}
              size="sm"
              subtitle="Requesting this pro · tap to view"
            />
          </Card>
        )}

        <Input
          label="What do you need done?"
          placeholder='e.g. "Mi pipe under di sink a leak, need it fix quick"'
          value={description}
          onChangeText={setDescription}
          onBlur={understand}
          multiline
          numberOfLines={3}
          style={{ minHeight: 72, textAlignVertical: 'top' }}
        />
        {understanding && (
          <AppText variant="caption" color="textMuted">
            Understanding your request…
          </AppText>
        )}

        <Input
          label="Title"
          placeholder="We'll name it for you — tap to change"
          value={title}
          onChangeText={(text) => {
            setTitleEdited(true);
            setTitle(text);
          }}
          success={title && !titleEdited ? 'Suggested — edit if you like' : undefined}
        />

        <DateWindowPicker value={when} onChange={setWhen} />

        {/* A photo says more than a paragraph — the pro is deciding whether
            they can do this job, and "mi sink a leak" is ambiguous. */}
        <View style={{ gap: space.s2 }}>
          <AppText variant="label" color="textMuted">
            Add photos (optional)
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
            {photos.map((photo, index) => (
              <Pressable
                key={photo.uri}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${index + 1}`}
                onPress={() => setPhotos((current) => current.filter((item) => item !== photo))}
              >
                <Image
                  source={{ uri: photo.uri }}
                  style={{ width: 76, height: 76, borderRadius: radius.md }}
                  resizeMode="cover"
                />
                <View
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    backgroundColor: colors.bg,
                    borderRadius: radius.full,
                  }}
                >
                  <Ionicons name="close-circle" size={20} color={colors.error} />
                </View>
              </Pressable>
            ))}
            {photos.length < MAX_PHOTOS && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add a photo"
                onPress={async () => {
                  lightTap();
                  const image = await pickImage();
                  if (image) setPhotos((current) => [...current, image]);
                }}
                style={({ pressed }) => ({
                  width: 76,
                  height: 76,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Ionicons name="camera-outline" size={20} color={colors.accent} />
                <AppText variant="caption" color="accent">
                  Photo
                </AppText>
              </Pressable>
            )}
          </View>
        </View>

        <BudgetRange value={budget} onChange={setBudget} />

        {/* The old gate needed 8 characters with no explanation, so the
            button looked broken while you typed. Now it needs 3 and says why. */}
        {description.trim().length > 0 && description.trim().length < 3 && (
          <AppText variant="caption" color="textMuted">
            Add a few more words so we know what you need.
          </AppText>
        )}

        <Button
          title={params.workerId ? 'Send request' : 'Find matching pros'}
          icon={params.workerId ? 'send' : 'search'}
          fullWidth
          loading={busy}
          disabled={!canSend}
          onPress={submit}
        />
      </View>
    </Screen>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
      <Ionicons name={icon} size={15} color={colors.textMuted} />
      <AppText variant="bodySm" color="textMuted" style={{ width: 84 }}>
        {label}
      </AppText>
      <AppText variant="bodySm" style={{ flex: 1 }}>
        {value}
      </AppText>
    </View>
  );
}
