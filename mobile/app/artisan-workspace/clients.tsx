import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import {
  createArtisanBusinessClient,
  listArtisanBusinessClients,
  type ArtisanBusinessClient,
} from '@/lib/artisanWorkspace';
import { FixeoAction } from '@/ui/FixeoAction';
import { MobileShell } from '@/components/MobileShell';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, radius, spacing, type } from '@/ui/tokens';
import { isMobileUiTimeout, withMobileDeadline } from '@/lib/mobileResilience';
import { useForegroundRefresh } from '@/lib/useForegroundRefresh';

export default function ArtisanClients() {
  const [items, setItems] = useState<ArtisanBusinessClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await withMobileDeadline(listArtisanBusinessClients()));
      setError('');
    } catch (reason) {
      setError(
        isMobileUiTimeout(reason)
          ? 'Le réseau met trop de temps. Vos clients restent intacts : tirez pour réessayer.'
          : 'Impossible de charger vos clients.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useForegroundRefresh(load);

  async function createClient() {
    if (creating || !fullName.trim()) return;
    setCreating(true);
    try {
      const created = await withMobileDeadline(
        createArtisanBusinessClient({ fullName, phone, city }),
      );
      setItems(current => [created, ...current]);
      setFullName('');
      setPhone('');
      setCity('');
      setShowCreate(false);
      setError('');
    } catch (reason) {
      setError(
        isMobileUiTimeout(reason)
          ? 'Le réseau met trop de temps. Vérifiez la liste avant de recréer cette fiche.'
          : 'Impossible de créer cette fiche client.',
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
              activeKey="clients"
              statusLabel="CRM personnel"
              rightActionLabel="Artisan OS"
              onRightAction={() => router.replace('/artisan-workspace')}
            />
            <View style={styles.header}>
            <Text style={styles.kicker}>CRM CLIENTS</Text>
            <Text style={styles.title}>Vos clients personnels.</Text>
            <Text style={styles.subtitle}>
              Un carnet professionnel séparé du marketplace FIXEO.
            </Text>

            <FixeoAction
              label={showCreate ? 'Fermer' : '+ Ajouter un client'}
              variant={showCreate ? 'ghost' : 'primary'}
              onPress={() => setShowCreate(value => !value)}
            />

            {showCreate && (
              <FixeoCard style={styles.form}>
                <Text style={styles.formTitle}>Nouvelle fiche client</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Nom du client"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Téléphone"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder="Ville"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  style={styles.input}
                />
                <FixeoAction
                  label={creating ? 'Création…' : 'Créer la fiche'}
                  disabled={creating || !fullName.trim()}
                  onPress={() => void createClient()}
                />
              </FixeoCard>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}
            </View>
          </View>
        }
        ListEmptyComponent={
          <FixeoCard tone="muted">
            <Text style={styles.emptyTitle}>Votre CRM est prêt.</Text>
            <Text style={styles.emptyText}>
              Ajoutez votre premier client personnel pour préparer devis et interventions sans mélanger le marketplace FIXEO.
            </Text>
          </FixeoCard>
        }
        renderItem={({ item }) => (
          <FixeoCard style={styles.card}>
            <Text style={styles.name}>{item.full_name}</Text>
            <Text style={styles.meta}>
              {[item.city, item.phone].filter(Boolean).join(' · ') || 'Coordonnées à compléter'}
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
  subtitle: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  error: {
    color: colors.danger,
    fontWeight: '700',
  },
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
  name: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
  },
  meta: {
    color: colors.textMuted,
    lineHeight: 20,
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
