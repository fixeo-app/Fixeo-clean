import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  getClientProfile,
  listClientNotifications,
  listClientRequestHistory,
  type ClientProfile,
} from '@/lib/clientWorkspace';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { colors, spacing, type } from '@/ui/tokens';
import { WorkspaceShortcutGrid } from '@/components/WorkspaceShortcutGrid';

export default function ClientWorkspaceHome() {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
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
          <Text style={styles.kicker}>CLIENT OS MOBILE</Text>
          <Text style={styles.title}>
            {profile?.full_name ? `Bonjour ${profile.full_name.split(' ')[0]}.` : 'Votre espace FIXEO.'}
          </Text>
          <Text style={styles.subtitle}>
            Vos interventions, alertes et coordonnées sans transformer l’app en tableau de bord.
          </Text>
        </View>

        {!!error && (
          <FixeoCard tone="muted">
            <Text style={styles.error}>{error}</Text>
          </FixeoCard>
        )}

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
  error: {
    color: colors.danger,
    fontWeight: '700',
  },
});
