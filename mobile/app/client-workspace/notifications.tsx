import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  listClientNotifications,
  markClientNotificationRead,
  type ClientNotification,
} from '@/lib/clientWorkspace';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, spacing, type } from '@/ui/tokens';

export default function ClientNotifications() {
  const [items, setItems] = useState<ClientNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listClientNotifications());
      setError('');
    } catch {
      setError('Impossible de charger vos alertes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(item: ClientNotification) {
    if (!item.read) {
      try {
        await markClientNotificationRead(item.id);
        setItems(current => current.map(row => row.id === item.id ? { ...row, read: true } : row));
      } catch {
        // Reading the message is still allowed if the acknowledgement fails.
      }
    }
  }

  return (
    <FixeoScreen padded={false}>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.back} onPress={() => router.back()}>‹ Client OS</Text>
            <Text style={styles.kicker}>ALERTES FIXEO</Text>
            <Text style={styles.title}>Ce qui mérite votre attention.</Text>
            <Text style={styles.subtitle}>Pas de bruit : seulement les événements liés à votre compte.</Text>
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          <FixeoCard tone="muted">
            <Text style={styles.emptyTitle}>Tout est calme.</Text>
            <Text style={styles.emptyText}>Aucune alerte à afficher.</Text>
          </FixeoCard>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => void open(item)}>
            <FixeoCard tone={item.read ? 'light' : 'muted'} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.titleText}>{item.title}</Text>
                {!item.read && <View style={styles.unreadDot} />}
              </View>
              <Text style={styles.message}>{item.message}</Text>
            </FixeoCard>
          </Pressable>
        )}
      />
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  back: { color: colors.textMuted, fontWeight: '800' },
  kicker: {
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    color: colors.text,
  },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  error: { color: colors.danger, fontWeight: '700' },
  card: { marginBottom: spacing.sm, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.ink,
  },
  message: { color: colors.textMuted, lineHeight: 21 },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  emptyText: { marginTop: spacing.sm, color: colors.textMuted },
});
