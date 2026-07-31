import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  View,
} from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { Skeleton, lightTap } from '@/components/ui/animated';
import { EmptyState } from '@/components/ui/states';
import { publicUrl } from '@/lib/media';
import { locationLabel } from '@/lib/parishes';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeContext';
import { radius, space } from '@/theme/tokens';

interface ExploreItem {
  item_id: string;
  storage_path: string;
  caption: string;
  worker_id: string;
  full_name: string;
  avatar_url: string | null;
  headline: string;
  parish: string;
  reputation: number;
  rating_avg: number;
  rating_count: number;
  identity_verified: boolean;
}

const PAGE = 24;

/*
  A two-column mosaic. Alternating tile heights stop the grid reading as a
  spreadsheet of squares — the work is the content here, so it should look like
  a gallery.
*/
const GUTTER = space.s2;
const COLUMN = (Dimensions.get('window').width - space.s4 * 2 - GUTTER) / 2;
const TALL = COLUMN * 1.38;
const SHORT = COLUMN * 1.05;

/**
 * Explore — browse the work, not the listings.
 *
 * Search assumes you can name what you need. Plenty of customers cannot: they
 * know they want their yard to look like *that*, or they are simply curious who
 * is on here. This is the front door for them — photographs of real finished
 * jobs, each one a tap away from the person who did it.
 *
 * It is also the fastest answer to "is this app actually used?", which is the
 * first thing a sceptical new user is really asking.
 */
export default function ExploreScreen() {
  const { colors } = useTheme();
  const [items, setItems] = useState<ExploreItem[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (offset: number) => {
    const { data, error: rpcError } = await supabase.rpc('get_explore_feed', {
      p_limit: PAGE,
      p_offset: offset,
    });
    if (rpcError) throw new Error(rpcError.message);
    return (data as ExploreItem[] | null) ?? [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchPage(0);
        if (cancelled) return;
        setItems(rows);
        setExhausted(rows.length < PAGE);
      } catch (e) {
        if (cancelled) return;
        // A failure has to say so. An empty grid would read as "nobody has
        // posted any work", which is a very different and much worse message.
        setError(e instanceof Error ? e.message : 'Could not load Explore.');
        setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    if (loadingMore || exhausted || !items || items.length === 0) return;
    setLoadingMore(true);
    try {
      const rows = await fetchPage(items.length);
      setItems((current) => [...(current ?? []), ...rows]);
      if (rows.length < PAGE) setExhausted(true);
    } catch {
      // Paging failures are silent on purpose — what is already on screen is
      // still good, and an alert on scroll would be worse than stopping.
      setExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  };

  if (items === null) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', gap: GUTTER }}>
          <View style={{ flex: 1, gap: GUTTER }}>
            <Skeleton height={TALL} radius={radius.lg} />
            <Skeleton height={SHORT} radius={radius.lg} />
          </View>
          <View style={{ flex: 1, gap: GUTTER }}>
            <Skeleton height={SHORT} radius={radius.lg} />
            <Skeleton height={TALL} radius={radius.lg} />
          </View>
        </View>
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen>
        <EmptyState
          title={error ? 'Explore is unavailable' : 'No work posted yet'}
          message={
            error ??
            'When pros add photos of finished jobs they show up here. Be the first — add work to your profile.'
          }
          actionTitle="Search instead"
          onAction={() => router.replace('/search')}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.item_id}
        numColumns={2}
        columnWrapperStyle={{ gap: GUTTER }}
        contentContainerStyle={{ gap: GUTTER, paddingBottom: space.s8 }}
        showsVerticalScrollIndicator={false}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={
          <View style={{ gap: space.s1, paddingBottom: space.s3 }}>
            <AppText variant="h2">Explore the work</AppText>
            <AppText variant="bodySm" color="textMuted">
              Real jobs, finished by real pros. Tap any photo to see who did it.
            </AppText>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: space.s5, alignItems: 'center' }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : exhausted ? (
            <View style={{ paddingVertical: space.s5, alignItems: 'center' }}>
              <AppText variant="caption" color="textMuted">
                That’s everything for today — new work appears daily.
              </AppText>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <ExploreTile item={item} height={index % 4 === 0 || index % 4 === 3 ? TALL : SHORT} />
        )}
      />
    </Screen>
  );
}

function ExploreTile({ item, height }: { item: ExploreItem; height: number }) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Work by ${item.full_name}. ${item.caption || item.headline}`}
      onPress={() => {
        lightTap();
        router.push({ pathname: '/worker/[id]', params: { id: item.worker_id } });
      }}
      style={({ pressed }) => ({
        flex: 1,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View
        style={{
          height,
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: colors.surfaceRaised,
        }}
      >
        <Image
          source={{ uri: publicUrl('portfolios', item.storage_path) }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />

        {/* The photo is the hook; the person is the point. A scrim keeps the
            name legible over whatever the image happens to be. */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.78)']}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingTop: space.s6,
            paddingHorizontal: space.s2,
            paddingBottom: space.s2,
            gap: space.s1,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
            <Avatar name={item.full_name} uri={item.avatar_url} size="sm" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <AppText
                  variant="caption"
                  numberOfLines={1}
                  style={{ color: '#FFFFFF', flexShrink: 1, fontSize: 12 }}
                >
                  {item.full_name}
                </AppText>
                {item.identity_verified && (
                  <Ionicons name="checkmark-circle" size={12} color="#4FC3F7" />
                )}
              </View>
              <AppText
                variant="caption"
                numberOfLines={1}
                style={{ color: 'rgba(255,255,255,0.78)', fontSize: 10 }}
              >
                {item.rating_count > 0
                  ? `${Number(item.rating_avg).toFixed(1)}★ · ${locationLabel(item.parish)}`
                  : locationLabel(item.parish)}
              </AppText>
            </View>
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  );
}
