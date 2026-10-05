import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  getClientProfile,
  listClientNotifications,
  listClientRequestHistory,
  type ClientProfile,
  type ClientRequestHistory,
} from '@/lib/clientWorkspace';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoText } from '@/ui/FixeoText';
import { ClientPageIntro, ClientSection, clientStyles } from '@/components/ClientEditorial';
import { clientAttentionRequest } from '@/lib/clientExperience';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { RafiOrb } from '@/ui/RafiOrb';
import { space } from '@/ui/tokens';
import { useWorkspaceDock } from '@/components/useWorkspaceDock';
import { MobileShell } from '@/components/MobileShell';
import { clientGreetingName, isTechnicalRequestContent } from '@/lib/workspacePresentation';
import { getClientContextualCockpit } from '@/lib/contextualCockpit';
import { getClientRafiPresence } from '@/ui/rafiPresence';
import { isMobileUiTimeout, withMobileDeadline } from '@/lib/mobileResilience';
import { useForegroundRefresh } from '@/lib/useForegroundRefresh';

export default function ClientWorkspaceHome() {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [history, setHistory] = useState<ClientRequestHistory[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextProfile, history, notifications] = await withMobileDeadline(
        Promise.all([
          getClientProfile(),
          listClientRequestHistory(),
          listClientNotifications(),
        ]),
      );
      const visibleHistory = history.filter(item => !isTechnicalRequestContent(item));
      setProfile(nextProfile);
      setHistory(visibleHistory);
      setHistoryCount(visibleHistory.length);
      setUnreadCount(notifications.filter(item => !item.read).length);
      setError('');
    } catch (reason) {
      setError(
        isMobileUiTimeout(reason)
          ? 'Le réseau met trop de temps. Votre espace reste intact : tirez pour réessayer.'
          : 'Impossible de charger votre espace Client.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useForegroundRefresh(load);

  const activeRequest = useMemo(
    () => clientAttentionRequest(history),
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

  const contextualCockpit = useMemo(
    () => getClientContextualCockpit({
      activeStatus: activeRequest?.status,
      unreadCount,
      subject: activeRequest?.service_category,
      city: activeRequest?.city,
    }),
    [
      activeRequest?.status,
      activeRequest?.service_category,
      activeRequest?.city,
      unreadCount,
    ],
  );

  function actOnContextualCockpit() {
    if (contextualCockpit.action === 'client_alerts') {
      router.push('/client-workspace/notifications');
      return;
    }

    if (
      contextualCockpit.action === 'client_follow' ||
      contextualCockpit.action === 'client_rafi'
    ) {
      router.replace('/');
    }
  }

  const contextDock = useWorkspaceDock('client', { history: historyCount, alerts: unreadCount });

  return (
    <FixeoScreen padded={false} contextDock={contextDock} header={
        <MobileShell
          universe="client"
          activeKey="space"
          orbMode={getClientRafiPresence({ journeyStatus: activeRequest?.status === 'new' ? 'matching' : activeRequest?.status })}
          statusLabel={activeRequest ? activeLabel : 'RAFI est prêt'}
          rightActionLabel="Mon compte"
          rightDestination="/client-workspace/account"
          rightNavigation="detail"
        />
      }>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ClientPageIntro eyebrow="MON ESPACE" title={greetingName ? `Bonjour ${greetingName}.` : 'Bonjour.'}
          detail="Tout ce qui mérite votre attention." />

        {!!error && <FixeoText accessibilityRole="alert" style={clientStyles.error}>{error}</FixeoText>}
        {loading && !history.length && !profile ? <ClientSection>
          <FixeoText accessibilityLiveRegion="polite" tone="secondary">Votre espace se prépare…</FixeoText>
        </ClientSection> : !error || profile ? <ClientSection testID="client-workspace-attention">
          <View style={styles.presence}>
            <RafiOrb size={72} mode={getClientRafiPresence({ journeyStatus: activeRequest?.status === 'new' ? 'matching' : activeRequest?.status })} />
          </View>
          <FixeoText variant="eyebrow" tone="secondary">{contextualCockpit.eyebrow}</FixeoText>
          <FixeoText accessibilityRole="header" variant="title">{contextualCockpit.title}</FixeoText>
          {!!contextualCockpit.context && <FixeoText>{contextualCockpit.context}</FixeoText>}
          {contextualCockpit.actionLabel ? <FixeoAction testID="client-primary-action"
            label={contextualCockpit.actionLabel} onPress={actOnContextualCockpit} style={styles.action} /> : null}
          <FixeoText tone="secondary">{contextualCockpit.detail}</FixeoText>
        </ClientSection> : null}
      </ScrollView>
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  content: clientStyles.content,
  presence: { alignItems: 'center', paddingVertical: space.xs },
  action: { marginTop: space.md },
});
