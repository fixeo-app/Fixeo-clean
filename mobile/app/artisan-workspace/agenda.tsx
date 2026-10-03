import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import {
  createArtisanBusinessJob,
  listArtisanBusinessJobs,
  type ArtisanBusinessJob,
} from '@/lib/artisanWorkspace';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, radius, spacing, type } from '@/ui/tokens';

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

function parseDate(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function ArtisanAgenda() {
  const [items, setItems] = useState<ArtisanBusinessJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [amount, setAmount] = useState('');

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

  async function createJob() {
    if (creating || !title.trim()) return;
    const parsedDate = parseDate(scheduledAt);
    if (scheduledAt.trim() && !parsedDate) {
      setError('Utilisez une date comme 2026-10-05 14:30.');
      return;
    }

    setCreating(true);
    try {
      const created = await createArtisanBusinessJob({
        title,
        scheduledAt: parsedDate,
        amount: amount.trim() ? Number(amount.replace(',', '.')) || 0 : null,
      });
      setItems(current => [created, ...current]);
      setTitle('');
      setScheduledAt('');
      setAmount('');
      setShowCreate(false);
      setError('');
    } catch {
      setError('Impossible de planifier cette intervention.');
    } finally {
      setCreating(false);
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
            <Text style={styles.back} onPress={() => router.back()}>‹ Artisan OS</Text>
            <Text style={styles.kicker}>AGENDA</Text>
            <Text style={styles.title}>Vos prochaines interventions.</Text>
            <Text style={styles.subtitle}>
              Planifiez vos interventions personnelles sans les confondre avec les missions marketplace.
            </Text>

            <FixeoAction
              label={showCreate ? 'Fermer' : '+ Planifier une intervention'}
              variant={showCreate ? 'ghost' : 'primary'}
              onPress={() => setShowCreate(value => !value)}
            />

            {showCreate && (
              <FixeoCard style={styles.form}>
                <Text style={styles.formTitle}>Nouvelle intervention</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Objet de l’intervention"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <TextInput
                  value={scheduledAt}
                  onChangeText={setScheduledAt}
                  placeholder="2026-10-05 14:30"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="Montant prévu en DH"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <FixeoAction
                  label={creating ? 'Planification…' : 'Ajouter à l’agenda'}
                  disabled={creating || !title.trim()}
                  onPress={() => void createJob()}
                />
              </FixeoCard>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          <FixeoCard tone="muted">
            <Text style={styles.emptyTitle}>Agenda libre.</Text>
            <Text style={styles.emptyText}>
              Planifiez votre première intervention personnelle pour commencer à organiser votre activité.
            </Text>
          </FixeoCard>
        }
        renderItem={({ item }) => (
          <FixeoCard style={styles.card}>
            <Text style={styles.date}>{dateLabel(item.scheduled_at)}</Text>
            <Text style={styles.name}>{item.title}</Text>
            <Text style={styles.meta}>
              {item.status === 'planned' ? 'Planifiée' : item.status}
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
  form: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: type.body,
  },
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
