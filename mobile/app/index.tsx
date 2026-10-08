import { ClientDraftRecovery } from '@/components/ClientDraftRecovery';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { listClientRequestHistory, type ClientRequestHistory } from '@/lib/clientWorkspace';
import { clientAttentionRequest, clientHomeCopy, CLIENT_STATUS } from '@/lib/clientExperience';
import { withMobileDeadline } from '@/lib/mobileResilience';
import { useForegroundRefresh } from '@/lib/useForegroundRefresh';
import { isTechnicalRequestContent } from '@/lib/workspacePresentation';
import { ClientHero, ClientSection, clientStyles } from '@/components/ClientEditorial';
import ClientRequestComposer from '@/components/ClientRequestComposer';
import { MobileShell } from '@/components/MobileShell';
import { useWorkspaceDock } from '@/components/useWorkspaceDock';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoText } from '@/ui/FixeoText';
import { RafiScrollView } from '@/ui/RafiScrollView';

export default function Home() {
  const [requests, setRequests] = useState<ClientRequestHistory[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const hasActive = useRef(false);
  const dock = useWorkspaceDock('client');
  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    try { setRequests((await withMobileDeadline(listClientRequestHistory())).filter(item => !isTechnicalRequestContent(item))); setError(''); }
    catch { setError('Votre suivi est momentanément indisponible. Vos demandes restent conservées.'); }
    finally { pending.current = false; setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { if (hasActive.current) void load(); }, 10_000);
    return () => clearInterval(timer);
  }, [load]));
  useForegroundRefresh(load);
  const active = requests?.filter(item => ['new', 'assigned', 'in_progress', 'completed'].includes(item.status)) || [];
  const priority = clientAttentionRequest(active);
  hasActive.current = !!priority;
  // A draft owns only its own fields and submission key. Existing requests are never hydrated into it.
  if (requests && !priority && !error) return <ClientRequestComposer back={false} />;
  const journey = priority?.status === 'new' ? 'matching' : priority?.status || 'idle';
  const mode = journey === 'matching' ? 'matching' : journey === 'in_progress' ? 'intervention' : journey === 'completed' ? 'attention' : 'idle';
  return <FixeoScreen padded={false} contextDock={dock} header={<MobileShell universe="client" activeKey="rafi" rightDestination="/client-workspace" rightNavigation="detail" />}>
    <RafiScrollView contentContainerStyle={clientStyles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>

      <ClientHero {...clientHomeCopy(journey, mode, false)} mode={mode} family="home" />
      {!!error && <ClientSection><FixeoText accessibilityRole="alert">{error}</FixeoText><FixeoAction label="Actualiser le suivi" variant="secondary" onPress={() => void load()} /></ClientSection>}
      {requests === null && !error && <FixeoText accessibilityLiveRegion="polite">Ouverture de vos demandes…</FixeoText>}
      <View style={{ gap: 12 }}><FixeoAction label="+ Nouvelle demande" onPress={() => router.push('/new-request' as any)} />
        <FixeoText variant="supporting" tone="secondary">Un autre besoin ? Lancez une nouvelle demande sans interrompre celles en cours.</FixeoText></View>
      {active.slice(0, 3).map(item => <ClientSection key={item.id} surface testID={`active-request-${item.id}`}>
        <FixeoText variant="eyebrow" tone="secondary">{CLIENT_STATUS[item.status]}</FixeoText>
        <FixeoText variant="heading">{item.description || item.service_category}</FixeoText>
        <FixeoText tone="secondary">{[item.service_category, item.city].filter(Boolean).join(' · ')}</FixeoText>
        <FixeoAction label={item.status === 'completed' ? 'Vérifier et valider' : 'Voir le suivi'} variant="secondary"
          onPress={() => router.push({ pathname: '/client-request/[id]' as any, params: { id: item.id } })} />
      </ClientSection>)}

      {active.length > 3 && <FixeoAction label="Voir toutes mes demandes" variant="ghost" onPress={() => router.push('/client-workspace/history')} />}
      <ClientDraftRecovery />
    </RafiScrollView>
  </FixeoScreen>;
}
