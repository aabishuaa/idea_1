import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { WorkerCard } from '@/components/WorkerCard';
import { Chip } from '@/components/ui/badges';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn, Skeleton, lightTap } from '@/components/ui/animated';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { extractIntent } from '@/lib/edge';
import { logEvent } from '@/lib/events';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useJobDraft } from '@/providers/JobDraftProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';
import type { MatchedWorker, Trade } from '@/types/db';

const PARISHES = [
  'Kingston', 'St. Andrew', 'St. Catherine', 'St. James', 'Manchester',
  'Clarendon', 'St. Ann', 'Portland', 'St. Thomas', 'St. Mary', 'Trelawny',
  'Hanover', 'Westmoreland', 'St. Elizabeth',
];

/** Things people actually type — shown before the first search. */
const EXAMPLE_QUERIES = [
  'tutor for my son',
  'mi sink a leak',
  'someone to braid my hair',
  'fix my phone screen',
  'birthday cake',
  'cut mi grass',
];

/**
 * Search & matching (FR-DISC-1..6).
 *
 * The search box is the primary way in: whatever the customer types goes
 * straight to match_workers, which does full-text + fuzzy + synonym matching in
 * Postgres. That works with no LLM key and no embeddings, so search never dies
 * with the AI service. Intent extraction and semantic ranking layer on top when
 * the edge function is reachable — enhancement, never dependency.
 */
export default function SearchScreen() {
  const { draft, hasDraft } = useJobDraft();
  const params = useLocalSearchParams<{ trade?: string; q?: string }>();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const [query, setQuery] = useState(params.q ?? '');
  const [submitted, setSubmitted] = useState(params.q ?? '');
  const [trade, setTrade] = useState<string | null>(params.trade ?? null);
  const [parish, setParish] = useState<string | null>(null);
  const [nearMe, setNearMe] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [results, setResults] = useState<MatchedWorker[] | null>(null);
  const [phase, setPhase] = useState<'idle' | 'searching' | 'error'>('idle');
  const requestId = useRef(0);

  useEffect(() => {
    supabase
      .from('trades')
      .select('slug, label, emoji, category')
      .order('sort_order')
      .then(({ data }) => setTrades((data as Trade[] | null) ?? []));
  }, []);

  useEffect(() => {
    if (params.trade) setTrade(params.trade);
  }, [params.trade]);

  const run = useCallback(
    async (text: string, tradeSlug: string | null, parishName: string | null) => {
      const id = ++requestId.current;
      setPhase('searching');
      const { data, error } = await supabase.rpc('match_workers', {
        p_query: text.trim() || null,
        p_trade_slug: tradeSlug,
        p_parish: parishName,
        p_limit: 40,
      });
      if (id !== requestId.current) return; // a newer search superseded this one
      if (error) {
        setPhase('error');
        return;
      }
      setResults((data as MatchedWorker[] | null) ?? []);
      setPhase('idle');

      if (text.trim()) {
        logEvent('job_search', { trade_slug: tradeSlug, parish: parishName });
        // Best-effort enrichment; failure must not affect the results above.
        void extractIntent(text.trim()).catch(() => undefined);
      }
    },
    [],
  );

  // Filters re-run immediately; the text box runs on submit.
  useEffect(() => {
    void run(submitted, trade, parish);
  }, [submitted, trade, parish, run]);

  const submit = () => {
    lightTap();
    setSubmitted(query);
  };

  const clear = () => {
    setQuery('');
    setSubmitted('');
    setTrade(null);
  };

  // Group the (now much longer) trade list by category for browsing.
  const grouped = useMemo(() => {
    const map = new Map<string, Trade[]>();
    trades.forEach((item) => {
      const key = item.category ?? 'Other';
      map.set(key, [...(map.get(key) ?? []), item]);
    });
    return [...map.entries()];
  }, [trades]);

  const activeTrade = trades.find((item) => item.slug === trade);
  const hasSearch = submitted.trim().length > 0 || trade !== null || parish !== null;

  return (
    <Screen padded={false}>
      <View style={{ padding: space.s4, gap: space.s3 }}>
        <Input
          icon="search"
          placeholder="Try “tutor”, “braid my hair”, “mi sink a leak”…"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submit}
          returnKeyType="search"
        />

        {/* Active filters */}
        {hasSearch && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
            {submitted.trim() ? (
              <Chip label={`“${submitted.trim()}” ✕`} selected onPress={clear} />
            ) : null}
            {activeTrade ? (
              <Chip
                label={`${activeTrade.emoji} ${activeTrade.label} ✕`}
                selected
                onPress={() => setTrade(null)}
              />
            ) : null}
            <Chip
              label={nearMe ? `📍 ${profile?.parish ?? 'My parish'}` : 'Near me'}
              selected={nearMe}
              onPress={() => {
                const next = !nearMe;
                setNearMe(next);
                setParish(next ? profile?.parish ?? null : null);
              }}
            />
          </View>
        )}

        {results !== null && phase === 'idle' && hasSearch && (
          <AppText variant="bodySm" color="textMuted">
            {results.length} pro{results.length === 1 ? '' : 's'} found
          </AppText>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: space.s4, paddingTop: 0, gap: space.s4 }}
        keyboardShouldPersistTaps="handled"
      >
        {phase === 'searching' && (
          <>
            <Skeleton height={128} radius={radius.lg} />
            <Skeleton height={128} radius={radius.lg} />
            <Skeleton height={128} radius={radius.lg} />
          </>
        )}

        {phase === 'error' && (
          <ErrorState
            title="Something went wrong"
            message="We couldn't load results. Check your connection."
            actionTitle="Try again"
            onAction={() => void run(submitted, trade, parish)}
          />
        )}

        {/* A request already written: say so, so picking a pro reads as the
            last step rather than the start of a second form. */}
        {hasDraft && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.s3,
              marginHorizontal: space.s4,
              padding: space.s3,
              borderRadius: radius.md,
              backgroundColor: colors.accentSoft,
            }}
          >
            <Ionicons name="document-text-outline" size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color="accent">
                Your request is ready
              </AppText>
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                {draft.title || draft.description}
              </AppText>
            </View>
            <AppText variant="caption" color="textMuted">
              Pick a pro →
            </AppText>
          </View>
        )}

        {/* Nothing searched yet: suggest phrasings and let people browse. */}
        {phase === 'idle' && !hasSearch && (
          <View style={{ gap: space.s5 }}>
            <View style={{ gap: space.s3 }}>
              <AppText variant="label" color="textMuted">
                Try searching for
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
                {EXAMPLE_QUERIES.map((example) => (
                  <Chip
                    key={example}
                    label={example}
                    onPress={() => {
                      setQuery(example);
                      setSubmitted(example);
                    }}
                  />
                ))}
              </View>
            </View>

            {grouped.map(([category, items]) => (
              <View key={category} style={{ gap: space.s3 }}>
                <AppText variant="label" color="textMuted">
                  {category}
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
                  {items.map((item) => (
                    <Chip
                      key={item.slug}
                      label={`${item.emoji} ${item.label}`}
                      selected={trade === item.slug}
                      onPress={() => setTrade(trade === item.slug ? null : item.slug)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Parish filter, once a search is active */}
        {phase === 'idle' && hasSearch && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: space.s2, paddingBottom: space.s2 }}>
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
        )}

        {phase === 'idle' &&
          results?.map((worker, index) => (
            <FadeSlideIn key={worker.worker_id} delay={Math.min(index, 6) * 50}>
              <WorkerCard
                worker={worker}
                onPress={() => router.push(`/worker/${worker.worker_id}`)}
              />
            </FadeSlideIn>
          ))}

        {phase === 'idle' && hasSearch && results?.length === 0 && (
          <>
            <EmptyState
              title="No pros match that yet"
              message={`Nobody offering “${submitted.trim() || activeTrade?.label}” in ${parish ?? 'Jamaica'} right now. Try different words, or widen the parish.`}
              actionTitle="Clear search"
              onAction={clear}
            />
            {/* An unmet search is a demand signal — show the worker side. */}
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/worker-setup')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.s3,
                padding: space.s4,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="megaphone-outline" size={22} color={colors.accent} />
              <AppText variant="bodySm" color="textMuted" style={{ flex: 1 }}>
                Do you offer this service? List it and be the first pro customers find.
              </AppText>
            </Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
