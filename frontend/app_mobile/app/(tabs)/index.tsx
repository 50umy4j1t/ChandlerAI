import { useRouter } from 'expo-router';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  ImageBackground,
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

// ---- Colors pulled from the Central Perk background photo ----------------
// Background photo lives at: assets/images/central-perk-bg.jpeg
const BG_IMAGE = require('@/assets/images/central-perk-bg.jpeg');
// Logo illustration lives at: assets/images/chandler-logo.png
const LOGO_IMAGE = require('@/assets/images/chandler-logo.png');
const ICON_IMAGE = require('@/assets/images/icon.png');

const PERK = {
  headerBg: '#122c22', // deep brick-shadow green, matches the "PERK" neon glow
  frameGold: '#c98a3a', // warm amber, matches the neon sign's frame/wood tones
  title: '#f4ece0', // warm off-white
  tagline: '#c9bfa8', // muted parchment
  accent: '#d3763b', // warm orange, echoes the "CENTRAL" neon red/orange
};

export default function ChatScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const { messages, streamingText, status, send, stopRun, newChat, sessionId } = useChandler();
  const [headerHeight, setHeaderHeight] = useState(0);

  // Starting a new chat aborts an in-flight run, so never do it silently.
  const confirmNewChat = () => {
    if (status === 'idle') return newChat();
    Alert.alert('Still generating', 'Starting a new chat will cancel the run in progress.', [
      { text: 'Keep waiting', style: 'cancel' },
      { text: 'New chat', style: 'destructive', onPress: newChat },
    ]);
  };

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
    <View style={[styles.flex, { backgroundColor: PERK.headerBg, paddingTop: insets.top }]}>
      <View
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        style={[styles.header, { borderBottomColor: PERK.frameGold, backgroundColor: PERK.headerBg }]}>
        <Image source={LOGO_IMAGE} style={styles.logo} resizeMode="contain" />
        <View style={styles.headerCenter}>
          <ThemedText style={[styles.title, { color: PERK.title }]} numberOfLines={1}>
            {APP_TITLE}
          </ThemedText>
          <ThemedText style={[styles.tagline, { color: PERK.tagline }]} numberOfLines={1}>
            {APP_TAGLINE}
          </ThemedText>
        </View>
        <View style={styles.headerBtns}>
          <Pressable onPress={confirmNewChat} hitSlop={8} style={styles.iconBtn}>
            <IconSymbol name="square.and.pencil" size={22} color={PERK.accent} />
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} hitSlop={8} style={styles.iconBtn}>
            <IconSymbol name="gearshape.fill" size={22} color={PERK.accent} />
          </Pressable>
        </View>
      </View>

      <ImageBackground source={BG_IMAGE} resizeMode="cover" style={styles.flex}>
        <View style={styles.scrim} />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={insets.top + headerHeight}>
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
                <Image source={ICON_IMAGE} style={styles.emptyIcon} resizeMode="contain" />
                <ThemedText type="subtitle" style={{ color: PERK.title, textAlign: 'center' }}>
                  {pickLine(EMPTY_CHAT_LINES, sessionId.charCodeAt(0) || 0)}
                </ThemedText>
                <ThemedText style={[styles.tagline, { color: PERK.tagline }]}>{APP_TAGLINE}</ThemedText>
              </View>
            }
            keyboardDismissMode="interactive"
          />
          <Composer status={status} onSend={send} onStop={stopRun} />
        </KeyboardAvoidingView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8, 20, 15, 0.2)' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  frame: { flexShrink: 1, borderWidth: 3, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  logo: { width: 42, height: 42, borderRadius: 8 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  title: { fontSize: 17, fontWeight: '800', lineHeight: 22, textAlign: 'center' },
  headerBtns: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },
  listContent: { paddingVertical: 12, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyIcon: { width: 96, height: 96, marginBottom: 8 },
  tagline: { fontSize: 14, textAlign: 'center', fontStyle: 'italic' },
});