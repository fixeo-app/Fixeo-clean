import { View, StyleSheet } from 'react-native';
import { FixeoText } from '@/ui/FixeoText';
import { money } from '@/lib/artisanExperience';
import { formatWorkspaceDate } from '@/lib/workspacePresentation';
import { QUOTE_FISCAL, QUOTE_PROVENANCE, type QuoteDocument } from '@/lib/quoteDocument';

export function QuoteProposal({ document: q }: { document: QuoteDocument }) {
  return <View style={styles.paper} accessibilityLabel="Proposition de devis client">
    <FixeoText variant="eyebrow" style={styles.champagne}>FIXEO · DEVIS STUDIO</FixeoText>
    <FixeoText variant="hero">Devis</FixeoText>
    <FixeoText tone="secondary">{q.number} · {q.status}</FixeoText>
    {!!q.updatedAt && <FixeoText variant="supporting" tone="secondary">Mis à jour le {formatWorkspaceDate(q.updatedAt)}</FixeoText>}
    <View style={styles.rule} />
    <View style={styles.identities}>
      <View style={styles.identity}><FixeoText variant="eyebrow" tone="secondary">ÉMETTEUR</FixeoText><FixeoText variant="heading">{q.issuer.name || 'Identité à compléter'}</FixeoText><FixeoText tone="secondary">{[q.issuer.city, q.issuer.phone].filter(Boolean).join(' · ')}</FixeoText></View>
      <View style={styles.identity}><FixeoText variant="eyebrow" tone="secondary">DESTINATAIRE</FixeoText><FixeoText variant="heading">{q.client?.full_name || 'Client à renseigner'}</FixeoText><FixeoText tone="secondary">{[q.client?.address, q.client?.city, q.client?.phone].filter(Boolean).join(' · ')}</FixeoText></View>
    </View>
    <FixeoText variant="title">{q.title}</FixeoText>
    <View style={styles.tableHeader}><FixeoText variant="eyebrow">PRESTATIONS & FOURNITURES</FixeoText></View>
    {q.items.map((line, i) => <View key={i} style={styles.line}><FixeoText variant="bodyLarge">{line.label}</FixeoText><FixeoText variant="supporting" tone="secondary">{line.type === 'labor' ? 'Main-d’œuvre' : line.type === 'supply' ? 'Fourniture' : 'Prestation'} · {line.quantity} × {money(line.unit_price)}</FixeoText><FixeoText style={styles.amount}>{money(line.total)}</FixeoText></View>)}
    <FixeoText tone="secondary">Sous-total · {money(q.subtotal)}</FixeoText>
    {q.discount > 0 && <FixeoText tone="secondary">Remise · {money(q.discount)}</FixeoText>}
    <View style={styles.total}><FixeoText variant="eyebrow" tone="inverseSecondary">TOTAL DU DEVIS</FixeoText><FixeoText variant="title" tone="inverse">{money(q.total)}</FixeoText></View>
    {!!q.validity && <FixeoText>Valable jusqu’au {formatWorkspaceDate(q.validity)}</FixeoText>}
    {!!q.duration && <FixeoText>Durée prévue : {q.duration}</FixeoText>}
    {!!q.notes && <View style={{ gap: 8 }}><FixeoText variant="eyebrow">NOTES ET CONDITIONS</FixeoText><FixeoText>{q.notes}</FixeoText></View>}
    <FixeoText variant="supporting" tone="secondary">{QUOTE_FISCAL}</FixeoText>
    <FixeoText variant="supporting" tone="secondary">{QUOTE_PROVENANCE}</FixeoText>
  </View>;
}
const styles = StyleSheet.create({
  paper: { backgroundColor: '#FFFDF8', padding: 20, borderRadius: 22, borderWidth: 1, borderColor: '#E3DCCC', gap: 16 },
  champagne: { color: '#756349' }, rule: { height: 1, backgroundColor: '#C6B18A' },
  identities: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 }, identity: { flexGrow: 1, flexBasis: 150, gap: 6 },
  tableHeader: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#C6B18A' },
  line: { paddingBottom: 16, borderBottomWidth: 1, borderColor: '#E8E2D7', gap: 6 },
  amount: { alignSelf: 'flex-end', fontWeight: '600' }, total: { backgroundColor: '#191916', borderRadius: 16, padding: 18, gap: 8 },
});
