import { useWorkspaceDock } from '@/components/useWorkspaceDock';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  listClientRequestHistory,
  type ClientRequestHistory,
} from '@/lib/clientWorkspace';
import { FixeoAction } from '@/ui/FixeoAction';
import { MobileShell } from '@/components/MobileShell';
import { FixeoText } from '@/ui/FixeoText';
import { ClientPageIntro, ClientSection, clientStyles } from '@/components/ClientEditorial';
import { CLIENT_STATUS } from '@/lib/clientExperience';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { space } from '@/ui/tokens';
import { formatWorkspaceDate, isTechnicalRequestContent } from '@/lib/workspacePresentation';
import { isMobileUiTimeout, withMobileDeadline } from '@/lib/mobileResilience';
import { useForegroundRefresh } from '@/lib/useForegroundRefresh';

export default function ClientHistory() {
  const [items, setItems] = useState<ClientRequestHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const history = await withMobileDeadline(listClientRequestHistory());
      setItems(history.filter(item => !isTechnicalRequestContent(item)));
      setError('');
    } catch (reason) {
      setError(
        isMobileUiTimeout(reason)
          ? 'Le réseau met trop de temps. Votre historique reste intact : tirez pour réessayer.'
          : 'Impossible de charger vos interventions.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useForegroundRefresh(load);

  const contextDock = useWorkspaceDock('client');
  return (
    <FixeoScreen padded={false} contextDock={contextDock} header={
        <MobileShell
          universe="client"
          activeKey="history"
          statusLabel="Historique FIXEO"
          rightActionLabel="Mon espace"
          rightDestination="/client-workspace"
        />
      }>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View style={styles.header}>
          <ClientPageIntro eyebrow="MES INTERVENTIONS" title="Votre histoire
avec FIXEO." detail="Vos demandes, de la première étape à la dernière." />
          <FixeoAction label="+ Nouvelle demande" onPress={() => router.push('/new-request' as any)} />
          {!!error && <FixeoText accessibilityRole="alert" style={clientStyles.error}>{error}</FixeoText>}
        </View>}
        ListEmptyComponent={<ClientSection>
          <FixeoText variant="heading">{loading ? 'Chargement de vos interventions…' : error ? 'Historique indisponible.' : 'Votre histoire commence ici.'}</FixeoText>
          {!loading && !error && <FixeoText tone="secondary">Votre première demande apparaîtra ici.</FixeoText>}
        </ClientSection>}
        renderItem={({ item }) => (
          <View testID="client-history-row" style={clientStyles.row}>
            <FixeoText variant="caption" tone="secondary">{formatWorkspaceDate(item.created_at)}</FixeoText>
            <FixeoText variant="heading">{item.service_category || 'Intervention FIXEO'}</FixeoText>
            {!!item.city && <FixeoText variant="supporting" tone="secondary">{item.city}</FixeoText>}
            {!!item.description && <FixeoText variant="supporting" numberOfLines={2}>{item.description}</FixeoText>}
            <View style={styles.footer}>
              <FixeoText variant="supporting" style={styles.status}>{CLIENT_STATUS[item.status] || 'Suivi FIXEO'}</FixeoText>
              {<FixeoAction
                label={item.status === 'completed' ? 'Vérifier' : 'Voir le suivi'} variant="ghost"
                style={styles.action} onPress={() => router.push({ pathname: '/client-request/[id]' as any, params: { id: item.id } })} />}
            </View>
          </View>
        )}
      />
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  content: { ...clientStyles.content, gap: 0 },
  header: { gap: space.md, paddingBottom: space.lg },
  footer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space.sm },
  status: { flexGrow: 1, flexShrink: 1 },
  action: { paddingHorizontal: space.xs, minHeight: 48 },
});
