import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/badges';
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
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { JobUrgency } from '@/types/db';

const MAX_PHOTOS = 4;

const URGENCIES: { value: JobUrgency; label: string }[] = [
  { value: 'low', label: 'Whenever' },
  { value: 'normal', label: 'This week' },
  { value: 'high', label: 'Soon' },
  { value: 'emergency', label: 'Emergency' },
];

/**
 * Job request (FR-JOB-1, FR-DISC-1/2): describe in plain language; the LLM
 * extracts structured intent to prefill; the customer confirms and sends.
 * If no worker was picked yet, we route to search with the description.
 */
export default function NewJobScreen() {
  const params = useLocalSearchParams<{ workerId?: string }>();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [urgency, setUrgency] = useState<JobUrgency>('normal');
  const [budget, setBudget] = useState('');
  const [tradeSlug, setTradeSlug] = useState<string | null>(null);
  const [parish, setParish] = useState<string | null>(null);
  // The title is generated unless the customer edits it. Tracking that lets
  // the generator keep improving as they type without overwriting their words.
  const [titleEdited, setTitleEdited] = useState(false);
  const [tradeLabels, setTradeLabels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [understanding, setUnderstanding] = useState(false);
  const [photos, setPhotos] = useState<PickedImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.workerId) return;
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', params.workerId)
      .maybeSingle()
      .then(({ data }) => setWorkerName(data?.full_name ?? null));
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

  const understand = async () => {
    if (description.trim().length < 6) return;
    setUnderstanding(true);
    try {
      const { intent } = await extractIntent(description.trim());
      if (intent.job_type) setTradeSlug(intent.job_type);
      if (intent.location) setParish(intent.location);
      setUrgency(intent.urgency);
      if (intent.budget.max_jmd ?? intent.budget.min_jmd) {
        setBudget(String(intent.budget.max_jmd ?? intent.budget.min_jmd));
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

  const submit = async () => {
    if (!session) return;
    setError(null);

    if (!params.workerId) {
      // No worker picked: send them to matching with this description prefilled.
      router.replace({ pathname: '/search', params: { q: description.trim() } });
      return;
    }

    setBusy(true);
    const budgetValue = budget ? Number(budget.replace(/[^0-9.]/g, '')) : null;
    const { data, error: insertError } = await supabase
      .from('jobs')
      .insert({
        customer_id: session.user.id,
        worker_id: params.workerId,
        title: title.trim() || autoTitle(null, tradeSlug, parish),
        description: description.trim(),
        trade_slug: tradeSlug,
        parish,
        urgency,
        budget_min_jmd: budgetValue,
        budget_max_jmd: budgetValue,
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

    logEvent('job_request_created', { trade_slug: tradeSlug, parish, payload: { urgency } });
    // Must be the ROUTE PATTERN, not the resolved path: passing
    // `/job/<uuid>` with a params object does not match any route, so the
    // navigation silently no-ops and the request looks like it never sent.
    router.replace({ pathname: '/job/[id]', params: { id: data.id, confirmed: '1' } });
  };

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        {workerName && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
              <Avatar name={workerName} size="sm" />
              <AppText variant="bodySm" color="textMuted">
                Requesting <AppText variant="label">{workerName}</AppText>
              </AppText>
            </View>
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

        <View style={{ gap: space.s2 }}>
          <AppText variant="label" color="textMuted">
            How urgent?
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
            {URGENCIES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={urgency === option.value}
                onPress={() => setUrgency(option.value)}
              />
            ))}
          </View>
        </View>

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

        <Input
          label="Budget (JMD, optional)"
          placeholder="e.g. 10000"
          keyboardType="numeric"
          value={budget}
          onChangeText={setBudget}
          error={error ?? undefined}
        />

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
          disabled={description.trim().length < 3}
          onPress={submit}
        />
      </View>
    </Screen>
  );
}
