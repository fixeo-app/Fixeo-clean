import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  getClientProfile,
  listClientNotifications,
  listClientRequestHistory,
  type ClientProfile,
  type ClientRequestHistory,
} from '@/lib/clientWorkspace';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { RafiOrb } from '@/ui/RafiOrb';
import { colors, spacing, type } from '@/ui/tokens';
import { WorkspaceShortcutGrid } from '@/components/WorkspaceShortcutGrid';
import { clientGreetingName } from '@/lib/workspacePresentation';

export default function ClientWorkspaceHome() {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [history, setHistory] = useState<ClientRequestHistory[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextProfile, history, notifications] = await Promise.all([
        getClientProfile(),
        listClientRequestHistory(),
        listClientNotifications(),
      ]);
      setProfile(nextProfile);
      setHistory(history);
      setHistoryCount(history.length);
      setUnreadCount(notifications.filter(item => !item.read).length);
      setError('');
    } catch {
      setError('Impossible de charger votre espace Client.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRequest = useMemo(
    () => history.find(item => ['new', 'assigned', 'in_progress', 'completed'].includes(item.status)) || null,
    [history],
  );

  const activeLabel = activeRequest
    ? ({
        new: 'Recherche en cours',
        assigned: 'Artisan affecté',
        in_progress: 'Intervention en cours',
        completed: 'À confirmer',
      } as Record<string, string>)[activeRequest.status] || 'Suivi FIXEO'
    : '';

  const greetingName = clientGreetingName(profile?.full_name);

  const shortcuts = useMemo(() => [
    {
      key: 'history',
      label: 'Interventions',
      meta: `${historyCount} demande${historyCount === 1 ? '' : 's'}`,
      onPress: () => router.push('/client-workspace/history'),
    },
    {
      key: 'notifications',
      label: 'Alertes',
      meta: unreadCount ? `${unreadCount} à lire` : 'Tout est à jour',
      onPress: () => router.push('/client-workspace/notifications'),
    },
    {
      key: 'account',
      label: 'Mon compte',
      meta: profile?.city || 'Coordonnées',
      onPress: () => router.push('/client-workspace/account'),
    },
  ], [historyCount, unreadCount, profile?.city]);

  return (
    <FixeoScreen padded={false}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.back} onPress={() => router.back()}>‹ RAFI</Text>
          <View style={styles.identityRow}>
            <View style={styles.identityCopy}>
              <Text style={styles.kicker}>MON ESPACE FIXEO</Text>
              <Text style={styles.title}>
                {greetingName ? `Bonjour ${greetingName}.` : 'Bonjour.'}
              </Text>
            </View>
            <RafiOrb size={58} mode={activeRequest ? 'working' : 'idle'} />
          </View>
          <Text style={styles.subtitle}>
            Ce qui compte maintenant, sans jargon ni bruit. RAFI reste toujours à portée.
          </Text>
        </View>

        {!!error && (
          <FixeoCard tone="muted">
            <Text style={styles.error}>{error}</Text>
          </FixeoCard>
        )}

        {activeRequest ? (
          <FixeoCard tone="dark" style={styles.activeCard}>
            <Text style={styles.inverseKicker}>{activeLabel.toUpperCase()}</Text>
            <Text style={styles.inverseTitle}>
              {activeRequest.service_category || 'Votre intervention'}
            </Text>
            <Text style={styles.inverseBody}>
              {activeRequest.description || 'FIXEO suit votre demande.'}
              {activeRequest.city ? ` · ${activeRequest.city}` : ''}
            </Text>
            <FixeoAction
              label={activeRequest.status === 'completed' ? 'Vérifier et confirmer' : 'Reprendre le suivi'}
              variant="secondary"
              onPress={() => router.replace('/')}
            />
          </FixeoCard>
        ) : (
          <FixeoCard style={styles.rafiCard}>
            <View style={styles.rafiCopy}>
              <Text style={styles.cardKicker}>RAFI EST PRÊT</Text>
              <Text style={styles.cardTitle}>Un problème à régler ?</Text>
              <Text style={styles.cardBody}>Parlez, montrez ou écrivez. RAFI vous ramène directement au bon parcours.</Text>
            </View>
            <FixeoAction label="Parler à RAFI" onPress={() => router.replace('/')} />
          </FixeoCard>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Votre espace</Text>
          <Text style={styles.sectionHint}>Suivi, historique, alertes et compte — chacun à sa place, sans surcharger l’écran principal.</Text>
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
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  identityCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  back: {
    color: colors.textMuted,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  kicker: {
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.6,
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
    color: colors.textMuted,
    fontSize: type.body,
    lineHeight: 23,
  },
  activeCard: {
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
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  inverseBody: {
    color: '#D8D8DA',
    lineHeight: 21,
  },
  rafiCard: {
    gap: spacing.md,
  },
  rafiCopy: {
    gap: spacing.xs,
  },
  cardKicker: {
    color: colors.textMuted,
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  cardBody: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
  },
  sectionHint: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontWeight: '700',
  },
});
