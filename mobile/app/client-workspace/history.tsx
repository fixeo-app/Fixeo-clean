import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  listClientRequestHistory,
  type ClientRequestHistory,
} from '@/lib/clientWorkspace';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, radius, spacing, type } from '@/ui/tokens';
import { formatWorkspaceDate, isTechnicalRequestContent } from '@/lib/workspacePresentation';

const STATUS: Record<string, string> = {
  new: 'Recherche',
  assigned: 'Artisan trouvé',
  in_progress: 'En intervention',
  completed: 'À valider',
  validated: 'Terminée',
  cancelled: 'Annulée',
  no_match: 'À reprendre',
};

export default function ClientHistory() {
  const [items, setItems] = useState<ClientRequestHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const history = await listClientRequestHistory();
      setItems(history.filter(item => !isTechnicalRequestContent(item)));
      setError('');
    } catch {
      setError('Impossible de charger vos interventions.');
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
            <Text style={styles.back} onPress={() => router.back()}>‹ Mon espace</Text>
            <Text style={styles.kicker}>MES INTERVENTIONS</Text>
            <Text style={styles.title}>Votre historique FIXEO.</Text>
            <Text style={styles.subtitle}>
              Retrouvez vos demandes, leur état et leur date — sans jargon technique.
            </Text>
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          <FixeoCard tone="muted">
            <Text style={styles.emptyTitle}>Aucune intervention pour le moment.</Text>
            <Text style={styles.emptyText}>Votre prochaine demande apparaîtra ici automatiquement.</Text>
          </FixeoCard>
        }
        renderItem={({ item }) => (
          <FixeoCard style={styles.card}>
            <View style={styles.row}>
              <View style={styles.copy}>
                <Text style={styles.name}>{item.service_category || 'Intervention FIXEO'}</Text>
                <Text style={styles.meta}>{item.city || 'Ville non renseignée'}</Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{STATUS[item.status] || item.status}</Text>
              </View>
            </View>
            {!!item.description && <Text style={styles.description}>{item.description}</Text>}
            <View style={styles.footerRow}>
              <Text style={styles.date}>{formatWorkspaceDate(item.created_at)}</Text>
              {['new', 'assigned', 'in_progress', 'completed'].includes(item.status) && (
                <FixeoAction
                  label={item.status === 'completed' ? 'Vérifier' : 'Reprendre le suivi'}
                  variant="ghost"
                  style={styles.compactAction}
                  onPress={() => router.replace('/')}
                />
              )}
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
  card: { marginBottom: spacing.sm, gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  copy: { flex: 1, gap: 4 },
  name: { fontSize: 20, fontWeight: '900', color: colors.text },
  meta: { color: colors.textMuted },
  pill: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
  },
  pillText: { fontSize: 11, fontWeight: '900', color: colors.textMuted },
  description: { color: colors.text, lineHeight: 21 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  date: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  compactAction: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  emptyText: { marginTop: spacing.sm, color: colors.textMuted, lineHeight: 21 },
});
