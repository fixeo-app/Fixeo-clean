import { useState } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { MissionEvidence } from '@/lib/missionEvidence';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';
import { radii, semanticColors, space } from '@/ui/tokens';
import { ClientSection } from './ClientEditorial';

/** Only the signed images returned by the existing evidence service are displayed. */
export function ClientMissionEvidence({ evidence, state }: {
  evidence: readonly MissionEvidence[]; state: 'loading' | 'ready' | 'unavailable';
}) {
  const [expanded, setExpanded] = useState(false);
  const { fontScale } = useWindowDimensions();
  const groups = (['before', 'after'] as const).map(kind => ({ kind, items: evidence.filter(item => item.kind === kind) }));
  return <ClientSection label="Photos de l’intervention" testID="client-mission-evidence">
    {state !== 'ready' && <FixeoText accessibilityLiveRegion="polite" variant="supporting" tone="secondary">
      {state === 'loading' ? 'Chargement des photos…' : 'Les photos n’ont pas pu être actualisées.'}
    </FixeoText>}
    <View style={[styles.comparison, fontScale > 1.4 && styles.stacked]}>
      {groups.map(group => <View key={group.kind} style={styles.column}>
        <FixeoText variant="caption" tone="secondary">{group.kind === 'before' ? 'AVANT' : 'APRÈS'} · {group.items.length}</FixeoText>
        {(expanded ? group.items : group.items.slice(0, 1)).map(item => <EvidencePhoto key={item.id} item={item} />)}
        {!group.items.length && <View style={styles.waiting}>
          <FixeoText variant="supporting" tone="secondary">{state === 'ready' ? 'Aucune photo déposée' : 'Photos en attente de chargement'}</FixeoText>
        </View>}
      </View>)}
    </View>
    {groups.some(group => group.items.length > 1) && <FixeoAction variant="ghost"
      label={expanded ? 'Réduire les photos' : 'Voir toutes les photos'} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} />}
  </ClientSection>;
}

function EvidencePhoto({ item }: { item: MissionEvidence }) {
  const [failed, setFailed] = useState(false);
  // A fresh signed URL may succeed on the next refresh without discarding the evidence record.
  const [failedUrl, setFailedUrl] = useState('');
  return item.signed_url && !(failed && failedUrl === item.signed_url) ? <Image
    source={{ uri: item.signed_url }} accessibilityLabel={`Photo ${item.kind === 'before' ? 'avant' : 'après'} l’intervention`}
    style={styles.image} resizeMode="contain" onError={() => { setFailed(true); setFailedUrl(item.signed_url || ''); }}
  /> : <View style={styles.waiting}><FixeoText variant="supporting" tone="secondary">Photo indisponible pour le moment</FixeoText></View>;
}

const styles = StyleSheet.create({
  comparison: { flexDirection: 'row', gap: space.sm },
  stacked: { flexDirection: 'column' },
  column: { flex: 1, gap: space.xs },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radii.control, backgroundColor: semanticColors.background.subtle },
  waiting: { minHeight: 96, padding: space.sm, justifyContent: 'center', backgroundColor: semanticColors.background.subtle, borderRadius: radii.control },
});
