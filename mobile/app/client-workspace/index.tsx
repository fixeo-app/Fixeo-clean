import { RafiScrollView as ScrollView } from '@/ui/RafiScrollView';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
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
import { ClientDraftRecovery } from '@/components/ClientDraftRecovery';
import { clientAttentionRequest, CLIENT_STATUS } from '@/lib/clientExperience';
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

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useForegroundRefresh(load);

  const activeRequests = history.filter(item => ['new', 'assigned', 'in_progress', 'completed'].includes(item.status));
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
      if (activeRequests.length > 1) { router.push('/client-workspace/history'); return; }
      if (activeRequest) router.push({ pathname: '/client-request/[id]' as any, params: { id: activeRequest.id } });
      else router.push('/new-request' as any);
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
        <FixeoAction label="+ Nouvelle demande" variant={activeRequest ? 'secondary' : 'primary'} onPress={() => router.push('/new-request' as any)} />
        <ClientDraftRecovery />

        {!!error && <FixeoText accessibilityRole="alert" style={clientStyles.error}>{error}</FixeoText>}
        {loading && !history.length && !profile ? <ClientSection>
          <FixeoText accessibilityLiveRegion="polite" tone="secondary">Votre espace se prépare…</FixeoText>
        </ClientSection> : !error || profile ? <ClientSection testID="client-workspace-attention">
          <View style={styles.presence}>
            <RafiOrb size={72} mode={getClientRafiPresence({ journeyStatus: activeRequest?.status === 'new' ? 'matching' : activeRequest?.status })} />
          </View>
          {activeRequests.length > 0 && <FixeoText variant="heading">{activeRequests.length} demande{activeRequests.length > 1 ? 's' : ''} en cours</FixeoText>}
          <FixeoText variant="eyebrow" tone="secondary">{contextualCockpit.eyebrow}</FixeoText>
          <FixeoText accessibilityRole="header" variant="title">{contextualCockpit.title}</FixeoText>
          {!!contextualCockpit.context && <FixeoText>{contextualCockpit.context}</FixeoText>}
          {contextualCockpit.actionLabel ? <FixeoAction testID="client-primary-action"
            variant={activeRequest ? 'primary' : 'secondary'}
            label={activeRequests.length > 1 && contextualCockpit.action === 'client_follow' ? 'Choisir une demande à suivre' : contextualCockpit.actionLabel} onPress={actOnContextualCockpit} style={styles.action} /> : null}
          <FixeoText tone="secondary">{contextualCockpit.detail}</FixeoText>
        </ClientSection> : null}
        {activeRequests.length > 3 && <FixeoAction label="Voir toutes mes demandes" variant="ghost" onPress={() => router.push('/client-workspace/history')} />}
        {activeRequests.length > 1 && activeRequests.slice(0, 3).map(item => <ClientSection key={item.id} surface>
          <FixeoText variant="caption" tone="secondary">{CLIENT_STATUS[item.status]}</FixeoText>
          <FixeoText variant="heading">{item.description || item.service_category}</FixeoText>
          <FixeoText tone="secondary">{item.city} · {item.service_category}</FixeoText>
          <FixeoAction label={`Suivre · ${item.service_category || 'cette demande'}`} variant="secondary" onPress={() => router.push({ pathname: '/client-request/[id]', params: { id: item.id } } as any)} />
        </ClientSection>)}
      </ScrollView>
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  content: clientStyles.content,
  presence: { alignItems: 'center', paddingVertical: space.xs },
  action: { marginTop: space.md },
});
