import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { extractIntent } from '@/lib/edge';
import { logEvent } from '@/lib/events';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { space } from '@/theme/tokens';
import type { JobUrgency } from '@/types/db';

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
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [urgency, setUrgency] = useState<JobUrgency>('normal');
  const [budget, setBudget] = useState('');
  const [tradeSlug, setTradeSlug] = useState<string | null>(null);
  const [parish, setParish] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [understanding, setUnderstanding] = useState(false);
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

  const understand = async () => {
    if (description.trim().length < 8) return;
    setUnderstanding(true);
    try {
      const { intent } = await extractIntent(description.trim());
      if (intent.job_type) setTradeSlug(intent.job_type);
      if (intent.location) setParish(intent.location);
      setUrgency(intent.urgency);
      if (intent.budget.max_jmd ?? intent.budget.min_jmd) {
        setBudget(String(intent.budget.max_jmd ?? intent.budget.min_jmd));
      }
      if (!title) setTitle(description.trim().slice(0, 60));
    } catch {
      // LLM cold/down — the form still works manually (SR-6).
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
        title: title.trim() || description.trim().slice(0, 60),
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

        <Input label="Title" placeholder="Short summary" value={title} onChangeText={setTitle} />

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

        <Input
          label="Budget (JMD, optional)"
          placeholder="e.g. 10000"
          keyboardType="numeric"
          value={budget}
          onChangeText={setBudget}
          error={error ?? undefined}
        />

        <Button
          title={params.workerId ? 'Send request' : 'Find matching pros'}
          fullWidth
          loading={busy}
          disabled={description.trim().length < 8}
          onPress={submit}
        />
      </View>
    </Screen>
  );
}
