import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { SkillPicker, type Skill } from '@/components/SkillPicker';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/badges';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SuccessOverlay } from '@/components/ui/SuccessOverlay';
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
 * Your work (FR-PROF-1/4) — the listing customers search.
 *
 * Account details (name, password, contact) live on /account. This screen is
 * only about what you sell: they were the same screen, which meant "Account"
 * and "Worker profile & services" in the menu opened the same thing.
 */
export default function WorkerSetupScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const { colors } = useTheme();

  const [parish, setParish] = useState('Kingston');
  const [offerServices, setOfferServices] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [years, setYears] = useState('');
  const [rateMin, setRateMin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [tradesRes, workerRes, servicesRes] = await Promise.all([
      supabase.from('trades').select('slug, label, emoji, category').order('sort_order'),
      supabase.from('worker_profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
      supabase
        .from('service_descriptions')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at'),
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
    const services = (servicesRes.data as ServiceDescription[] | null) ?? [];
    setSkills(
      services.map((service) => ({
        trade_slug: service.trade_slug,
        title: service.title,
        custom: service.trade_slug === 'other',
      })),
    );
  }, [session]);

  useEffect(() => {
    if (profile?.parish) setParish(profile.parish);
    void load();
  }, [profile?.parish, load]);

  const save = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ parish, is_worker: offerServices })
      .eq('id', session.user.id);
    if (profileError) {
      setBusy(false);
      setError(profileError.message);
      return;
    }

    if (offerServices) {
      if (skills.length === 0) {
        setBusy(false);
        setError('Pick at least one thing you do, so customers can find you.');
        return;
      }

      // One RPC rather than raw upserts: PostgREST's upsert puts the conflict
      // key into DO UPDATE SET, which the column-level grants reject with
      // "permission denied for table worker_profiles" (migration 0018).
      const { error: workerError } = await supabase.rpc('save_worker_profile', {
        p_headline: headline.trim(),
        p_bio: bio.trim(),
        p_parish: parish,
        p_years: Number(years) || 0,
        p_rate_min: rateMin ? Number(rateMin) : null,
        p_rate_max: rateMin ? Number(rateMin) : null,
        p_rate_unit: 'hour',
        p_available: true,
        p_visible: true,
        // Services are saved by save_worker_services below, so this call is
        // profile-only — passing a service here would duplicate one of them.
        p_trade_slug: null,
        p_service_title: null,
        p_service_desc: null,
        p_service_id: null,
      });
      if (workerError) {
        setBusy(false);
        setError(workerError.message);
        return;
      }

      // Replaces the whole set atomically (migration 0021), so removing a
      // skill on screen actually removes it.
      const { data: savedServices, error: servicesError } = await supabase.rpc(
        'save_worker_services',
        {
          p_services: skills.map((skill) => ({
            trade_slug: skill.trade_slug,
            title: skill.title,
            description: bio.trim(),
          })),
        },
      );
      if (servicesError) {
        setBusy(false);
        setError(servicesError.message);
        return;
      }

      // Fire-and-forget: semantic matching improves once embedded (FR-PROF-4).
      ((savedServices as { service_id: string }[] | null) ?? []).forEach((row) => {
        void embedService(row.service_id);
      });
    }

    await refreshProfile();
    setBusy(false);
    setCelebrating(true);
  };

  /** After saving, show them the thing they just made. */
  const goToProfile = () => {
    setCelebrating(false);
    if (!session) return;
    if (offerServices) {
      router.replace({ pathname: '/worker/[id]', params: { id: session.user.id } });
    } else {
      router.replace('/(tabs)/profile');
    }
  };

  return (
    <Screen>
      <SuccessOverlay
        visible={celebrating}
        icon={offerServices ? 'briefcase' : 'checkmark'}
        title={offerServices ? "You're listed!" : 'Saved'}
        message={
          offerServices
            ? `Customers searching for ${
                skills[0]?.title.toLowerCase() ?? 'your service'
              } can now find you.`
            : 'Your details are up to date.'
        }
        actionTitle={offerServices ? 'See my profile' : 'Done'}
        onAction={goToProfile}
        secondaryTitle={
          offerServices && !profile?.identity_verified ? 'Get verified' : undefined
        }
        onSecondary={() => {
          setCelebrating(false);
          router.push('/verification');
        }}
      />

      <View style={{ gap: space.s5 }}>
        <Card>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
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

        <View style={{ gap: space.s2 }}>
          <AppText variant="label" color="textMuted">
            Where do you work?
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

        {offerServices && (
          <View style={{ gap: space.s5 }}>
            <SkillPicker trades={trades} value={skills} onChange={setSkills} />

            <Input
              label="Headline"
              placeholder="e.g. Licensed electrician — residential & commercial"
              value={headline}
              onChangeText={setHeadline}
            />
            <Input
              label="About your work"
              placeholder="The jobs you handle, how you work, what makes you worth calling. This powers smart matching, so be specific."
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={4}
              style={{ minHeight: 100, textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: 'row', gap: space.s3 }}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Years doing this"
                  keyboardType="numeric"
                  placeholder="5"
                  value={years}
                  onChangeText={setYears}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Rate (JMD/hr)"
                  keyboardType="numeric"
                  placeholder="3500"
                  value={rateMin}
                  onChangeText={setRateMin}
                />
              </View>
            </View>
          </View>
        )}

        <Button
          title={offerServices ? 'Publish my profile' : 'Save'}
          icon={offerServices ? 'rocket-outline' : undefined}
          fullWidth
          loading={busy}
          onPress={save}
          disabled={offerServices && skills.length === 0}
        />
        {error && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <AppText variant="bodySm" color="error" style={{ flex: 1 }}>
              {error}
            </AppText>
          </View>
        )}
      </View>
    </Screen>
  );
}
