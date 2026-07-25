import { useLocalSearchParams, router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { WorkerCard } from '@/components/WorkerCard';
import { Chip } from '@/components/ui/badges';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { extractIntent, type JobIntent } from '@/lib/edge';
import { logEvent } from '@/lib/events';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme/tokens';
import type { MatchedWorker, Trade } from '@/types/db';

const PARISHES = [
  'Kingston', 'St. Andrew', 'St. Catherine', 'St. James', 'Manchester',
  'Clarendon', 'St. Ann', 'Portland', 'St. Thomas', 'St. Mary', 'Trelawny',
  'Hanover', 'Westmoreland', 'St. Elizabeth',
];

/**
 * Search & matching (design 05, FR-DISC-1..6).
 * Plain-language search → extract-intent (LLM, language only) → match_workers
 * (deterministic weighted SQL ranking with semantic similarity).
 */
export default function SearchScreen() {
  const params = useLocalSearchParams<{ trade?: string; q?: string }>();
  const [query, setQuery] = useState(params.q ?? '');
  const [trade, setTrade] = useState<string | null>(params.trade ?? null);
  const [parish, setParish] = useState<string | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [results, setResults] = useState<MatchedWorker[] | null>(null);
  const [intent, setIntent] = useState<JobIntent | null>(null);
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'matching' | 'error'>('idle');

  useEffect(() => {
    supabase
      .from('trades')
      .select('*')
      .order('label')
      .then(({ data }) => setTrades((data as Trade[] | null) ?? []));
  }, []);

  useEffect(() => {
    if (params.trade) setTrade(params.trade);
  }, [params.trade]);

  const runMatch = useCallback(
    async (embedding: number[] | null, tradeSlug: string | null, parishName: string | null) => {
      setPhase('matching');
      const { data, error } = await supabase.rpc('match_workers', {
        p_embedding: embedding,
        p_trade_slug: tradeSlug,
        p_parish: parishName,
        p_limit: 20,
      });
      if (error) {
        setPhase('error');
        return;
      }
      setResults((data as MatchedWorker[] | null) ?? []);
      setPhase('idle');
    },
    [],
  );

  // Filter-only browsing (FR-DISC-5) — no LLM involved.
  useEffect(() => {
    if (!query.trim()) void runMatch(null, trade, parish);
  }, [trade, parish, query, runMatch]);

  const submitQuery = async () => {
    const description = query.trim();
    if (!description) return;
    setPhase('thinking');
    setIntent(null);
    try {
      const extraction = await extractIntent(description);
      setIntent(extraction.intent);
      const effectiveTrade = extraction.intent.job_type ?? trade;
      const effectiveParish = extraction.intent.location ?? parish;
      if (extraction.intent.job_type) setTrade(extraction.intent.job_type);
      if (extraction.intent.location) setParish(extraction.intent.location);
      logEvent('job_search', {
        trade_slug: effectiveTrade,
        parish: effectiveParish,
        payload: { urgency: extraction.intent.urgency },
      });
      await runMatch(extraction.embedding, effectiveTrade, effectiveParish);
    } catch {
      // LLM down/cold: degrade to filter search rather than blocking (SR-6).
      await runMatch(null, trade, parish);
    }
  };

  return (
    <Screen safeTop padded={false}>
      <View style={{ padding: space.s4, gap: space.s4 }}>
        <Input
          icon="search"
          placeholder='Try "mi sink a leak under di counter"'
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submitQuery}
          returnKeyType="search"
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: space.s2 }}>
            <Chip label="All trades" selected={trade === null} onPress={() => setTrade(null)} />
            {trades.map((item) => (
              <Chip
                key={item.slug}
                label={item.label}
                selected={trade === item.slug}
                onPress={() => setTrade(trade === item.slug ? null : item.slug)}
              />
            ))}
          </View>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: space.s2 }}>
            <Chip label="All parishes" selected={parish === null} onPress={() => setParish(null)} />
            {PARISHES.map((name) => (
              <Chip
                key={name}
                label={name}
                selected={parish === name}
                onPress={() => setParish(parish === name ? null : name)}
              />
            ))}
          </View>
        </ScrollView>

        {intent && (
          <AppText variant="caption" color="textMuted">
            Understood: {intent.job_type ?? 'any trade'}
            {intent.location ? ` · ${intent.location}` : ''} · {intent.urgency} urgency
          </AppText>
        )}

        {results !== null && phase === 'idle' && (
          <AppText variant="bodySm" color="textMuted">
            {results.length} pro{results.length === 1 ? '' : 's'} found
          </AppText>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: space.s4, paddingTop: 0, gap: space.s4 }}>
        {phase === 'thinking' && <LoadingState label="Understanding your request…" />}
        {phase === 'matching' && <LoadingState label="Matching pros…" />}
        {phase === 'error' && (
          <ErrorState
            title="Something went wrong"
            message="We couldn't load results. Check your connection."
            actionTitle="Try again"
            onAction={() => void runMatch(null, trade, parish)}
          />
        )}
        {phase === 'idle' &&
          results?.map((worker) => (
            <WorkerCard
              key={worker.worker_id}
              worker={worker}
              onPress={() => router.push(`/worker/${worker.worker_id}`)}
            />
          ))}
        {phase === 'idle' && results?.length === 0 && (
          <EmptyState
            title="No pros match yet"
            message="Try a different trade or parish — new workers join every week."
          />
        )}
      </ScrollView>
    </Screen>
  );
}
