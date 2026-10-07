import { useWorkspaceDock } from '@/components/useWorkspaceDock';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { clientNotificationTarget } from '@/lib/clientNotificationTarget';
import { SectionList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import {
  listClientNotifications,
  markClientNotificationRead,
  type ClientNotification,
} from '@/lib/clientWorkspace';
import { FixeoText } from '@/ui/FixeoText';
import { ClientPageIntro, ClientSection, clientStyles } from '@/components/ClientEditorial';
import { clientNotificationSections } from '@/lib/clientExperience';
import { PushOptIn } from '@/components/PushOptIn';
import { MobileShell } from '@/components/MobileShell';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { semanticColors, space } from '@/ui/tokens';
import { cleanNotificationCopy, formatWorkspaceDate } from '@/lib/workspacePresentation';
import { isMobileUiTimeout, withMobileDeadline } from '@/lib/mobileResilience';
import { useForegroundRefresh } from '@/lib/useForegroundRefresh';

export default function ClientNotifications() {
  const [items, setItems] = useState<ClientNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await withMobileDeadline(listClientNotifications()));
      setError('');
    } catch (reason) {
      setError(
        isMobileUiTimeout(reason)
          ? 'Le réseau met trop de temps. Vos alertes restent intactes : tirez pour réessayer.'
          : 'Impossible de charger vos alertes.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useForegroundRefresh(load);

  async function open(item: ClientNotification) {
    const destination = clientNotificationTarget(item);
    if (destination) router.push(destination as any);
    if (!item.read) {
      try {
        await withMobileDeadline(markClientNotificationRead(item.id));
        setItems(current => current.map(row => row.id === item.id ? { ...row, read: true } : row));
      } catch {
        setError('Le message reste accessible. Son statut lu n’a pas pu être enregistré.');
      }
    }
  }

  const contextDock = useWorkspaceDock('client');
  return (
    <FixeoScreen padded={false} contextDock={contextDock} header={
        <MobileShell
          universe="client"
          activeKey="alerts"
          statusLabel="Alertes FIXEO"
          rightActionLabel="Mon espace"
          rightDestination="/client-workspace"
        />
      }>
      <SectionList
        sections={clientNotificationSections(items)}
        stickySectionHeadersEnabled={false}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View style={styles.header}>
          <ClientPageIntro eyebrow="ALERTES" title="L’essentiel,
au bon moment." detail="Les événements de vos interventions." />
          {!!error && <FixeoText accessibilityRole="alert" style={clientStyles.error}>{error}</FixeoText>}
        </View>}
        ListEmptyComponent={<ClientSection>
          <FixeoText variant="heading">{loading ? 'Chargement de vos alertes…' : error ? 'Alertes indisponibles.' : 'Tout est calme.'}</FixeoText>
          {!loading && !error && <FixeoText tone="secondary">Les nouvelles étapes de vos interventions apparaîtront ici.</FixeoText>}
        </ClientSection>}
        renderSectionHeader={({ section }) => <FixeoText accessibilityRole="header" variant="eyebrow" tone="secondary" style={styles.sectionTitle}>{section.title}</FixeoText>}
        renderItem={({ item }) => <Pressable accessibilityRole={item.read && !clientNotificationTarget(item) ? 'text' : 'button'}
          disabled={item.read && !clientNotificationTarget(item)}
          accessibilityLabel={`${cleanNotificationCopy(item.title)}. ${clientNotificationTarget(item) ? 'Ouvrir le suivi' : item.read ? 'Déjà lu' : 'Marquer comme lu'}`}
          onPress={() => void open(item)} style={({ pressed }) => [clientStyles.row, pressed && styles.pressed]}>
          <View style={styles.titleRow}>
            <FixeoText variant={item.read ? 'body' : 'heading'} tone={item.read ? 'secondary' : 'primary'} style={styles.title}>{cleanNotificationCopy(item.title)}</FixeoText>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
          <FixeoText variant="supporting" tone="secondary">{cleanNotificationCopy(item.message)}</FixeoText>
          <FixeoText variant="caption" tone="tertiary">{formatWorkspaceDate(item.created_at)} · {item.read ? 'Lu' : 'Non lu'}</FixeoText>
        </Pressable>}
        ListFooterComponent={<View style={styles.push}><PushOptIn compact /></View>}
      />
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  content: { ...clientStyles.content, gap: 0 },
  header: { gap: space.md, paddingBottom: space.lg },
  sectionTitle: { paddingTop: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, minWidth: 0 },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semanticColors.text.primary },
  pressed: { backgroundColor: semanticColors.interaction.pressed },
  push: { paddingTop: space.xl },
});
