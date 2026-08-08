import { useRouter } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useChandler } from '@/providers/chandler-provider';

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

export default function ArchiveScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { apps, removeApp } = useChandler();

  const confirmDelete = (id: string, name: string) =>
    Alert.alert('Delete app?', `"${name}" will be removed from The Archive.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void removeApp(id) },
    ]);

  return (
    <View style={[styles.flex, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <ThemedText type="subtitle" style={{ color: c.text }}>
          The Archive
        </ThemedText>
        <ThemedText style={{ color: c.muted, fontSize: 13 }}>
          {apps.length} app{apps.length === 1 ? '' : 's'}
        </ThemedText>
      </View>

      <FlatList
        data={apps}
        keyExtractor={(a) => a.id}
        numColumns={2}
        columnWrapperStyle={styles.col}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText style={{ color: c.muted, textAlign: 'center' }}>
              Nothing here yet. Ask for an app and it lands in the frame.
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/viewer', params: { id: item.id } })}
            onLongPress={() => confirmDelete(item.id, item.name)}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: c.surface, borderColor: c.frame, opacity: pressed ? 0.8 : 1 },
            ]}>
            <View style={[styles.thumb, { backgroundColor: c.background, borderColor: c.border }]}>
              <IconSymbol name="square.grid.2x2.fill" size={30} color={c.couch} />
            </View>
            <ThemedText numberOfLines={2} style={[styles.cardTitle, { color: c.text }]}>
              {item.name}
            </ThemedText>
            <ThemedText style={[styles.cardMeta, { color: c.muted }]}>
              {kb(item.size)} · {new Date(item.createdAt).toLocaleDateString()}
            </ThemedText>
          </Pressable>
        )}
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
  listContent: { padding: 12, gap: 12, flexGrow: 1 },
  col: { gap: 12 },
  card: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 3, gap: 6 },
  thumb: {
    height: 92,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  cardMeta: { fontSize: 11 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
