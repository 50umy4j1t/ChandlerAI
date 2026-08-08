import { Pressable, StyleSheet, View } from 'react-native';

import { Markdown } from '@/components/chat/markdown';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { ERROR_PREFIX } from '@/constants/chandler';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ChatMessage } from '@/lib/types';

type Props = {
  message: ChatMessage;
  onOpenApp?: (appId: string) => void;
};

export function MessageBubble({ message, onOpenApp }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const isUser = message.role === 'user';
  const isError = message.role === 'error';

  const bg = isError ? c.danger : isUser ? c.bubbleUser : c.bubbleAgent;
  const fg = isError ? '#fff' : isUser ? c.bubbleUserText : c.bubbleAgentText;

  return (
    <View style={[styles.row, isUser ? styles.right : styles.left]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: bg, borderColor: isUser || isError ? 'transparent' : c.border },
          isUser ? styles.bubbleUser : styles.bubbleAgent,
        ]}>
        {isUser || isError ? (
          <ThemedText style={[styles.text, { color: fg }]}>
            {isError ? `${ERROR_PREFIX} ${message.text}` : message.text}
          </ThemedText>
        ) : (
          // Only the agent writes markdown (plans come back as bullet lists).
          <Markdown
            text={message.text}
            color={fg}
            codeBg={scheme === 'dark' ? '#1A1210' : '#F1E7D8'}
            accent={c.muted}
          />
        )}

        {message.appId && onOpenApp ? (
          <Pressable
            onPress={() => onOpenApp(message.appId!)}
            style={({ pressed }) => [
              styles.openBtn,
              { backgroundColor: c.couch, opacity: pressed ? 0.75 : 1 },
            ]}>
            <IconSymbol name="square.grid.2x2.fill" size={16} color="#2A1D16" />
            <ThemedText style={styles.openLabel}>Open the app</ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', marginVertical: 4, paddingHorizontal: 12 },
  left: { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '86%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAgent: { borderBottomLeftRadius: 4 },
  text: { fontSize: 16, lineHeight: 22 },
  openBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  openLabel: { color: '#2A1D16', fontWeight: '700', fontSize: 14, lineHeight: 18 },
});
