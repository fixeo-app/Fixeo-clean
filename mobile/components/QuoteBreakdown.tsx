import { View } from 'react-native';
import { quoteEconomics } from '@/lib/moneyContract';
import { money } from '@/lib/artisanExperience';
import { FixeoText } from '@/ui/FixeoText';
export function QuoteBreakdown({ total, source }: { total: number; source: string }) {
  const values = quoteEconomics(total, source);
  return <View style={{ gap: 8 }}>
    <FixeoText variant="caption" tone="secondary">TOTAL CLIENT</FixeoText>
    <FixeoText variant="title">{money(values.total)}</FixeoText>
    {values.commission !== null && <>
      <FixeoText>Commission FIXEO · 15 % : {money(values.commission)}</FixeoText>
      <FixeoText>Net Artisan indicatif : {money(values.net)}</FixeoText>
      <FixeoText variant="caption" tone="secondary">Commission comprise dans le total client, avant vos autres coûts et votre fiscalité. Aucun supplément ajouté au client.</FixeoText>
    </>}
    <FixeoText variant="caption" tone="secondary">Aucune TVA calculée sans statut fiscal renseigné.</FixeoText>
  </View>;
}
