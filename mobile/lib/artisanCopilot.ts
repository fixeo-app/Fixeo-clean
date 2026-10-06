import type { BusinessClient, BusinessQuote } from './artisanOS';
export type CopilotCommand =
 | { kind: 'navigate'; path: string; params?: Record<string,string>; message: string }
 | { kind: 'availability'; status: 'available' | 'unavailable' | 'busy'; message: string }
 | { kind: 'unsupported'; message: string };
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const navigate = (path: string, message: string, params?: Record<string,string>): CopilotCommand => ({ kind:'navigate', path, message, params });
/** Bounded PB1 command vocabulary. No model-generated route, SQL or automatic write. */
export function understandArtisanCommand(text: string, context: { clients?: BusinessClient[]; quotes?: BusinessQuote[] } = {}): CopilotCommand {
 const t=fold(text);
 if (/\b(ne|pas|annule|annuler|supprime|supprimer|envoie|appelle|negocie)\b/.test(t)) return {kind:"unsupported",message:"Aucune action préparée. Reformulez la commande souhaitée."};
 if (/\b(passe|mets|rends|deviens|statut|disponib)/.test(t) && /\b(indisponible|disponible|occupe)\b/.test(t)) {
  const status = /\bindisponible\b/.test(t) ? 'unavailable' : /\boccupe\b/.test(t) ? 'busy' : 'available';
  return {kind:'availability',status,message:`Confirmez le passage au statut ${status==='available'?'Disponible':status==='busy'?'Occupé':'Indisponible'}.`};
 }
 if (/\b(ajoute|enregistre|prepare|saisir)\b/.test(t) && /\b(encaissement|depense|paiement)\b/.test(t)) {
  const expense=t.includes('depense'), amount=text.match(/\b(\d+(?:[.,]\d{1,2})?)\s*(?:dh|mad|dirham)/i)?.[1] || '';
  return navigate('/artisan-workspace/finance',`Ouvrir une ${expense?'dépense':'saisie d’encaissement'}${amount?' de '+amount+' MAD':''}. Vous vérifierez puis confirmerez l’enregistrement dans le formulaire.`,{new:'1',kind:expense?'expense':'income',amount});
 }
 if (/\b(planifie|prevois|programme)\b/.test(t)) return navigate('/artisan-workspace/agenda','Ouvrir la planification. Choisissez la date, l’heure et confirmez avant enregistrement.',{new:'1',day:t.includes('demain')?'tomorrow':''});
 if (/\b(prepare|nouveau|cree)\b/.test(t) && t.includes('devis')) return navigate('/artisan-workspace/quote/new','Ouvrir un nouveau devis à compléter. Aucun devis ne sera enregistré sans votre confirmation.');
 if (t.includes('devis')) {
  const clients=(context.clients||[]).filter(c=>t.includes(fold(c.full_name)));
  const quotes=(context.quotes||[]).filter(q=>t.includes(fold(q.quote_number)) || (q.title && t.includes(fold(q.title))) || clients.some(c=>c.id===q.client_id));
  if(quotes.length===1) return navigate('/artisan-workspace/quote/[id]',`Ouvrir ${quotes[0].quote_number} · ${quotes[0].title}.`,{id:quotes[0].id});
  return navigate('/artisan-workspace/quotes',quotes.length>1?'Plusieurs devis correspondent. Choisissez le bon dans Devis Studio.':'Ouvrir Devis Studio pour choisir votre devis.');
 }
 if (t.includes('client')) {
  const clients=(context.clients||[]).filter(c=>t.includes(fold(c.full_name)));
  return clients.length===1 ? navigate('/artisan-workspace/client/[id]',`Ouvrir la fiche ${clients[0].full_name}.`,{id:clients[0].id}) : navigate('/artisan-workspace/clients','Ouvrir vos clients pour choisir la fiche.');
 }
 if (/aujourd hui|journee|agenda|rendez vous/.test(t)) return navigate('/artisan-workspace/agenda','Ouvrir votre agenda du jour.');
 if (/finance|solde|encaissement|depense/.test(t)) return navigate('/artisan-workspace/finance','Ouvrir vos finances.');
 if (/attention|priorit|opportunit/.test(t)) return navigate('/artisan','Ouvrir les priorités de votre activité.');
 if (/profil/.test(t)) return navigate('/artisan-workspace/profile','Ouvrir votre profil.');
 return {kind:'unsupported',message:'Cette commande n’est pas encore prise en charge. Je peux ouvrir votre agenda, vos clients, un devis ou les finances, préparer une saisie et proposer un changement de disponibilité.'};
}
