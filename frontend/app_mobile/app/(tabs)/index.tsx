import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Composer } from '@/components/chat/composer';
import { MessageBubble } from '@/components/chat/message-bubble';
import { TypingIndicator } from '@/components/chat/typing-indicator';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { APP_TAGLINE, APP_TITLE, EMPTY_CHAT_LINES, pickLine } from '@/constants/chandler';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useChandler } from '@/providers/chandler-provider';
import type { ChatMessage } from '@/lib/types';

export default function ChatScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const { messages, streamingText, status, send, stopRun, newChat, sessionId } = useChandler();

  // The in-flight reply is rendered as a synthetic message so the list scrolls naturally.
  const data = useMemo<ChatMessage[]>(
    () =>
      streamingText
        ? [
            ...messages,
            { id: '__streaming__', role: 'assistant', text: streamingText, createdAt: Date.now() },
          ]
        : messages,
    [messages, streamingText],
  );

  useEffect(() => {
    if (data.length) listRef.current?.scrollToEnd({ animated: true });
  }, [data.length, streamingText]);

  return (
    <View style={[styles.flex, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <View style={[styles.frame, { borderColor: c.frame }]}>
          <ThemedText style={[styles.title, { color: c.text }]} numberOfLines={1}>
            {APP_TITLE}
          </ThemedText>
        </View>
        <View style={styles.headerBtns}>
          <Pressable onPress={newChat} hitSlop={8} style={styles.iconBtn}>
            <IconSymbol name="square.and.pencil" size={22} color={c.teal} />
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} hitSlop={8} style={styles.iconBtn}>
            <IconSymbol name="gearshape.fill" size={22} color={c.teal} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 8}>
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              onOpenApp={(appId) => router.push({ pathname: '/viewer', params: { id: appId } })}
            />
          )}
          ListFooterComponent={<TypingIndicator status={status} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyFrame, { borderColor: c.frame }]} />
              <ThemedText type="subtitle" style={{ color: c.text, textAlign: 'center' }}>
                {pickLine(EMPTY_CHAT_LINES, sessionId.charCodeAt(0) || 0)}
              </ThemedText>
              <ThemedText style={[styles.tagline, { color: c.muted }]}>{APP_TAGLINE}</ThemedText>
            </View>
          }
          keyboardDismissMode="interactive"
        />
        <Composer status={status} onSend={send} onStop={stopRun} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  frame: { flexShrink: 1, borderWidth: 3, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  title: { fontSize: 17, fontWeight: '800', lineHeight: 22 },
  headerBtns: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },
  listContent: { paddingVertical: 12, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyFrame: { width: 90, height: 90, borderWidth: 6, borderRadius: 8, marginBottom: 8 },
  tagline: { fontSize: 14, textAlign: 'center', fontStyle: 'italic' },
});
