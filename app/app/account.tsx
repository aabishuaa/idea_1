import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/badges';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { PasswordMeter } from '@/components/PasswordMeter';
import { lightTap, successTap } from '@/components/ui/animated';
import { passwordChecks, passwordStrength } from '@/lib/password';
import { pickImage, publicUrl, uploadUserImage } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { space } from '@/theme/tokens';
import { getContact, saveMyContact } from '@/lib/contact';
import { PARISHES } from '@/lib/parishes';

/**
 * Account — who you are, not what you sell.
 *
 * Split out of worker-setup, which had grown into both: the menu offered
 * "Account" and "Worker profile & services" and they opened the same screen.
 * Your listing lives on /worker-setup; your identity and credentials live here.
 */
export default function AccountScreen() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const { colors } = useTheme();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [parish, setParish] = useState('Kingston');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Public contact details. Separate from profiles.phone, which is the account's
  // own number and is never shown to anyone else.
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactWebsite, setContactWebsite] = useState('');
  const [showContact, setShowContact] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNote, setPasswordNote] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name);
    setPhone(profile.phone ?? '');
    if (profile.parish) setParish(profile.parish);
  }, [profile]);

  useEffect(() => {
    if (!session) return;
    void getContact(session.user.id).then((row) => {
      if (!row) return;
      setContactPhone(row.phone ?? '');
      setContactEmail(row.email ?? '');
      setContactWebsite(row.website ?? '');
      setShowContact(row.show_publicly);
    });
  }, [session]);

  const saveContact = async () => {
    setContactBusy(true);
    setContactError(null);
    setContactSaved(false);
    const failure = await saveMyContact({
      phone: contactPhone,
      email: contactEmail,
      website: contactWebsite,
      show: showContact,
    });
    setContactBusy(false);
    if (failure) {
      setContactError(failure);
      return;
    }
    successTap();
    setContactSaved(true);
  };

  const changeAvatar = async () => {
    if (!session) return;
    const image = await pickImage({ square: true });
    if (!image) return;
    setUploading(true);
    const path = await uploadUserImage('portfolios', session.user.id, image, 'avatar');
    if (path) {
      await supabase
        .from('profiles')
        .update({ avatar_url: `${publicUrl('portfolios', path)}?v=${Date.now()}` })
        .eq('id', session.user.id);
      await refreshProfile();
      successTap();
    }
    setUploading(false);
  };

  const saveDetails = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), phone: phone.trim() || null, parish })
      .eq('id', session.user.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await refreshProfile();
    successTap();
    setSaved(true);
  };

  const changePassword = async () => {
    setPasswordError(null);
    setPasswordNote(null);
    const strength = passwordStrength(password);
    if (strength.score < 3) {
      setPasswordError('Choose a stronger password — see the checks below.');
      return;
    }
    if (password !== confirm) {
      setPasswordError('The two passwords do not match.');
      return;
    }
    setPasswordBusy(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    setPasswordBusy(false);
    if (authError) {
      setPasswordError(authError.message);
      return;
    }
    successTap();
    setPassword('');
    setConfirm('');
    setPasswordNote('Password updated.');
  };

  if (!profile) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  const checks = passwordChecks(password);

  return (
    <Screen>
      <View style={{ gap: space.s6 }}>
        {/* Photo + identity */}
        <View style={{ alignItems: 'center', gap: space.s3 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change your photo"
            onPress={changeAvatar}
            disabled={uploading}
          >
            <Avatar name={profile.full_name} uri={profile.avatar_url} size="xl" />
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
              {uploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={14} color="#FFFFFF" />
              )}
            </View>
          </Pressable>
          <AppText variant="caption" color="textMuted">
            {session?.user.email}
          </AppText>
        </View>

        <View style={{ gap: space.s4 }}>
          <Input
            label="Full name"
            icon="person-outline"
            value={fullName}
            onChangeText={setFullName}
          />
          <Input
            label="Phone"
            icon="call-outline"
            placeholder="876 000 0000"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            success={profile.phone_verified ? 'Verified' : undefined}
          />

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

          <Button
            title="Save details"
            fullWidth
            loading={busy}
            disabled={!fullName.trim()}
            onPress={saveDetails}
          />
          {error && (
            <AppText variant="bodySm" color="error">
              {error}
            </AppText>
          )}
          {saved && (
            <AppText variant="bodySm" color="success">
              Saved.
            </AppText>
          )}

        {/* ── Contact details others can see ─────────────────────────────
            Deliberately its own section, its own save button, and OFF by
            default. Publishing a phone number is a decision, not a side
            effect of filling in a form — and for the workers this is built
            for, an exposed number is a real-world risk. Customers who have
            actually booked you can always reach you, published or not. */}
        <Card>
          <View style={{ gap: space.s4 }}>
            <View style={{ gap: space.s1 }}>
              <AppText variant="h3">How customers reach you</AppText>
              <AppText variant="bodySm" color="textMuted">
                Useful if you run a business and want enquiries direct. Anyone
                you have an accepted booking with can see these even when they
                are switched off below.
              </AppText>
            </View>

            <Input
              label="Business phone"
              placeholder="876-000-0000"
              keyboardType="phone-pad"
              value={contactPhone}
              onChangeText={setContactPhone}
            />
            <Input
              label="Business email"
              placeholder="you@yourbusiness.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={contactEmail}
              onChangeText={setContactEmail}
            />
            <Input
              label="Website or social page (optional)"
              placeholder="instagram.com/yourwork"
              autoCapitalize="none"
              value={contactWebsite}
              onChangeText={setContactWebsite}
            />

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: showContact }}
              onPress={() => {
                lightTap();
                setShowContact((current) => !current);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.s3,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons
                name={showContact ? 'checkbox' : 'square-outline'}
                size={22}
                color={showContact ? colors.accent : colors.textMuted}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label">Show these on my public profile</AppText>
                <AppText variant="caption" color="textMuted">
                  {showContact
                    ? 'Anyone on myB can see and tap them.'
                    : 'Only customers with a booking can see them.'}
                </AppText>
              </View>
            </Pressable>

            <Button
              title="Save contact details"
              fullWidth
              loading={contactBusy}
              onPress={saveContact}
            />
            {contactError && (
              <AppText variant="bodySm" color="error">
                {contactError}
              </AppText>
            )}
            {contactSaved && (
              <AppText variant="bodySm" color="success">
                Saved.
              </AppText>
            )}
          </View>
        </Card>
        </View>

        {/* Credentials */}
        <Card>
          <View style={{ gap: space.s4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
              <Ionicons name="key-outline" size={18} color={colors.accent} />
              <AppText variant="label">Change password</AppText>
            </View>
            <Input
              label="New password"
              icon="lock-closed-outline"
              placeholder="At least 8 characters"
              secureTextEntry
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
            />
            {password.length > 0 && <PasswordMeter password={password} checks={checks} />}
            <Input
              label="Confirm new password"
              icon="lock-closed-outline"
              secureTextEntry
              autoComplete="new-password"
              value={confirm}
              onChangeText={setConfirm}
              error={
                confirm.length > 0 && confirm !== password ? 'Passwords do not match' : undefined
              }
            />
            <Button
              title="Update password"
              variant="secondary"
              fullWidth
              loading={passwordBusy}
              disabled={password.length === 0 || confirm.length === 0}
              onPress={changePassword}
            />
            {passwordError && (
              <AppText variant="bodySm" color="error">
                {passwordError}
              </AppText>
            )}
            {passwordNote && (
              <AppText variant="bodySm" color="success">
                {passwordNote}
              </AppText>
            )}
          </View>
        </Card>

        {/* Where the rest of the account lives */}
        <Card style={{ padding: 0 }}>
          <Row
            icon="shield-checkmark-outline"
            label="Identity verification"
            detail={profile.identity_verified ? 'Verified' : 'Not verified'}
            onPress={() => router.push('/verification')}
          />
          <Row
            icon="briefcase-outline"
            label={profile.is_worker ? 'Your work & services' : 'Offer your skills'}
            onPress={() => router.push('/worker-setup')}
          />
          <Row icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
        </Card>

        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.7 : 1 })}
        >
          <AppText variant="label" color="error">
            Log out
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

function Row({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s3,
        padding: space.s4,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={colors.accent} />
      <AppText variant="body" style={{ flex: 1 }}>
        {label}
      </AppText>
      {detail && (
        <AppText variant="caption" color="textMuted">
          {detail}
        </AppText>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}
