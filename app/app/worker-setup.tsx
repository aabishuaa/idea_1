import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { Chip } from '@/components/ui/badges';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { embedService } from '@/lib/edge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';
import type { ServiceDescription, Trade, WorkerProfile } from '@/types/db';

const PARISHES = [
  'Kingston', 'St. Andrew', 'St. Catherine', 'St. James', 'Manchester',
  'Clarendon', 'St. Ann', 'Portland', 'St. Thomas', 'St. Mary', 'Trelawny',
  'Hanover', 'Westmoreland', 'St. Elizabeth',
];

/**
 * Account + worker profile setup (FR-PROF-1/4). Saving a service description
 * triggers embedding via the embed-text edge function so semantic matching
 * picks it up.
 */
export default function WorkerSetupScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const { colors } = useTheme();

  const [fullName, setFullName] = useState('');
  const [parish, setParish] = useState('Kingston');
  const [offerServices, setOfferServices] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeSlug, setTradeSlug] = useState<string | null>(null);
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [years, setYears] = useState('');
  const [rateMin, setRateMin] = useState('');
  const [serviceTitle, setServiceTitle] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [existingServiceId, setExistingServiceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [tradesRes, workerRes, serviceRes] = await Promise.all([
      supabase.from('trades').select('*').order('label'),
      supabase.from('worker_profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
      supabase
        .from('service_descriptions')
        .select('*')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle(),
    ]);
    setTrades((tradesRes.data as Trade[] | null) ?? []);

    const worker = workerRes.data as WorkerProfile | null;
    if (worker) {
      setOfferServices(true);
      setHeadline(worker.headline);
      setBio(worker.bio);
      setParish(worker.parish);
      setYears(String(worker.years_experience || ''));
      setRateMin(worker.rate_min_jmd != null ? String(worker.rate_min_jmd) : '');
    }
    const service = serviceRes.data as ServiceDescription | null;
    if (service) {
      setExistingServiceId(service.id);
      setTradeSlug(service.trade_slug);
      setServiceTitle(service.title);
      setServiceDescription(service.description);
    }
  }, [session]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      if (profile.parish) setParish(profile.parish);
    }
    void load();
  }, [profile, load]);

  const save = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    setSaved(false);

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), parish, is_worker: offerServices })
      .eq('id', session.user.id);
    if (profileError) {
      setBusy(false);
      setError(profileError.message);
      return;
    }

    if (offerServices) {
      const { error: workerError } = await supabase.from('worker_profiles').upsert({
        user_id: session.user.id,
        headline: headline.trim(),
        bio: bio.trim(),
        parish,
        years_experience: Number(years) || 0,
        rate_min_jmd: rateMin ? Number(rateMin) : null,
        rate_max_jmd: rateMin ? Number(rateMin) : null,
      });
      if (workerError) {
        setBusy(false);
        setError(workerError.message);
        return;
      }

      if (tradeSlug && serviceTitle.trim() && serviceDescription.trim()) {
        const payload = {
          user_id: session.user.id,
          trade_slug: tradeSlug,
          title: serviceTitle.trim(),
          description: serviceDescription.trim(),
        };
        const { data: serviceRow, error: serviceError } = existingServiceId
          ? await supabase
              .from('service_descriptions')
              .update(payload)
              .eq('id', existingServiceId)
              .select('id')
              .single()
          : await supabase.from('service_descriptions').insert(payload).select('id').single();

        if (serviceError) {
          setBusy(false);
          setError(serviceError.message);
          return;
        }
        if (serviceRow) {
          setExistingServiceId(serviceRow.id);
          // Fire-and-forget: semantic matching improves once embedded (FR-PROF-4).
          void embedService(serviceRow.id);
        }
      }
    }

    await refreshProfile();
    setBusy(false);
    setSaved(true);
  };

  return (
    <Screen>
      <View style={{ gap: space.s5 }}>
        <Input label="Full name" value={fullName} onChangeText={setFullName} />

        <View style={{ gap: space.s2 }}>
          <AppText variant="label" color="textMuted">
            Parish
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
            {PARISHES.map((name) => (
              <Chip
                key={name}
                label={name}
                selected={parish === name}
                onPress={() => setParish(name)}
              />
            ))}
          </View>
        </View>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label">Offer your skills on myB</AppText>
              <AppText variant="caption" color="textMuted">
                Create a worker profile so customers can find and book you.
              </AppText>
            </View>
            <Switch
              value={offerServices}
              onValueChange={setOfferServices}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>

        {offerServices && (
          <View style={{ gap: space.s4 }}>
            <Input
              label="Headline"
              placeholder="e.g. Licensed electrician — residential & commercial"
              value={headline}
              onChangeText={setHeadline}
            />
            <Input
              label="About you"
              placeholder="Tell customers about your experience…"
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={3}
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />
            <Input
              label="Years of experience"
              keyboardType="numeric"
              value={years}
              onChangeText={setYears}
            />
            <Input
              label="Rate (JMD per hour)"
              keyboardType="numeric"
              placeholder="e.g. 3500"
              value={rateMin}
              onChangeText={setRateMin}
            />

            <View style={{ gap: space.s2 }}>
              <AppText variant="label" color="textMuted">
                Your trade
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
                {trades.map((trade) => (
                  <Chip
                    key={trade.slug}
                    label={`${trade.emoji} ${trade.label}`}
                    selected={tradeSlug === trade.slug}
                    onPress={() => setTradeSlug(trade.slug)}
                  />
                ))}
              </View>
            </View>

            <Input
              label="Service title"
              placeholder="e.g. Wiring & rewiring"
              value={serviceTitle}
              onChangeText={setServiceTitle}
            />
            <Input
              label="Describe what you do"
              placeholder="List the jobs you handle — this powers smart matching, so be specific."
              value={serviceDescription}
              onChangeText={setServiceDescription}
              multiline
              numberOfLines={4}
              style={{ minHeight: 96, textAlignVertical: 'top' }}
            />
          </View>
        )}

        <Button
          title="Save"
          fullWidth
          loading={busy}
          onPress={save}
          disabled={!fullName.trim()}
        />
        {error && (
          <AppText variant="bodySm" color="error">
            {error}
          </AppText>
        )}
        {saved && (
          <AppText variant="bodySm" color="success">
            Saved. {offerServices ? 'Your profile is live — verification unlocks more visibility.' : ''}
          </AppText>
        )}
        {saved && offerServices && !profile?.identity_verified && (
          <Button
            title="Get verified"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/verification')}
          />
        )}
      </View>
    </Screen>
  );
}
