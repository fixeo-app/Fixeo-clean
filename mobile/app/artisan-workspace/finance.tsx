import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  listArtisanLedger,
  type ArtisanLedgerEntry,
} from '@/lib/artisanWorkspace';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, spacing, type } from '@/ui/tokens';

export default function ArtisanFinance() {
  const [items, setItems] = useState<ArtisanLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listArtisanLedger());
      setError('');
    } catch {
      setError('Impossible de charger vos mouvements.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const key = item.entry_type === 'expense' ? 'expense' : 'income';
        acc[key] += Number(item.amount || 0);
        return acc;
      },
      { income: 0, expense: 0 },
    );
  }, [items]);

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
            <Text style={styles.kicker}>FINANCE</Text>
            <Text style={styles.title}>Votre activité en chiffres.</Text>
            <Text style={styles.subtitle}>
              Vue simple de vos encaissements et dépenses personnels enregistrés dans Artisan OS.
            </Text>

            <View style={styles.totalRow}>
              <FixeoCard tone="dark" style={styles.totalCard}>
                <Text style={styles.inverseKicker}>ENCAISSÉ</Text>
                <Text style={styles.inverseTotal}>{Math.round(totals.income)} DH</Text>
              </FixeoCard>
              <FixeoCard tone="muted" style={styles.totalCard}>
                <Text style={styles.kicker}>DÉPENSES</Text>
                <Text style={styles.total}>{Math.round(totals.expense)} DH</Text>
              </FixeoCard>
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          <FixeoCard tone="muted">
            <Text style={styles.emptyTitle}>Aucun mouvement enregistré.</Text>
            <Text style={styles.emptyText}>
              Les encaissements et dépenses personnels apparaîtront ici.
            </Text>
          </FixeoCard>
        }
        renderItem={({ item }) => (
          <FixeoCard style={styles.card}>
            <View style={styles.row}>
              <View style={styles.copy}>
                <Text style={styles.name}>{item.category || item.entry_type}</Text>
                <Text style={styles.meta}>
                  {item.occurred_on}{item.note ? ` · ${item.note}` : ''}
                </Text>
              </View>
              <Text style={styles.amount}>
                {item.entry_type === 'expense' ? '−' : '+'}{Math.round(item.amount)} DH
              </Text>
            </View>
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
  totalRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  totalCard: {
    flex: 1,
    gap: spacing.xs,
  },
  inverseKicker: {
    color: '#A8A8AC',
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  inverseTotal: {
    color: colors.inverse,
    fontSize: 24,
    fontWeight: '900',
  },
  total: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  error: {
    color: colors.danger,
    fontWeight: '700',
  },
  card: { marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  amount: {
    fontSize: 18,
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
