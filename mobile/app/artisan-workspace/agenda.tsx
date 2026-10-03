import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  listArtisanBusinessJobs,
  type ArtisanBusinessJob,
} from '@/lib/artisanWorkspace';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, spacing, type } from '@/ui/tokens';

function dateLabel(value: string | null) {
  if (!value) return 'À planifier';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'À planifier'
    : date.toLocaleString('fr-FR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export default function ArtisanAgenda() {
  const [items, setItems] = useState<ArtisanBusinessJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listArtisanBusinessJobs());
      setError('');
    } catch {
      setError('Impossible de charger votre agenda.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
            <Text style={styles.back} onPress={() => router.back()}>‹ Artisan OS</Text>
            <Text style={styles.kicker}>AGENDA</Text>
            <Text style={styles.title}>Vos prochaines interventions.</Text>
            <Text style={styles.subtitle}>
              Les interventions personnelles restent séparées des missions marketplace.
            </Text>
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          <FixeoCard tone="muted">
            <Text style={styles.emptyTitle}>Agenda libre.</Text>
            <Text style={styles.emptyText}>
              Aucune intervention personnelle planifiée.
            </Text>
          </FixeoCard>
        }
        renderItem={({ item }) => (
          <FixeoCard style={styles.card}>
            <Text style={styles.date}>{dateLabel(item.scheduled_at)}</Text>
            <Text style={styles.name}>{item.title}</Text>
            <Text style={styles.meta}>
              {item.status}
              {item.amount != null ? ` · ${Math.round(item.amount)} DH` : ''}
            </Text>
          </FixeoCard>
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
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
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
  card: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  date: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    color: colors.textMuted,
  },
  name: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
  },
  meta: { color: colors.textMuted },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  emptyText: {
    marginTop: spacing.sm,
    color: colors.textMuted,
  },
});
