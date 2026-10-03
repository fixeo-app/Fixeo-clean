import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import {
  createArtisanLedgerEntry,
  listArtisanLedger,
  type ArtisanLedgerEntry,
} from '@/lib/artisanWorkspace';
import { FixeoAction } from '@/ui/FixeoAction';
import { MobileShell } from '@/components/MobileShell';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, radius, spacing, type } from '@/ui/tokens';
import { isMobileUiTimeout, withMobileDeadline } from '@/lib/mobileResilience';
import { useForegroundRefresh } from '@/lib/useForegroundRefresh';

export default function ArtisanFinance() {
  const [items, setItems] = useState<ArtisanLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await withMobileDeadline(listArtisanLedger()));
      setError('');
    } catch (reason) {
      setError(
        isMobileUiTimeout(reason)
          ? 'Le réseau met trop de temps. Vos mouvements restent intacts : tirez pour réessayer.'
          : 'Impossible de charger vos mouvements.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useForegroundRefresh(load);

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

  const balance = totals.income - totals.expense;

  async function createEntry() {
    const value = Number(amount.replace(',', '.')) || 0;
    if (creating || !value) return;
    setCreating(true);
    try {
      const created = await withMobileDeadline(createArtisanLedgerEntry({
        entryType,
        amount: value,
        category,
        note,
      }));
      setItems(current => [created, ...current]);
      setAmount('');
      setCategory('');
      setNote('');
      setShowCreate(false);
      setError('');
    } catch (reason) {
      setError(
        isMobileUiTimeout(reason)
          ? 'Le réseau met trop de temps. Vérifiez la liste avant de réessayer pour éviter un doublon.'
          : 'Impossible d’enregistrer ce mouvement.',
      );
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View>
            <MobileShell
              universe="artisan"
              activeKey="finance"
              statusLabel="Finance personnelle"
              rightActionLabel="Artisan OS"
              onRightAction={() => router.replace('/artisan-workspace')}
            />
            <View style={styles.header}>
            <Text style={styles.back} onPress={() => router.back()}>‹ Artisan OS</Text>
            <Text style={styles.kicker}>FINANCE</Text>
            <Text style={styles.title}>Votre activité en chiffres.</Text>
            <Text style={styles.subtitle}>
              Encaissements et dépenses personnels, sans mélanger les flux marketplace FIXEO.
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

            <FixeoCard style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>SOLDE PERSONNEL</Text>
              <Text style={styles.balanceValue}>{Math.round(balance)} DH</Text>
            </FixeoCard>

            <FixeoAction
              label={showCreate ? 'Fermer' : '+ Ajouter un mouvement'}
              variant={showCreate ? 'ghost' : 'primary'}
              onPress={() => setShowCreate(value => !value)}
            />

            {showCreate && (
              <FixeoCard style={styles.form}>
                <Text style={styles.formTitle}>Nouveau mouvement</Text>
                <View style={styles.typeRow}>
                  <FixeoAction
                    label="Encaissement"
                    labelNumberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    variant={entryType === 'income' ? 'primary' : 'secondary'}
                    style={styles.typeAction}
                    onPress={() => setEntryType('income')}
                  />
                  <FixeoAction
                    label="Dépense"
                    labelNumberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    variant={entryType === 'expense' ? 'primary' : 'secondary'}
                    style={styles.typeAction}
                    onPress={() => setEntryType('expense')}
                  />
                </View>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="Montant en DH"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <TextInput
                  value={category}
                  onChangeText={setCategory}
                  placeholder="Catégorie"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Note facultative"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <FixeoAction
                  label={creating ? 'Enregistrement…' : 'Enregistrer'}
                  disabled={creating || !amount.trim()}
                  onPress={() => void createEntry()}
                />
              </FixeoCard>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}
            </View>
          </View>
        }
        ListEmptyComponent={
          <FixeoCard tone="muted">
            <Text style={styles.emptyTitle}>Aucun mouvement enregistré.</Text>
            <Text style={styles.emptyText}>
              Ajoutez votre premier encaissement ou votre première dépense pour commencer le suivi.
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
  balanceCard: {
    gap: spacing.xs,
  },
  balanceLabel: {
    color: colors.textMuted,
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  balanceValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  error: {
    color: colors.danger,
    fontWeight: '700',
  },
  form: {
    gap: spacing.sm,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typeAction: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
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
