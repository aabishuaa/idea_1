import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { FadeSlideIn, Skeleton, lightTap } from '@/components/ui/animated';
import { EmptyState } from '@/components/ui/states';
import { BizBotMark } from '@/features/bizbot/BizBotMark';
import {
  deleteAllConversations,
  deleteConversation,
  listConversations,
  type BizBotConversation,
} from '@/lib/bizbotChats';
import { timeAgo } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

/**
 * Saved BizBot chats.
 *
 * Conversations used to vanish on the back button, which is hostile for these
 * questions in particular: you look up what documents you need, then want to
 * check it again a week later standing at the agency counter.
 *
 * Purge is offered plainly — asking an assistant whether the tax man is coming
 * for you is private, and the answer to "can I delete this" should be yes.
 */
export default function BizBotChatsScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [chats, setChats] = useState<BizBotConversation[] | null>(null);

  const load = useCallback(async () => {
    setChats(await listConversations());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const removeOne = (chat: BizBotConversation) => {
    Alert.alert('Delete this chat?', `"${chat.title}" will be gone for good.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteConversation(chat.id);
          void load();
        },
      },
    ]);
  };

  const removeAll = () => {
    if (!session) return;
    Alert.alert(
      'Delete every chat?',
      'All your BizBot conversations will be permanently removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: async () => {
            await deleteAllConversations(session.user.id);
            void load();
          },
        },
      ],
    );
  };

  if (chats === null) {
    return (
      <Screen>
        <View style={{ gap: space.s3 }}>
          <Skeleton height={64} radius={radius.lg} />
          <Skeleton height={64} radius={radius.lg} />
          <Skeleton height={64} radius={radius.lg} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: space.s4 }}>
        <Button
          title="New chat"
          icon="add"
          fullWidth
          onPress={() => router.replace('/formalize/bizbot')}
        />

        {chats.length === 0 ? (
          <EmptyState
            title="No saved chats yet"
            message="Every conversation with BizBot is kept here, so you can check an answer again later."
          />
        ) : (
          <>
            {chats.map((chat, index) => (
              <FadeSlideIn key={chat.id} delay={Math.min(index, 8) * 40}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open chat: ${chat.title}`}
                  onPress={() => {
                    lightTap();
                    router.push({ pathname: '/formalize/bizbot', params: { chat: chat.id } });
                  }}
                  onLongPress={() => removeOne(chat)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.s3,
                    padding: space.s3,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <BizBotMark size={30} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <AppText variant="label" numberOfLines={1}>
                      {chat.title}
                    </AppText>
                    <AppText variant="caption" color="textMuted">
                      {timeAgo(chat.updated_at)}
                    </AppText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete chat: ${chat.title}`}
                    hitSlop={10}
                    onPress={() => removeOne(chat)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: space.s1 })}
                  >
                    <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
                  </Pressable>
                </Pressable>
              </FadeSlideIn>
            ))}

            <Pressable
              accessibilityRole="button"
              onPress={removeAll}
              style={({ pressed }) => ({
                alignItems: 'center',
                paddingVertical: space.s3,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <AppText variant="bodySm" color="error">
                Delete all chats
              </AppText>
            </Pressable>
          </>
        )}
      </View>
    </Screen>
  );
}
