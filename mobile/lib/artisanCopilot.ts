import type { BusinessClient, BusinessQuote, BusinessJob, LedgerEntry } from './artisanOS';
export type CopilotCommand =
 | { kind: 'navigate'; path: string; params?: Record<string,string>; message: string; intent?: 'agenda/today'; readOnly?: boolean; actionLabel?: string }
 | { kind: 'availability'; status: 'available' | 'unavailable' | 'busy'; message: string }
 | { kind: 'unsupported'; message: string };
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g,'').toLowerCase().replace(/[’']/g,' ').replace(/[^a-z0-9\u0600-\u06ff ]/g,' ').replace(/\s+/g,' ').trim();
const normalizedCommand = (text: string) => fold(text)
 .replace(/(?:الديفي|ديفي|دڤي|\bdevi\b)/g, ' devis ')
 .replace(/(?:الكليان|كليان|الزبناء|الزبون|زبون|\bkliyan\b)/g, ' client ')
 .replace(/(?:الفلوس|فلوس|الحسابات|المداخيل|المصاريف|\bflous\b)/g, ' finance ')
 .replace(/(?:الرصيد|رصيد)/g, ' solde ')
 .replace(/(?:البروفيل|بروفيل)/g, ' profil ');
const opensPage = (text: string) => /\b(ouvre|ouvrir|affiche|7ell|hell|7el|ft7|fte7)\b|حل|حلي|افتح/.test(fold(text));
export type CopilotContext = { clients?: BusinessClient[] | null; quotes?: BusinessQuote[] | null; jobs?: BusinessJob[] | null; ledger?: LedgerEntry[] | null; now?: Date };
export function copilotReads(text: string) {
 const t=normalizedCommand(text), agenda=isTodayAgendaCommand(text);
 return {clients:/client|devis/.test(t)||agenda, quotes:/devis/.test(t), jobs:agenda, ledger:/finance|solde|encaisse|depense|paiement/.test(t)};
}
const navigate = (path: string, message: string, params?: Record<string,string>): CopilotCommand => ({ kind:'navigate', path, message, params });
/** Bounded PB1 command vocabulary. No model-generated route, SQL or automatic write. */
export function understandArtisanCommand(text: string, context: CopilotContext = {}): CopilotCommand {
 const t=normalizedCommand(text);
 const language=copilotLanguage(text);
 if (/\b(mat|ma|bla)\b.{0,20}\b(7ell|hell|t7ell)\b|ما\s*تحل|بلا\s*ما|ماتحل/.test(t)) return {kind:'unsupported',message:language==='darija-ar'?'ما وجدت حتى إجراء. وضح ليا الطلب.':language==='darija-latin'?'Ma wejjedt ta ijraa. Wdde7 lia talab.':'Aucune action préparée. Reformulez la commande souhaitée.'};
 if (!/\b(ne|pas|annule|annuler|supprime|supprimer|envoie|appelle|negocie)\b/.test(t) && isTodayAgendaCommand(t)) {
  const readOnly=!opensPage(text);
  const message=summarizeToday(context.jobs,context.clients,language,context.now);
  return {kind:'navigate',path:'/artisan-workspace/agenda',intent:'agenda/today',readOnly, message,
   actionLabel:language==='darija-ar'?'حل الأجندا ديالي':language==='darija-latin'?'7ell agenda dyali':'Ouvrir mon agenda'};
 }
 if (/\b(ne|pas|annule|annuler|supprime|supprimer|envoie|appelle|negocie)\b/.test(t)) return {kind:"unsupported",message:"Aucune action préparée. Reformulez la commande souhaitée."};
 if (/\b(passe|mets|rends|deviens)\b/.test(t) && /\b(indisponible|disponible|occupe)\b/.test(t)) {
  const status = /\bindisponible\b/.test(t) ? 'unavailable' : /\boccupe\b/.test(t) ? 'busy' : 'available';
  return {kind:'availability',status,message:`Confirmez le passage au statut ${status==='available'?'Disponible':status==='busy'?'Occupé':'Indisponible'}.`};
 }
 if (/\b(ajoute|enregistre|prepare|saisir)\b/.test(t) && /\b(encaissement|depense|paiement)\b/.test(t)) {
  const expense=t.includes('depense'), amount=text.match(/\b(\d+(?:[.,]\d{1,2})?)\s*(?:dh|mad|dirham)/i)?.[1] || '';
  return navigate('/artisan-workspace/finance',`Ouvrir une ${expense?'dépense':'saisie d’encaissement'}${amount?' de '+amount+' MAD':''}. Vous vérifierez puis confirmerez l’enregistrement dans le formulaire.`,{new:'1',kind:expense?'expense':'income',amount});
 }
 if (/\b(planifie|prevois|programme)\b/.test(t)) return navigate('/artisan-workspace/agenda','Ouvrir la planification. Choisissez la date, l’heure et confirmez avant enregistrement.',{new:'1',day:t.includes('demain')?'tomorrow':''});
 if (/\b(prepare|nouveau|cree)\b/.test(t) && t.includes('devis')) return navigate('/artisan-workspace/quote/new','Ouvrir un nouveau devis à compléter. Aucun devis ne sera enregistré sans votre confirmation.');
 if (/demain|semaine|mois|غدا|غدا|\bghdda\b|\bgheda\b/.test(t) && /agenda|rendez vous|اجندا|اجندة/.test(t)) {
  return {kind:'navigate',path:'/artisan-workspace/agenda',readOnly:!opensPage(text),message:'La synthèse RAFI couvre les rendez-vous du jour. Consultez l’agenda pour cette autre période.',actionLabel:'Ouvrir mon agenda'};
 }
 if (t.includes('devis')) {
  const clients=(context.clients||[]).filter(c=>t.includes(fold(c.full_name)));
  const quotes=(context.quotes||[]).filter(q=>t.includes(fold(q.quote_number)) || (q.title && t.includes(fold(q.title))) || clients.some(c=>c.id===q.client_id));
  if (!opensPage(text)) {
   const message=context.quotes==null ? 'Les devis sont momentanément indisponibles. Réessayez pour les consulter.'
    : quotes.length===1 ? `${quotes[0].quote_number} · ${quotes[0].title} : ${quoteStatus(quotes[0].status)}, ${money(quotes[0].total)} MAD.`
    : `Dans les devis disponibles : ${context.quotes.length} devis, dont ${context.quotes.filter(q=>q.status==='draft').length} en brouillon.${quotes.length>1?' Plusieurs devis correspondent à votre recherche.':''}`;
   return {kind:'navigate',path:quotes.length===1?'/artisan-workspace/quote/[id]':'/artisan-workspace/quotes',params:quotes.length===1?{id:quotes[0].id}:undefined,readOnly:true,message,actionLabel:'Consulter les devis'};
  }
  if(quotes.length===1) return navigate('/artisan-workspace/quote/[id]',`Ouvrir ${quotes[0].quote_number} · ${quotes[0].title}.`,{id:quotes[0].id});
  return navigate('/artisan-workspace/quotes',quotes.length>1?'Plusieurs devis correspondent. Choisissez le bon dans Devis Studio.':'Ouvrir Devis Studio pour choisir votre devis.');
 }
 if (t.includes('client')) {
  const clients=(context.clients||[]).filter(c=>t.includes(fold(c.full_name)));
  if (!opensPage(text)) return {kind:'navigate',path:clients.length===1?'/artisan-workspace/client/[id]':'/artisan-workspace/clients',params:clients.length===1?{id:clients[0].id}:undefined,readOnly:true,
   message:context.clients==null?'Les fiches clients sont momentanément indisponibles.':clients.length===1?`${clients[0].full_name}${clients[0].city?' · '+clients[0].city:''}${clients[0].phone?' · '+clients[0].phone:''}.`:`Vous avez ${context.clients.length} fiche(s) dans les clients disponibles.`,actionLabel:'Consulter les clients'};
  return clients.length===1 ? navigate('/artisan-workspace/client/[id]',`Ouvrir la fiche ${clients[0].full_name}.`,{id:clients[0].id}) : navigate('/artisan-workspace/clients','Ouvrir vos clients pour choisir la fiche.');
 }
 if (/finance|solde|encaisse|depense|paiement/.test(t)) return opensPage(text) ? navigate('/artisan-workspace/finance','Ouvrir vos finances.')
  : {kind:'navigate',path:'/artisan-workspace/finance',readOnly:true,message:summarizeFinance(context.ledger,text,language,context.now),actionLabel:'Consulter les finances'};
 if (/attention|priorit|opportunit/.test(t)) return navigate('/artisan','Ouvrir les priorités de votre activité.');
 if (/profil/.test(t)) return navigate('/artisan-workspace/profile','Ouvrir votre profil.');
 return {kind:'unsupported',message:'Cette commande n’est pas encore prise en charge. Je peux ouvrir votre agenda, vos clients, un devis ou les finances, préparer une saisie et proposer un changement de disponibilité.'};
}

export type CopilotLanguage = 'fr' | 'darija-ar' | 'darija-latin';
export function copilotLanguage(text:string):CopilotLanguage {
 if (/[\u0600-\u06ff]/.test(text)) return 'darija-ar';
 return /\b(chno|chnou|shno|3ndi|andi|lyoum|lyouma|dyal|diali|lia|7ell|7el)\b/i.test(text)?'darija-latin':'fr';
}
export function isTodayAgendaCommand(text:string) {
 const t=fold(text);
 // Existing creation commands retain their confirmation/form path, including “aujourd’hui”.
 if (/\b(planifie|prevois|programme|ajoute|enregistre|prepare|saisir|cree|nouveau)\b/.test(t)) return false;
 if (/finance|solde|encaisse|depense|paiement|devis|client/.test(normalizedCommand(text))) return false;
 if (/demain|semaine|mois|غدا|\bghdda\b|\bgheda\b/.test(t)) return false;
 return /aujourd hui|journee|agenda|rendez vous|اجندا|اجندة/.test(t)
  || (/شنو|اش|واش|chno|chnou|shno/.test(t) && /عندي|3ndi|andi/.test(t) && /اليوم|ليوم|lyoum|lyouma/.test(t));
}
const dayKey=(value:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
export function summarizeToday(jobs:BusinessJob[]|null|undefined,clients:BusinessClient[]|null|undefined,language:CopilotLanguage,now=new Date()) {
 if (!jobs) return language==='darija-ar'?'الأجندا ما متوفراش دابا. عاود المحاولة باش نأكد ليك مواعيد اليوم.':language==='darija-latin'?'Agenda ma metweffrach daba. 3awed lmo7awala bach n2ekked lik mawa3id lyoum.':'Votre agenda est momentanément indisponible. Réessayez pour confirmer les rendez-vous du jour.';
 const today=jobs.filter(j=>j.scheduled_at && Number.isFinite(Date.parse(j.scheduled_at)) && dayKey(new Date(j.scheduled_at))===dayKey(now) && !['cancelled','canceled','annule','annulée'].includes(j.status)).sort((a,b)=>Date.parse(a.scheduled_at!)-Date.parse(b.scheduled_at!));
 if(!today.length) return language==='darija-ar'?'ما عندك حتى تدخل مبرمج اليوم فالأجندا المتوفرة.':language==='darija-latin'?'Ma 3ndek ta tadakhol mbermej lyoum f agenda li kayna.':'Vous n’avez aucune intervention programmée aujourd’hui dans l’agenda disponible.';
 const details=today.slice(0,5).map(j=>{
  const time=new Intl.DateTimeFormat('fr-MA',{timeZone:'Africa/Casablanca',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(j.scheduled_at!));
  const client=clients?.find(c=>c.id===j.client_id)?.full_name;
  return language==='darija-ar'?`${time}${client?' مع '+client:' · '+j.title}`:language==='darija-latin'?`${time}${client?' m3a '+client:' · '+j.title}`:`à ${time.replace(':','h')}${client?' avec '+client:' · '+j.title}`;
 }).join(' ; ');
 return language==='darija-ar'?`عندك ${today.length} تدخل مبرمج اليوم: ${details}.`:language==='darija-latin'?`3ndek ${today.length} tadakhol mbermej lyoum: ${details}.`:`Vous avez ${today.length} intervention${today.length>1?'s':''} aujourd’hui : ${details}.${today.length>5?' Les autres sont disponibles dans votre agenda.':''}`;
}

const money=(value:number)=>new Intl.NumberFormat('fr-MA',{maximumFractionDigits:2}).format(value);
const quoteStatus=(status:string)=>({draft:'brouillon',sent:'envoyé',accepted:'accepté',declined:'refusé',expired:'expiré'}[status] || status);
function summarizeFinance(ledger:LedgerEntry[]|null|undefined,text:string,language:CopilotLanguage,now=new Date()) {
 if(!ledger) return language==='darija-ar'?'الحسابات ما متوفراش دابا. عاود المحاولة.':language==='darija-latin'?'L7ssabat ma metweffrach daba. 3awed lmo7awala.':'Vos finances sont momentanément indisponibles. Réessayez pour confirmer les montants.';
 if(/demain|semaine|mois|غدا|سيمانة|شهر/.test(fold(text))) return 'Cette période nécessite une consultation dans Finance. Aucun montant n’est déduit pour cette période.';
 const today=/aujourd hui|اليوم|ليوم|\blyoum(?:a)?\b/.test(fold(text));
 const entries=today?ledger.filter(e=>e.occurred_on.slice(0,10)===dayKey(now)):ledger;
 const income=entries.filter(e=>e.entry_type==='income').reduce((sum,e)=>sum+Number(e.amount),0);
 const expense=entries.filter(e=>e.entry_type==='expense').reduce((sum,e)=>sum+Number(e.amount),0);
 if(!Number.isFinite(income)||!Number.isFinite(expense)) return 'Les montants disponibles ne permettent pas de confirmer un total. Consultez Finance.';
 return language==='darija-ar'?`${today?'اليوم':'فالحركات المتوفرة'}: المداخيل ${money(income)} MAD، المصاريف ${money(expense)} MAD، الفرق ${money(income-expense)} MAD.`
  : language==='darija-latin'?`${today?'Lyoum':'F l7arakat li kayna'}: dakhil ${money(income)} MAD, masarif ${money(expense)} MAD, lfar9 ${money(income-expense)} MAD.`
  : `${today?'Aujourd’hui':'Sur les mouvements disponibles'} : ${money(income)} MAD encaissés, ${money(expense)} MAD de dépenses. Solde enregistré : ${money(income-expense)} MAD.`;
}
