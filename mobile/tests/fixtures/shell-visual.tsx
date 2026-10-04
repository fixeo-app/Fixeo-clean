import { createElement } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { MobileShell } from '../../components/MobileShell';
import { useWorkspaceDock } from '../../components/useWorkspaceDock';
import { FixeoScreen } from '../../ui/FixeoScreen';
import { FixeoText } from '../../ui/FixeoText';
import { FixeoAction } from '../../ui/FixeoAction';
import { usePathname } from './shell-router.web';
const { createRoot } = require('react-dom/client');
const parameters = new URLSearchParams(location.search);
const universe = parameters.get('universe') === 'artisan' ? 'artisan' : 'client';
const legacy = parameters.has('legacy');
const safe = parameters.has('landscape') ? { top: 0, left: 44, right: 44, bottom: 21 } : { top: 44, left: 0, right: 0, bottom: 34 };
function Fixture() {
  const path = usePathname();
  const dock = useWorkspaceDock(universe, { alerts: 3 });
  return <SafeAreaInsetsContext.Provider value={safe}>
    <FixeoScreen padded={false} contextDock={dock} header={<MobileShell universe={universe}
      activeKey={universe === 'client' ? 'space' : 'workspace'} statusLabel="Votre espace FIXEO"
      {...(legacy ? { rightActionLabel: 'Action compatible', onRightAction: () => { document.title = 'LEGACY_ACTION_PASS'; } }
        : universe === 'client' ? { rightDestination: '/client-workspace/account' as const } : {})} />}>
      <ScrollView testID="workspace-scroll" contentContainerStyle={styles.content}>
        <FixeoText variant="eyebrow" tone="secondary">{universe === 'client' ? 'Mon espace FIXEO' : 'Artisan OS'}</FixeoText>
        <FixeoText variant="title">{universe === 'client' ? 'Bonjour.' : 'Votre activité.'}</FixeoText>
        <FixeoText>Fixture de vérification W2, sans données métier.</FixeoText>
        <FixeoText testID="current-route" variant="supporting">{path}</FixeoText>
        {Array.from({ length: 8 }, (_, index) => <View key={index} style={styles.row}><FixeoText>Contenu accessible {index + 1}</FixeoText></View>)}
        <FixeoAction testID="final-action" label="Dernière action visible" onPress={() => { document.title = 'FINAL_ACTION_PASS'; }} />
      </ScrollView>
    </FixeoScreen>
  </SafeAreaInsetsContext.Provider>;
}
const styles = StyleSheet.create({ content: { paddingHorizontal: 22, gap: 22, paddingBottom: 24 }, row: { minHeight: 76, justifyContent: 'center' } });
createRoot(document.getElementById('root')).render(createElement(Fixture));
