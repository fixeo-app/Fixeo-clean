import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getClientRequestDetail, type ClientRequestDetail } from '@/lib/clientWorkspace';
import { clientMissionPresentation, CLIENT_STATUS } from '@/lib/clientExperience';
import { withMobileDeadline } from '@/lib/mobileResilience';
import { useForegroundRefresh } from '@/lib/useForegroundRefresh';
import { ClientHero, ClientSection, clientStyles } from '@/components/ClientEditorial';
import { MobileShell } from '@/components/MobileShell';
import { useWorkspaceDock } from '@/components/useWorkspaceDock';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { BackButton } from '@/ui/BackButton';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';
import { RafiScrollView } from '@/ui/RafiScrollView';

export default function ClientRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<ClientRequestDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const dock = useWorkspaceDock('client');
  const load = useCallback(async () => {
    setLoading(true);
    try { setRequest(await withMobileDeadline(getClientRequestDetail(id))); setError(''); }
    catch { setError('Ce suivi est indisponible. Réessayez depuis vos interventions.'); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => {
    void load(); const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, [load]));
  useForegroundRefresh(load);
  const view = clientMissionPresentation(request?.status);
  return <FixeoScreen padded={false} contextDock={dock} header={<MobileShell universe="client" activeKey="history" rightDestination="/client-workspace/notifications" />}>
    <RafiScrollView contentContainerStyle={clientStyles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <BackButton />
      <ClientHero {...view} mode={view.orb} compact />
      {!!error && <ClientSection><FixeoText accessibilityRole="alert">{error}</FixeoText><FixeoAction label="Réessayer" onPress={() => void load()} /></ClientSection>}
      {request && <ClientSection surface>
        <FixeoText variant="eyebrow">{CLIENT_STATUS[request.status] || 'Suivi FIXEO'}</FixeoText>
        <FixeoText variant="heading">{request.description}</FixeoText>
        <FixeoText tone="secondary">{request.service_category} · {request.city}</FixeoText>
        {request.mission_id && <FixeoAction label={request.status === 'completed' ? 'Vérifier et valider l’intervention' : 'Suivre l’intervention'}
          onPress={() => router.push({ pathname: '/client-mission/[id]', params: { id: request.mission_id! } })} />}
        {request.status === 'new' && <FixeoText variant="supporting">Cette recherche continue. FIXEO vous informe lorsqu’un artisan est affecté.</FixeoText>}
      </ClientSection>}
      <FixeoAction label="+ Nouvelle demande" variant="secondary" onPress={() => router.push('/new-request' as any)} />
    </RafiScrollView>
  </FixeoScreen>;
}
