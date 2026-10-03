import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  getArtisanWorkspaceSummary,
  setArtisanAvailability,
  type ArtisanAvailability,
  type ArtisanWorkspaceSummary,
} from '@/lib/artisanWorkspace';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, spacing, type } from '@/ui/tokens';
import { WorkspaceShortcutGrid } from '@/components/WorkspaceShortcutGrid';
import { MobileShell } from '@/components/MobileShell';

const STATUS_LABELS: Record<ArtisanAvailability, string> = {
  available: 'Disponible',
  busy: 'Occupé',
  unavailable: 'Indisponible',
};

export default function ArtisanWorkspaceHome() {
  const [summary, setSummary] = useState<ArtisanWorkspaceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<ArtisanAvailability | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await getArtisanWorkspaceSummary());
      setMessage('');
    } catch {
      setMessage('Impossible de charger votre espace professionnel.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(status: ArtisanAvailability) {
    if (updating) return;
    setUpdating(status);
    try {
      const next = await setArtisanAvailability(status);
      setSummary(current => current ? { ...current, availability: next } : current);
      setMessage('Disponibilité mise à jour.');
    } catch (error: any) {
      const reason = String(error?.message || '');
      setMessage(
        reason === 'onboarding_required'
          ? 'Complétez votre profil avant de vous rendre disponible.'
          : 'Impossible de modifier votre disponibilité.',
      );
    } finally {
      setUpdating(null);
    }
  }

  const shortcuts = useMemo(() => [
    {
      key: 'clients',
      label: 'Clients',
      meta: `${summary?.clients ?? 0} fiche${summary?.clients === 1 ? '' : 's'}`,
      onPress: () => router.push('/artisan-workspace/clients'),
    },
    {
      key: 'quotes',
      label: 'Devis',
      meta: `${summary?.quotes ?? 0} devis`,
      onPress: () => router.push('/artisan-workspace/quotes'),
    },
    {
      key: 'agenda',
      label: 'Agenda',
      meta: `${summary?.jobs ?? 0} intervention${summary?.jobs === 1 ? '' : 's'}`,
      onPress: () => router.push('/artisan-workspace/agenda'),
    },
    {
      key: 'finance',
      label: 'Finance',
      meta: `${summary?.ledgerEntries ?? 0} mouvement${summary?.ledgerEntries === 1 ? '' : 's'}`,
      onPress: () => router.push('/artisan-workspace/finance'),
    },
  ], [summary]);

  return (
    <FixeoScreen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        <MobileShell
          universe="artisan"
          activeKey="workspace"
          statusLabel={
            summary?.availability
              ? STATUS_LABELS[summary.availability]
              : 'Statut à définir'
          }
          rightActionLabel="Cockpit"
          onRightAction={() => router.replace('/artisan')}
        />

        <View style={styles.header}>
          <Text style={styles.kicker}>ARTISAN OS MOBILE</Text>
          <Text style={styles.title}>Votre activité, sans friction.</Text>
          <Text style={styles.subtitle}>
            FIXEO rassemble vos clients, devis, interventions et mouvements dans un seul espace.
          </Text>
        </View>

        <FixeoCard tone="dark" style={styles.availabilityCard}>
          <Text style={styles.inverseKicker}>DISPONIBILITÉ</Text>
          <Text style={styles.inverseTitle}>
            {summary?.availability
              ? STATUS_LABELS[summary.availability]
              : 'Statut à définir'}
          </Text>
          <Text style={styles.inverseBody}>
            Ce statut alimente votre capacité à recevoir de nouvelles opportunités FIXEO.
          </Text>

          <View style={styles.statusActions}>
            <FixeoAction
              label={updating === 'available' ? '…' : 'Disponible'}
              variant={summary?.availability === 'available' ? 'primary' : 'secondary'}
              style={styles.statusAction}
              disabled={!!updating}
              onPress={() => void updateStatus('available')}
            />
            <FixeoAction
              label={updating === 'busy' ? '…' : 'Occupé'}
              variant={summary?.availability === 'busy' ? 'primary' : 'secondary'}
              style={styles.statusAction}
              disabled={!!updating}
              onPress={() => void updateStatus('busy')}
            />
            <FixeoAction
              label={updating === 'unavailable' ? '…' : 'Indisponible'}
              variant={summary?.availability === 'unavailable' ? 'primary' : 'secondary'}
              style={styles.statusAction}
              disabled={!!updating}
              onPress={() => void updateStatus('unavailable')}
            />
          </View>
        </FixeoCard>

        {!!message && (
          <FixeoCard tone="muted">
            <Text style={styles.message}>{message}</Text>
          </FixeoCard>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Votre activité</Text>
          <Text style={styles.sectionHint}>
            Les données viennent directement de votre espace Artisan OS sécurisé.
          </Text>
        </View>

        <WorkspaceShortcutGrid items={shortcuts} />
      </ScrollView>
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  back: {
    color: colors.textMuted,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  kicker: {
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.7,
    color: colors.textMuted,
  },
  title: {
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1.2,
    color: colors.text,
  },
  subtitle: {
    fontSize: type.body,
    lineHeight: 23,
    color: colors.textMuted,
  },
  availabilityCard: {
    gap: spacing.md,
  },
  inverseKicker: {
    color: '#A8A8AC',
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  inverseTitle: {
    color: colors.inverse,
    fontSize: 30,
    fontWeight: '900',
  },
  inverseBody: {
    color: '#D2D2D5',
    lineHeight: 21,
  },
  statusActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statusAction: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.xs,
  },
  message: {
    textAlign: 'center',
    fontWeight: '800',
    color: colors.text,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 23,
    fontWeight: '900',
    color: colors.text,
  },
  sectionHint: {
    color: colors.textMuted,
    lineHeight: 20,
  },
});
