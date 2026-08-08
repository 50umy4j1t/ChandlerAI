import { useRouter } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useChandler } from '@/providers/chandler-provider';

export default function ChatsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { chats, sessionId, openChat, removeChat, newChat } = useChandler();

  const confirmDelete = (sid: string, title: string) =>
    Alert.alert('Delete chat?', `"${title}" will be gone. Could this BE any more permanent?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void removeChat(sid) },
    ]);

  return (
    <View style={[styles.flex, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <ThemedText type="subtitle" style={{ color: c.text }}>
          The Gang
        </ThemedText>
        <Pressable
          onPress={() => {
            newChat();
            router.push('/');
          }}
          hitSlop={8}
          style={styles.iconBtn}>
          <IconSymbol name="square.and.pencil" size={22} color={c.teal} />
        </Pressable>
      </View>

      <FlatList
        data={chats}
        keyExtractor={(item) => item.sessionId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText style={{ color: c.muted, textAlign: 'center' }}>
              No chats yet. Start one — I&apos;ll be here, being witty.
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => {
          const active = item.sessionId === sessionId;
          return (
            <Pressable
              onPress={async () => {
                await openChat(item.sessionId);
                router.push('/');
              }}
              onLongPress={() => confirmDelete(item.sessionId, item.title)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: c.surface,
                  borderColor: active ? c.couch : c.border,
                  borderLeftWidth: active ? 4 : StyleSheet.hairlineWidth,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}>
              <View style={styles.rowText}>
                <ThemedText numberOfLines={1} style={[styles.rowTitle, { color: c.text }]}>
                  {item.title || 'Untitled chat'}
                </ThemedText>
                <ThemedText style={[styles.rowMeta, { color: c.muted }]}>
                  {new Date(item.updatedAt).toLocaleString()}
                </ThemedText>
              </View>
              <Pressable onPress={() => confirmDelete(item.sessionId, item.title)} hitSlop={10}>
                <IconSymbol name="trash" size={18} color={c.muted} />
              </Pressable>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { padding: 6 },
  listContent: { padding: 12, gap: 8, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowMeta: { fontSize: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
