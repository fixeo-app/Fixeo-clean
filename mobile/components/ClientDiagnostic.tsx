import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { MobileDiagnosticResult } from '@/lib/mobileDiagnostic';
import { confirmedDiagnosticDescription, diagnosticProvenance, diagnosticQuestions } from '@/lib/clientDiagnostic';
import { ClientSection, clientStyles } from './ClientEditorial';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';

export function ClientDiagnostic({ result, confirmed, onConfirm }: {
  result: MobileDiagnosticResult; confirmed: boolean; onConfirm: (description: string) => void;
}) {
  const [answers, setAnswers] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [details, setDetails] = useState(false);
  const questions = diagnosticQuestions(result);
  const next = questions[answers.length];
  if (result.safety.stop) return <ClientSection testID="client-diagnostic-safety" label="LA SÉCURITÉ D’ABORD">
    <FixeoText variant="heading" accessibilityRole="alert">Mettez-vous en sécurité.</FixeoText>
    <FixeoText>N’intervenez pas vous-même. Contactez un professionnel qualifié avant de poursuivre.</FixeoText>
    {!!result.urgency.reason && <FixeoText>{result.urgency.reason}</FixeoText>}
    {result.checks.map((check, i) => <FixeoText key={i}>{check}</FixeoText>)}
    <FixeoText variant="caption" tone="secondary">La demande est suspendue par le signal de sécurité de RAFI.</FixeoText>
  </ClientSection>;
  return <ClientSection testID="client-diagnostic" label="RAFI · AVEC VOUS">
    <FixeoText variant="caption" tone="secondary">{diagnosticProvenance(result.problem.provenance)}</FixeoText>
    <FixeoText variant="heading">{result.problem.value || 'Quelques précisions utiles.'}</FixeoText>
    {result.facts.filter(fact => fact.provenance !== 'ai_inferred').map((fact, i) => <View key={fact.key + i} style={{ gap: 4 }}>
      <FixeoText variant="caption" tone="secondary">{diagnosticProvenance(fact.provenance)}</FixeoText>
      <FixeoText>{fact.value}</FixeoText>
    </View>)}
    {!!result.urgency.reason && <FixeoText variant="supporting">{diagnosticProvenance(result.urgency.provenance)} · {result.urgency.reason}</FixeoText>}
    {result.questions.some(question => question.type === 'choice') ? <View testID="client-diagnostic-review" style={{ gap: 12 }}>
      <FixeoText variant="heading">{result.questions.find(question => question.type === 'choice')?.label}</FixeoText>
      <FixeoText accessibilityRole="alert">RAFI ne peut pas vérifier cette précision dans l’application pour le moment. Faites vérifier la situation par un professionnel avant de poursuivre.</FixeoText>
    </View> : confirmed ? <FixeoText accessibilityLiveRegion="polite">CONFIRMÉ PAR VOUS · La description reste modifiable avant envoi.</FixeoText> : next ? <View style={{ gap: 12 }} testID="client-diagnostic-question">
      <FixeoText variant="heading">{next.label}</FixeoText>
      <TextInput accessibilityLabel={next.label} value={answer} onChangeText={setAnswer} multiline style={clientStyles.input} placeholder="Votre réponse, ou ce que vous ignorez" />
      <FixeoAction label="Confirmer cette précision" disabled={!answer.trim()} onPress={() => { setAnswers(current => [...current, answer.trim()]); setAnswer(''); }} />
    </View> : <FixeoAction label="Cette description correspond" onPress={() => onConfirm(confirmedDiagnosticDescription(result, answers))} />}
    {answers.map((value, i) => <FixeoText key={i} variant="supporting" tone="secondary">CONFIRMÉ · {questions[i].label} {value}</FixeoText>)}
    <FixeoAction variant="ghost" label={details ? 'Masquer les détails de l’analyse' : 'Comprendre l’analyse'} accessibilityState={{ expanded: details }} onPress={() => setDetails(value => !value)} />
    {details && <View style={{ gap: 12 }}>
      <FixeoText>{diagnosticProvenance(result.trade.provenance)} · Métier : {result.trade.value}</FixeoText>
      {[...result.hypotheses, ...result.facts.filter(fact => fact.provenance === 'ai_inferred')].map((item, i) => <FixeoText key={i}>{diagnosticProvenance(item.provenance)} · {item.value}</FixeoText>)}
      {result.possible_parts.map((part, i) => <FixeoText key={i}>{diagnosticProvenance(part.provenance)} · Pièce possible : {part.value}</FixeoText>)}
      {result.checks.map((check, i) => <FixeoText key={i}>{check}</FixeoText>)}
      <FixeoText variant="caption" tone="secondary">Analyse indicative. Les hypothèses et pièces possibles restent à vérifier par un professionnel.</FixeoText>
    </View>}
  </ClientSection>;
}
