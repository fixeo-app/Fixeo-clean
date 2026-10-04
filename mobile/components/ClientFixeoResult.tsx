import { useState } from 'react';
import { View } from 'react-native';
import { ClientSection } from './ClientEditorial';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';
import { clientEstimatorPresentation, type ClientEstimatorOutcome } from '@/lib/clientEstimatorPresentation';

/** Canonical result presentation for the optional Client journey. */
export function ClientFixeoResult({ outcome }: { outcome: ClientEstimatorOutcome }) {
  const [details, setDetails] = useState(false);
  const view = clientEstimatorPresentation(outcome);
  return <ClientSection testID="client-fixeo-result" label="VOICI CE QUE FIXEO PEUT FAIRE">
    <FixeoText variant="heading" accessibilityRole={view.safety ? 'alert' : 'header'}>{view.title}</FixeoText>
    {view.amount !== null && <FixeoText variant="hero" testID="canonical-amount">{new Intl.NumberFormat('fr-MA').format(view.amount)} MAD</FixeoText>}
    {!!outcome.service_label && <FixeoText>{outcome.service_label}</FixeoText>}
    {view.safety && <FixeoText>Mettez-vous en sécurité. Faites vérifier la situation par un professionnel avant de poursuivre.</FixeoText>}
    {view.moreInformation && <FixeoText>Quelques informations restent à confirmer avant de continuer.</FixeoText>}
    {!!view.route && <FixeoText>{view.route}</FixeoText>}
    {outcome.outcome_type === 'LABOUR_PLUS_PART_READY' && <View testID="parts-separate" style={{ gap: 8, paddingVertical: 16 }}>
      <FixeoText variant="eyebrow">PIÈCE / MATÉRIEL SÉPARÉ</FixeoText>
      <FixeoText tone="secondary">Le montant de main-d’œuvre n’inclut pas les pièces. Leur fourniture doit être confirmée séparément.</FixeoText>
    </View>}
    {outcome.outcome_type === 'DIAGNOSTIC_READY' && <FixeoText>Ce montant concerne le diagnostic. Les réparations et pièces éventuelles ne sont pas comprises.</FixeoText>}
    {outcome.outcome_type === 'ADD_ON_READY' && <FixeoText>Cette option accompagne une prestation principale. Elle ne constitue pas une réservation.</FixeoText>}
    {(!!outcome.scope_summary.length || !!outcome.exclusions_summary.length) && <FixeoAction variant="ghost"
      label={details ? 'Masquer le périmètre' : 'Voir le périmètre et les exclusions'} accessibilityState={{ expanded: details }} onPress={() => setDetails(value => !value)} />}
    {details && outcome.scope_summary.map((line, i) => <FixeoText key={i}>{line}</FixeoText>)}
    {details && !!outcome.exclusions_summary.length && <ClientSection label="HORS PÉRIMÈTRE">
      {outcome.exclusions_summary.map((line, i) => <FixeoText key={i} variant="supporting" tone="secondary">{line}</FixeoText>)}
    </ClientSection>}
  </ClientSection>;
}
