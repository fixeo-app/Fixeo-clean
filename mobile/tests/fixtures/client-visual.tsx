import { createElement } from 'react';
import { ScrollView, Dimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { ClientFixeoResult } from '../../components/ClientFixeoResult';
import { ClientPageIntro, ClientSection, clientStyles } from '../../components/ClientEditorial';
import { FixeoText } from '../../ui/FixeoText';
import { FixeoAction } from '../../ui/FixeoAction';
import estimator from './estimator-canonical.json';
import Home from '../../app/index';
import Workspace from '../../app/client-workspace/index';
import History from '../../app/client-workspace/history';
import Alerts from '../../app/client-workspace/notifications';
import Account from '../../app/client-workspace/account';
import Mission from '../../app/client-mission/[id]';
import { calls } from './client-services.web';
import { navigations } from './client-router.web';
import { locationCalls } from './client-location.web';
const { createRoot } = require('react-dom/client');
const params = new URLSearchParams(location.search);
if (params.has('large')) {
  const metrics = { width: innerWidth, height: innerHeight, scale: 1, fontScale: 2 };
  const getDimensions = Dimensions.get.bind(Dimensions);
  Dimensions.get = name => ({ ...getDimensions(name), ...metrics });
}
const screens: Record<string, typeof Home> = { workspace: Workspace, history: History, alerts: Alerts, account: Account, mission: Mission };
const Screen = screens[params.get('scene') || ''] || Home;
(globalThis as any).__w4 = { calls, navigations, locationCalls };
function EstimatorFixture() {
  const key = params.get('outcome') || 'price';
  return <ScrollView contentContainerStyle={{ ...clientStyles.content, paddingTop: 48 }}>
    <FixeoText variant="caption" tone="secondary">PREUVE DE CONTRAT · PASSERELLE MOBILE NON CONNECTÉE</FixeoText>
    <ClientPageIntro eyebrow="RAFI · FIXEO" title="Voici la suite." />
    {key === 'question' ? <ClientSection label="QUELQUES PRÉCISIONS UTILES">
      <FixeoText variant="heading">{estimator.question.prompt_fr}</FixeoText>
      <FixeoText>Une seule question requise par le moteur.</FixeoText>
    </ClientSection> : <ClientFixeoResult outcome={estimator.outcomes[key as keyof typeof estimator.outcomes]} />}
    <FixeoAction label="Aperçu de contrat uniquement" disabled variant="ghost" />
  </ScrollView>;
}
function Fixture() {
  return <SafeAreaInsetsContext.Provider value={{ top: innerWidth <= 320 ? 24 : 44, bottom: innerWidth <= 320 ? 16 : 34, left: 0, right: 0 }}>{params.get('scene') === 'estimator' ? <EstimatorFixture /> : <Screen />}</SafeAreaInsetsContext.Provider>;
}
createRoot(document.getElementById('root')).render(createElement(Fixture));
