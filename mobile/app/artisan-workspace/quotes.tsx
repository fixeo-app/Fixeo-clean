import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import {
  createArtisanBusinessQuote,
  listArtisanBusinessQuotes,
  type ArtisanBusinessQuote,
} from '@/lib/artisanWorkspace';
import { FixeoAction } from '@/ui/FixeoAction';
import { MobileShell } from '@/components/MobileShell';
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
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [total, setTotal] = useState('');
  const [description, setDescription] = useState('');

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

  async function createQuote() {
    if (creating || !title.trim()) return;
    setCreating(true);
    try {
      const amount = Number(total.replace(',', '.')) || 0;
      const created = await createArtisanBusinessQuote({
        title,
        total: amount,
        description,
      });
      setItems(current => [created, ...current]);
      setTitle('');
      setTotal('');
      setDescription('');
      setShowCreate(false);
      setError('');
    } catch {
      setError('Impossible de créer ce brouillon de devis.');
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
          <View>
            <MobileShell
              universe="artisan"
              activeKey="quotes"
              statusLabel="Devis Studio"
              rightActionLabel="Artisan OS"
              onRightAction={() => router.replace('/artisan-workspace')}
            />
            <View style={styles.header}>
            <Text style={styles.back} onPress={() => router.back()}>‹ Artisan OS</Text>
            <Text style={styles.kicker}>DEVIS STUDIO</Text>
            <Text style={styles.title}>Vos devis, au même endroit.</Text>
            <Text style={styles.subtitle}>
              Créez un brouillon personnel en quelques secondes. Les missions marketplace restent séparées.
            </Text>

            <FixeoAction
              label={showCreate ? 'Fermer' : '+ Nouveau devis'}
              variant={showCreate ? 'ghost' : 'primary'}
              onPress={() => setShowCreate(value => !value)}
            />

            {showCreate && (
              <FixeoCard style={styles.form}>
                <Text style={styles.formTitle}>Nouveau brouillon</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Objet du devis"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Description courte"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={[styles.input, styles.multiline]}
                />
                <TextInput
                  value={total}
                  onChangeText={setTotal}
                  placeholder="Montant total en DH"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <FixeoAction
                  label={creating ? 'Création…' : 'Créer le brouillon'}
                  disabled={creating || !title.trim()}
                  onPress={() => void createQuote()}
                />
              </FixeoCard>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}
            </View>
          </View>
        }
        ListEmptyComponent={
          <FixeoCard tone="muted">
            <Text style={styles.emptyTitle}>Devis Studio est prêt.</Text>
            <Text style={styles.emptyText}>
              Créez votre premier brouillon. Vous pourrez enrichir ensuite prestations, fournitures et conditions.
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
                <Text style={styles.pillText}>{item.status === 'draft' ? 'Brouillon' : item.status}</Text>
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
  multiline: {
    minHeight: 86,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
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
