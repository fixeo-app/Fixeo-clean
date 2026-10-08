import { KeyboardInput } from '@/ui/KeyboardInput';
import { useState } from 'react';
import { View } from 'react-native';
import type { MobileDiagnosticResult } from '@/lib/mobileDiagnostic';
import { confirmedDiagnosticDescription, diagnosticFactText, diagnosticProvenance, diagnosticQuestions, diagnosticSafetyMessage, photoRelevance } from '@/lib/clientDiagnostic';
import { ClientSection, clientStyles } from './ClientEditorial';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';

export function ClientDiagnostic({ result, confirmed, onConfirm, onExit, onClarify, description, onContinueText }: {
  result: MobileDiagnosticResult; confirmed: boolean; onConfirm: (description: string) => void; onExit?: () => void; onClarify?: () => void; description?: string; onContinueText?: () => void;
}) {
  const [answers, setAnswers] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [details, setDetails] = useState(false);
  const questions = diagnosticQuestions(result);
  const next = questions[answers.length];
  const neutral = /aucun.*(probl[eè]me|d[eé]faut|dommage)|pas de.*(probl[eè]me|d[eé]faut)/i.test(result.problem.value || '');
  const relevance = photoRelevance(result, description);
  if (result.safety.stop) return <ClientSection testID="client-diagnostic-safety">
    <View accessibilityRole="alert"><FixeoText variant="heading">Cette situation peut présenter un risque.</FixeoText><FixeoText>{diagnosticSafetyMessage(result)}</FixeoText></View>
    {onExit && <FixeoAction label="Revenir à mon espace" variant="secondary" onPress={onExit} />}
  </ClientSection>;
  return <ClientSection testID="client-diagnostic" label="RAFI · AVEC VOUS">
    <FixeoText variant="heading">Ce que RAFI voit</FixeoText>
    <FixeoText>{result.facts.filter(fact => fact.provenance === 'observed').map(diagnosticFactText).join('\n') || 'La photo ne permet pas d’établir une observation précise.'}</FixeoText>
    <FixeoText variant="caption" tone="secondary">Ce que vous avez déclaré</FixeoText>
    <FixeoText>{description || result.facts.filter(fact => fact.provenance === 'user_declared' || fact.provenance === 'user_confirmed').map(diagnosticFactText).join('\n') || 'Aucun problème déclaré.'}</FixeoText>
    {relevance === 'unrelated' ? <FixeoText accessibilityRole="alert">Cette photo ne semble pas montrer le problème décrit. Vous pouvez la remplacer ou continuer avec votre description.</FixeoText>
      : <FixeoText variant="supporting" tone="secondary">{relevance === 'uncertain' ? 'Le lien entre cette photo et votre problème reste à vérifier. ' : ''}Une photo ne confirme pas une cause ou un défaut caché.</FixeoText>}
    {relevance !== 'unrelated' && <><FixeoText variant="caption" tone="secondary">Ce que RAFI suppose</FixeoText><FixeoText>{result.problem.value || 'Quelques précisions utiles.'}</FixeoText></>}
    {relevance !== 'related' && description && onContinueText ? <FixeoAction label="Continuer avec ma description" variant="secondary" onPress={onContinueText} /> : null}
    {relevance === 'unrelated' ? null : neutral && onClarify ? <FixeoAction label="Décrire le problème constaté" onPress={onClarify} /> : confirmed ? <FixeoText accessibilityLiveRegion="polite">CONFIRMÉ PAR VOUS · La description reste modifiable avant envoi.</FixeoText> : next ? <View style={{ gap: 12 }} testID="client-diagnostic-question">
      <FixeoText variant="heading">{next.label}</FixeoText>
      <KeyboardInput accessibilityLabel={next.label} value={answer} onChangeText={setAnswer} multiline style={clientStyles.input} placeholder="Votre réponse, ou ce que vous ignorez" />
      <FixeoAction label="Confirmer cette précision" disabled={!answer.trim()} onPress={() => { setAnswers([answer.trim()]); setAnswer(''); }} />
      {next.optional && <FixeoAction label="Continuer sans cette précision" variant="ghost" onPress={() => onConfirm(confirmedDiagnosticDescription(result, []))} />}
    </View> : <FixeoAction label="Confirmer cette description" onPress={() => onConfirm(confirmedDiagnosticDescription(result, answers))} />}
    {answers.map((value, i) => <FixeoText key={i} variant="supporting" tone="secondary">CONFIRMÉ · {questions[i].label} {value}</FixeoText>)}
    <FixeoAction variant="ghost" label={details ? 'Masquer les détails de l’analyse' : 'Comprendre l’analyse'} accessibilityState={{ expanded: details }} onPress={() => setDetails(value => !value)} />
    {details && <View style={{ gap: 12 }}>
      <FixeoText variant="heading">Ce qui reste à vérifier</FixeoText>
      <FixeoText>{diagnosticProvenance(result.trade.provenance)} · Métier : {result.trade.value}</FixeoText>
      {[...result.hypotheses, ...result.facts.filter(fact => fact.provenance === 'ai_inferred')].map((item, i) => <FixeoText key={i}>{diagnosticProvenance(item.provenance)} · {item.value}</FixeoText>)}
      {result.possible_parts.map((part, i) => <FixeoText key={i}>{diagnosticProvenance(part.provenance)} · Pièce possible : {part.value}</FixeoText>)}
      {result.checks.map((check, i) => <FixeoText key={i}>{check}</FixeoText>)}
      {!!result.urgency.reason && <FixeoText variant="supporting">{diagnosticProvenance(result.urgency.provenance)} · {result.urgency.reason}</FixeoText>}
      <FixeoText variant="caption" tone="secondary">Analyse indicative. Les hypothèses et pièces possibles restent à vérifier par un professionnel.</FixeoText>
    </View>}
  </ClientSection>;
}
