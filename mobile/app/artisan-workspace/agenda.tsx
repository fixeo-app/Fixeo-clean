import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  createArtisanBusinessJob,
  listArtisanBusinessJobs,
  type ArtisanBusinessJob,
} from '@/lib/artisanWorkspace';
import { FixeoAction } from '@/ui/FixeoAction';
import { MobileShell } from '@/components/MobileShell';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, radius, spacing, type } from '@/ui/tokens';
import {
  agendaDatePreview,
  formatAgendaDateInput,
  formatAgendaTimeInput,
  parseAgendaDateTime,
} from '@/lib/agendaDate';
import { isMobileUiTimeout, withMobileDeadline } from '@/lib/mobileResilience';
import { useForegroundRefresh } from '@/lib/useForegroundRefresh';

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
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [dateText, setDateText] = useState('');
  const [timeText, setTimeText] = useState('');
  const [amount, setAmount] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await withMobileDeadline(listArtisanBusinessJobs()));
      setError('');
    } catch (reason) {
      setError(
        isMobileUiTimeout(reason)
          ? 'Le réseau met trop de temps. Votre agenda reste intact : tirez pour réessayer.'
          : 'Impossible de charger votre agenda.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useForegroundRefresh(load);

  const schedulePreview = useMemo(
    () => agendaDatePreview(dateText, timeText),
    [dateText, timeText],
  );

  async function createJob() {
    if (creating || !title.trim()) return;

    const hasSchedule = Boolean(dateText.trim() || timeText.trim());
    const parsedDate = hasSchedule ? parseAgendaDateTime(dateText, timeText) : null;
    if (hasSchedule && !parsedDate) {
      setError('Indiquez une date complète (JJ/MM/AAAA) et une heure valide (HH:MM).');
      return;
    }

    setCreating(true);
    try {
      const created = await withMobileDeadline(createArtisanBusinessJob({
        title,
        scheduledAt: parsedDate,
        amount: amount.trim() ? Number(amount.replace(',', '.')) || 0 : null,
      }));
      setItems(current => [created, ...current]);
      setTitle('');
      setDateText('');
      setTimeText('');
      setAmount('');
      setShowCreate(false);
      setError('');
    } catch (reason) {
      setError(
        isMobileUiTimeout(reason)
          ? 'Le réseau met trop de temps. Rien n’a été ajouté deux fois : vérifiez l’agenda puis réessayez si nécessaire.'
          : 'Impossible de planifier cette intervention.',
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <FixeoScreen padded={false} header={
        <MobileShell
          universe="artisan"
          activeKey="agenda"
          statusLabel="Agenda professionnel"
          rightActionLabel="Artisan OS"
          rightDestination="/artisan-workspace"
        />
      }>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
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
                <View style={styles.dateTimeRow}>
                  <View style={styles.dateTimeField}>
                    <Text style={styles.fieldLabel}>Date</Text>
                    <TextInput
                      value={dateText}
                      onChangeText={value => setDateText(formatAgendaDateInput(value))}
                      placeholder="05/10/2026"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                      maxLength={10}
                      style={styles.input}
                    />
                  </View>
                  <View style={styles.dateTimeField}>
                    <Text style={styles.fieldLabel}>Heure</Text>
                    <TextInput
                      value={timeText}
                      onChangeText={value => setTimeText(formatAgendaTimeInput(value))}
                      placeholder="14:30"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                      maxLength={5}
                      style={styles.input}
                    />
                  </View>
                </View>
                {!!schedulePreview && (
                  <View style={styles.previewPill}>
                    <Text style={styles.previewText}>Prévu · {schedulePreview}</Text>
                  </View>
                )}
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
  dateTimeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateTimeField: {
    flex: 1,
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  previewPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  previewText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
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
