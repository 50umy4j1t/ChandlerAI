import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  BUILDING_LINES,
  LOADING_LINES,
  RECONNECTING_LINES,
  STREAMING_LINES,
  pickLine,
} from '@/constants/chandler';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { RunStatus } from '@/lib/types';

export function TypingIndicator({ status }: { status: RunStatus }) {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const [tick, setTick] = useState(0);

  // Rotate the quip so a slow generation doesn't feel stuck.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 4000);
    return () => clearInterval(id);
  }, []);

  // Stays up through 'streaming' too: the run isn't over until the server says
  // so, and a spinner that vanishes mid-answer reads as "finished".
  if (status === 'idle') return null;

  const lines =
    status === 'building'
      ? BUILDING_LINES
      : status === 'reconnecting'
        ? RECONNECTING_LINES
        : status === 'streaming'
          ? STREAMING_LINES
          : LOADING_LINES;

  return (
    <View style={[styles.wrap, { backgroundColor: c.bubbleAgent, borderColor: c.border }]}>
      <ActivityIndicator size="small" color={c.couch} />
      <ThemedText style={[styles.text, { color: c.muted }]}>{pickLine(lines, tick)}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    marginHorizontal: 12,
    marginVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { fontSize: 14, lineHeight: 18, flexShrink: 1 },
});
