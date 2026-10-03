import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  listArtisanBusinessQuotes,
  type ArtisanBusinessQuote,
} from '@/lib/artisanWorkspace';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, radius, spacing, type } from '@/ui/tokens';

function money(value: number | null) {
  if (value == null) return 'Montant à définir';
  return `${Math.round(value)} DH`;
}

export default function ArtisanQuotes() {
  const [items, setItems] = useState<ArtisanBusinessQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listArtisanBusinessQuotes());
      setError('');
    } catch {
      setError('Impossible de charger vos devis.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
            <Text style={styles.kicker}>DEVIS STUDIO</Text>
            <Text style={styles.title}>Vos devis, au même endroit.</Text>
            <Text style={styles.subtitle}>
              Le mobile lit vos devis personnels canoniques sans les confondre avec les missions marketplace.
            </Text>
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          <FixeoCard tone="muted">
            <Text style={styles.emptyTitle}>Aucun devis personnel.</Text>
            <Text style={styles.emptyText}>
              Les devis créés depuis Artisan OS apparaîtront ici.
            </Text>
          </FixeoCard>
        }
        renderItem={({ item }) => (
          <FixeoCard style={styles.card}>
            <View style={styles.row}>
              <View style={styles.copy}>
                <Text style={styles.number}>{item.quote_number}</Text>
                <Text style={styles.name}>{item.title || 'Devis sans titre'}</Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{item.status}</Text>
              </View>
            </View>
            <Text style={styles.total}>{money(item.total)}</Text>
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
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  number: {
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
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: colors.surfaceMuted,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.textMuted,
  },
  total: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  emptyText: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    lineHeight: 21,
  },
});
