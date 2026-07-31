import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Card } from './ui/Card';
import { AppText } from './ui/Text';
import { lightTap } from './ui/animated';
import { telHref, websiteHref, type WorkerContact } from '@/lib/contact';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

/**
 * Contact details on a profile.
 *
 * Only rendered when the viewer is actually entitled to see them — the row-level
 * policy on worker_contacts decides that, so if this component has data at all,
 * showing it is already authorised. Nothing here re-checks permissions, because
 * a second opinion in the client is the kind of check that drifts out of step
 * with the real one.
 *
 * Every row is tappable. A phone number you have to memorise and retype is a
 * phone number that does not get called.
 */
export function ContactCard({
  contact,
  /** True when only this viewer can see it — because they booked, not because it is published. */
  privateToYou = false,
}: {
  contact: WorkerContact;
  privateToYou?: boolean;
}) {
  const { colors } = useTheme();

  const row = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    value: string,
    href: string,
    hint: string,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="link"
      accessibilityLabel={`${hint}: ${value}`}
      onPress={() => {
        lightTap();
        void Linking.openURL(href).catch(() => {
          /* No handler for tel:/mailto: on this device — nothing useful to say. */
        });
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s3,
        paddingVertical: space.s2,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.md,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={17} color={colors.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="caption" color="textMuted">
          {label}
        </AppText>
        <AppText variant="body" numberOfLines={1}>
          {value}
        </AppText>
      </View>
      <Ionicons name="open-outline" size={15} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <Card>
      <View style={{ gap: space.s1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
          <AppText variant="label" style={{ flex: 1 }}>
            Contact
          </AppText>
          {privateToYou && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: space.s2,
                paddingVertical: 2,
                borderRadius: radius.full,
                backgroundColor: colors.successSoft,
              }}
            >
              <Ionicons name="lock-open-outline" size={10} color={colors.success} />
              <AppText variant="caption" style={{ color: colors.success, fontSize: 10 }}>
                Shared with you
              </AppText>
            </View>
          )}
        </View>

        {contact.phone && row('call-outline', 'Phone', contact.phone, telHref(contact.phone), 'Call')}
        {contact.email &&
          row('mail-outline', 'Email', contact.email, `mailto:${contact.email}`, 'Email')}
        {contact.website &&
          row('globe-outline', 'Website', contact.website, websiteHref(contact.website), 'Open')}

        {privateToYou && (
          <AppText variant="caption" color="textMuted" style={{ paddingTop: space.s1 }}>
            You can see this because you have a booking together.
          </AppText>
        )}
      </View>
    </Card>
  );
}
