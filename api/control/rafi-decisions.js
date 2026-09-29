'use strict';

const {createHash} = require('node:crypto');
const {CAPABILITIES} = require('./contracts');
const {decisionResult} = require('./decision-contracts');
const Cohorts = require('./marketplace-cohorts');
const VERSION = 'rafi-decisions-v1';
const SOURCES = Object.freeze(['operations', 'network', 'trust', 'finance', 'enterprise']);
const FRESH_MS = 60000;
const PRIORITIES = Object.freeze({P0: 'Critique immédiat', P1: 'Action maintenant', P2: 'Action aujourd’hui', P3: 'Surveillance'});
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const age = (value, now) => time(value) !== null && time(value) <= now ? Math.floor((now - time(value)) / 60000) : null;
const known = value => value == null || value === '' ? 'non renseigné' : String(value);
const place = o => [o.city, o.service_category].filter(Boolean).join(' · ');

function sourceState(source, data, error, now = Date.now()) {
  if (error) return {source, status: error.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'UNAVAILABLE', error: error.code || 'DEPENDENCY_UNAVAILABLE', as_of: null, data: null};
  const stamp = time(data?.as_of);
  if (data?.contract_version !== 'rafi-observations-v1' || data.source !== source || !Array.isArray(data.observations) || stamp === null || stamp > now + 5000 || !numeric(data.total_observations) || data.total_observations < data.observations.length || typeof data.has_more !== 'boolean' || data.has_more !== (data.total_observations > data.observations.length)) {
    return {source, status: 'UNAVAILABLE', error: 'INVALID_SOURCE_PROVENANCE', as_of: null, data: null};
  }
  const status = now - stamp > FRESH_MS ? 'STALE' : data.has_more ? 'PARTIAL' : 'FRESH';
  return {source, status, as_of: data.as_of, error: null, data};
}

function build(states, {now = Date.now(), classification = 'all'} = {}) {
  const decisions = [];
  const unavailable = SOURCES.filter(s => !['FRESH', 'PARTIAL'].includes(states[s]?.status));
  const add = (source, o, type, priority, title, reason, impact, recommendation, options = {}) => {
    if (!numeric(o.count) || o.count === 0 || !o.facts || !o.reference) return;
    const state = states[source];
    const targetType = options.target_type || o.target_type;
    const targetId = options.target_id || o.target_id || null;
    const capability = options.capability || null;
    const context = {view: o.facts.cube_context ? 'intelligence' : options.view || 'operations', city: o.city || null, trade: o.service_category || null, enterprise_id: o.enterprise_id || null, site_id: o.site_id || null, type: targetType, id: targetId, classification, state: options.state || null};
    if(o.facts.all_cells)context.all_cells=true;
    const key = [type, targetType, targetId, o.city, o.service_category, o.enterprise_id, o.site_id, classification];
    const authority = capability ? CAPABILITIES[capability].authority : options.authority || 'Control · lecture administrateur';
    const id = 'rafi_' + digest(key);
    decisions.push({
      kind: 'Decision', contract_version: VERSION, rule_version: '1', decision_id: id, decision_type: type,
      priority, priority_label: PRIORITIES[priority], title, summary: title, reason,
      evidence: [{kind: 'FACT', source, reference: o.reference, target_type: o.target_type, target_id: o.target_id || null, count: o.count, facts: o.facts, sample_ids: o.sample_ids || [], as_of: state.as_of, scope: {classification, city: o.city || null, service_category: o.service_category || null}, completeness: 'complete_observation', source_window: state.status}],
      impact: {kind: 'INFERENCE', text: impact},
      recommended_action: {kind: 'RECOMMENDATION', text: recommendation, context},
      target_type: targetType, target_id: targetId, city: o.city || null, service_category: o.service_category || null,
      affected_count: o.count, age_minutes: age(o.created_at, now), confidence: 'observed_facts', authority,
      actionability: {status: 'AVAILABLE', mode: capability ? 'PREPARE' : 'OPEN', capability, rpc: capability ? 'control_action_preview_v1 → control_action_execute_v1' : o.facts.cube_context ? 'control_marketplace_population_v1 / control_dossier_section_v1' : 'control_dossier_read_v1 / control_operations_list_v1', execution_authorized: false, requires_confirmation: Boolean(capability), preconditions: capability ? ['admin_server_check', 'fresh_dossier', 'canonical_preview', 'domain_recheck'] : ['admin_server_check'], unavailable_reason: options.unavailable_reason || null},
      created_at: o.created_at || null, updated_at: state.as_of, expires_at: new Date(time(state.as_of) + FRESH_MS).toISOString(),
      universes: options.universes || ['OPERATIONS'], related_ids: options.related_ids || [],
    });
  };
  for (const source of SOURCES) {
    const state = states[source];
    if (!['FRESH', 'PARTIAL'].includes(state?.status)) continue;
    for (const o of state.data.observations) {
      if (!o || typeof o.facts !== 'object' || !o.facts || !numeric(o.count) || o.count === 0) continue;
      const f = o.facts, minutes = age(o.created_at, now), where = place(o);
      switch (o.kind) {
        case 'marketplace.cohorts': {
          const c=Cohorts.build(f.cohorts,now);
          if(c.status==='FRESH'&&c.comparison?.status==='OBSERVED_DIFFERENCE'&&c.comparison.delta_percentage_points<0){
            const a=c.cohorts.find(x=>x.label==='current').conversion,b=c.cohorts.find(x=>x.label==='previous').conversion;
            add(source,o,'marketplace.conversion_review','P2','Conversion à horizon fixe en baisse observée',
              [`${a.numerator}/${a.denominator} demandes acceptées dans l’horizon, contre ${b.numerator}/${b.denominator} sur la cohorte précédente.`, `Deux fenêtres de ${c.scope.days} jours métier, horizon ${c.scope.horizon_hours} h, aucune cohorte récente exclue ni preuve inconnue.`, 'Au moins 30 demandes observables par cohorte ; intervalles Wilson 95 % disjoints.'],
              'Une friction de parcours est possible ; ni sa cause ni son effet commercial ne sont démontrés.',
              'Comparer les populations et leurs dossiers avant de choisir une intervention.',{universes:['MARKETPLACE','CLIENT','OPERATIONS'],authority:'Marketplace · lecture de cohortes canoniques'});
          }break;
        }
        case 'request.waiting': {
          const urgent = ['now', 'urgent'].includes(f.urgency);
          const critical = urgent && minutes !== null && minutes >= 120;
          add(source, o, 'request.waiting', critical ? 'P0' : urgent || f.status === 'no_match' ? 'P1' : minutes !== null && minutes >= 1440 ? 'P1' : 'P2',
            `${urgent ? 'Urgence' : 'Demande'} sans prise en charge${where ? ' · ' + where : ''}`,
            [`État ${known(f.status)} ; aucun gagnant externe ou interne observé.`, minutes === null ? 'Ancienneté inconnue.' : `${minutes} min depuis la création.`, critical ? 'Seuil de triage RAFI : urgence sans prise en charge ≥ 120 min.' : urgent ? 'Urgence déclarée par la source.' : 'Une prise en charge reste à préparer.'],
            'Le délai de prise en charge peut prolonger l’attente du client.',
            o.enterprise_id ? 'Ouvrir le dossier Enterprise et examiner le dispatch autorisé.' : 'Examiner le dossier et préparer une proposition à un artisan.',
            {capability: !o.enterprise_id && f.status === 'new' ? 'request.dispatch' : null, universes: o.enterprise_id ? ['CLIENT', 'ENTERPRISE', 'OPERATIONS'] : ['CLIENT', 'ARTISAN', 'OPERATIONS'], unavailable_reason: o.enterprise_id ? 'Affectation Enterprise réservée à ses autorités tenant.' : f.status !== 'new' ? 'Dispatch Admin disponible uniquement à l’état new.' : null});
          break;
        }
        case 'mission.inconsistent':
          add(source, o, o.kind, 'P1', 'Cycle mission / demande incohérent', [`Mission ${known(f.status)} ; demande ${known(f.request_status)}.`], 'La supervision et le suivi financier peuvent être ambigus.', 'Ouvrir les deux dossiers et faire qualifier l’écart par l’autorité métier.', {universes: ['OPERATIONS', 'FINANCE'], unavailable_reason: 'Aucune réparation automatique du cycle.'}); break;
        case 'mission.aging':
          if (minutes !== null && minutes >= 1440) add(source, o, o.kind, 'P2', `Mission sans nouvelle étape depuis ${Math.floor(minutes / 60)} h`, [`État ${known(f.status)} ; dernier jalon canonique ${known(o.created_at)}.`], 'Un blocage est possible ; l’ancienneté seule ne le prouve pas.', 'Examiner la mission et ses événements avant intervention.', {universes: ['OPERATIONS', 'CLIENT']}); break;
        case 'quote.review':
          add(source, o, o.kind, minutes !== null && minutes >= 1440 ? 'P1' : 'P2', `Devis marketplace à revoir${where ? ' · ' + where : ''}`, [`Version ${known(f.quote_version)} soumise, non approuvée.`], 'La présentation au client attend la revue du devis.', 'Vérifier le périmètre et préparer la revue du devis.', {capability: 'quote.approve', universes: ['MARKETPLACE', 'CLIENT', 'TRUST']}); break;
        case 'dispatch.failed':
          add(source, o, o.kind, 'P1', `${o.count} notification(s) de dispatch en échec`, [`Échec enregistré dans l’outbox ; ${known(f.attempt_count)} tentative(s) cumulée(s).`], 'Des artisans peuvent ne pas avoir reçu la proposition.', 'Ouvrir la demande et examiner l’état du dispatch.', {universes: ['OPERATIONS', 'ARTISAN'], unavailable_reason: 'Aucun retry de notification autorisé depuis RAFI dans ce Bloc.'}); break;
        case 'network.cohort': {
          if (f.location_known !== true) {
            add(source, o, 'network.context_missing', 'P2', `${o.count} demande(s) sans ville ou métier exploitable`, ['La correspondance de couverture ne peut pas être calculée.'], 'Une demande insuffisamment qualifiée peut retarder le dispatch.', 'Ouvrir les demandes pour examiner leur contexte.', {universes: ['CLIENT', 'OPERATIONS']});
            break;
          }
          if (!['available_profiles', 'profiles', 'to_verify', 'unclaimed', 'urgent_count', 'total_waiting'].every(k => numeric(f[k]))) break;
          const label = where || 'Ville / métier non renseigné';
          if (f.available_profiles === 0 && (!f.cube_context || f.availability_unknown === 0)) add(source, o, 'network.coverage', f.urgent_count > 0 ? 'P1' : 'P2', `${o.count} demande(s), aucun profil disponible déclaré · ${label}`,
            [`${f.profiles} profil(s) déclarent cette ville et ce métier ; aucun n’est marqué disponible.`, `${f.urgent_count} demande(s) urgente(s) dans cette cohorte.`, f.cube_context?'Dimensions normalisées par les fonctions canoniques, métiers et villes secondaires inclus.':'Correspondance déclarative exacte, métiers et villes secondaires inclus.'],
            'Un manque de couverture locale est possible ; Dispatch peut proposer une proximité autorisée.',
            f.profiles ? 'Examiner les profils existants et la couverture Dispatch.' : 'Prioriser la recherche de profils pour cette ville et ce métier.', {view: 'network', universes: ['CLIENT', 'ARTISAN', 'OPERATIONS'], authority: 'Network · observation ; Dispatch reste souverain'});
          else if (f.available_profiles > 0) add(source, o, 'network.capacity', 'P3', `${f.available_profiles} profil(s) disponible(s) pour ${o.count} demande(s) · ${label}`,
            ['Disponibilité déclarée, sans réservation de capacité.', 'Éligibilité finale et acceptation vérifiées par Dispatch.'],
            'Le réseau déclaré peut aider à réduire cette attente, sans garantie d’affectation.', 'Ouvrir les demandes de cette cohorte et préparer le dispatch.', {universes: ['CLIENT', 'ARTISAN', 'OPERATIONS']});
          if (f.to_verify > 0) add(source, o, 'network.verify', f.urgent_count > 0 ? 'P1' : 'P2', `${f.to_verify} profil(s) à vérifier là où ${o.count} demande(s) attendent · ${label}`,
            ['Profils revendiqués, avec propriétaire et onboarding terminé, non vérifiés.', 'La demande locale détermine l’ordre de revue ; vérifier ne garantit pas la disponibilité.'],
            'Une revue Trust peut améliorer la confiance du réseau mobilisable.', 'Ouvrir les profils prioritaires, vérifier leurs éléments et préparer la vérification.', {view: 'network', state: 'unverified', related_ids: f.verify_ids || [], universes: ['CLIENT', 'ARTISAN', 'TRUST'], authority: 'Trust · artisan.verify'});
          if (f.unclaimed > 0) add(source, o, 'network.activate', f.urgent_count > 0 ? 'P2' : 'P3', `${f.unclaimed} profil(s) à revendiquer · ${label}`,
            [`${o.count} demande(s) attendent dans cette cohorte.`, f.claimable_only?'Profils revendicables, sans propriétaire ni claim pending ; aucune disponibilité future présumée.':'Profils sans propriétaire et non revendiqués ; aucune disponibilité future présumée.'],
            'Une activation légitime de ces profils pourrait renforcer le réseau local.', 'Examiner les profils existants à activer ; la revendication reste celle de leur propriétaire.', {view: 'network', state: 'unclaimed', related_ids: f.claim_ids || [], universes: ['CLIENT', 'ARTISAN', 'TRUST'], authority: 'Claims · propriétaire puis revue Admin', unavailable_reason: 'RAFI ne revendique pas un profil à la place de son propriétaire.'});
          if (f.total_waiting >= 10 && o.count / f.total_waiting >= 0.5) add(source, o, 'network.concentration', 'P3', `${o.count} / ${f.total_waiting} demandes en attente · ${label}`, ['Au moins la moitié du backlog courant appartient à cette cohorte.', 'Absence de référence historique : aucune anomalie statistique affirmée.'], 'Cette concentration peut amplifier les délais locaux.', 'Examiner la couverture et les demandes de cette cohorte.', {universes: ['CLIENT', 'ARTISAN', 'OPERATIONS']});
          break;
        }
        case 'claim.pending':
          add(source, o, o.kind, minutes !== null && minutes >= 1440 ? 'P1' : 'P2', 'Revendication en attente de revue', ['Le statut canonique est pending.'], 'Le propriétaire légitime attend la décision Trust.', 'Examiner le demandeur et le profil avant de préparer une approbation ou un refus.', {view: 'trust', capability: 'claim.approve', universes: ['TRUST', 'ARTISAN']}); break;
        case 'artisan.verification_conflict':
          add(source, o, o.kind, 'P2', 'Drapeaux de vérification divergents', ['verified et is_verified diffèrent ; verified reste canonique.'], 'Des surfaces historiques peuvent afficher une confiance différente.', 'Ouvrir le profil pour une revue Trust explicite.', {view: 'trust', universes: ['TRUST', 'ARTISAN'], unavailable_reason: 'Aucun alignement automatique du legacy.'}); break;
        case 'finance.price_missing':
          add(source, o, o.kind, 'P2', 'Mission terminée sans prix final', ['Mission terminée dans son cycle canonique ; final_price absent.'], 'La commission due ne peut pas être établie de façon complète.', 'Ouvrir la mission et préparer le prix final après vérification.', {view: 'finance', capability: 'mission.settle', universes: ['FINANCE', 'OPERATIONS']}); break;
        case 'finance.declared':
          add(source, o, o.kind, 'P2', 'Reversement déclaré à rapprocher', [`Montant déclaré : ${known(f.amount)} MAD.`, 'Déclaré ne signifie pas confirmé.'], 'Le rapprochement conditionne la reconnaissance de ce reversement.', 'Examiner la mission, le reversement et sa preuve avant rapprochement.', {view: 'finance', target_type: 'mission', target_id: f.mission_id, universes: ['FINANCE', 'TRUST'], authority: 'Finance · finance.confirm', unavailable_reason: 'La preuve documentaire doit être examinée par l’opérateur.'}); break;
        case 'finance.overpaid':
          add(source, o, o.kind, 'P1', 'Reversements confirmés supérieurs à la commission', [`Confirmé : ${known(f.confirmed)} MAD ; commission : ${known(f.commission_amount)} MAD.`], 'Un écart de rapprochement doit être expliqué.', 'Ouvrir l’historique Finance et qualifier l’écart.', {view: 'finance', universes: ['FINANCE', 'TRUST'], unavailable_reason: 'Aucune correction financière automatique.'}); break;
        case 'enterprise.request': {
          const sla = f.sla;
          if (sla && ['breached', 'at_risk', 'unknown_conflict'].includes(sla.acceptance_status)) {
            const breached = sla.acceptance_status === 'breached';
            add(source, o, 'enterprise.sla', breached && sla.acceptance_at ? 'P2' : breached && ['now', 'urgent'].includes(f.urgency) ? 'P0' : 'P1', sla.acceptance_status === 'unknown_conflict' ? 'Gagnants Enterprise contradictoires' : breached ? 'SLA d’acceptation dépassé' : 'SLA d’acceptation à risque',
              [`État calculé par enterprise_request_sla_facts_v1 : ${sla.acceptance_status}.`, `Échéance : ${known(sla.acceptance_due_at)}.`], 'La prise en charge Enterprise peut ne pas respecter l’engagement configuré.', 'Ouvrir la demande dans son contexte Enterprise / site.', {universes: ['ENTERPRISE', 'OPERATIONS', 'CLIENT'], authority: 'Enterprise · SLA canonique', unavailable_reason: 'Affectation réservée aux autorités Enterprise.'});
          }
          if (f.mode === 'internal_first' && numeric(f.valid_internal_offers) && f.valid_internal_offers > 0) add(source, o, 'enterprise.internal_capacity', 'P2', `${f.valid_internal_offers} offre(s) interne(s) encore valide(s)`, ['Le dispatch hybride canonique est configuré internal_first.', 'Il existe des offres internes non expirées ; aucune affectation n’est présumée.'], 'Une prise en charge interne pourrait éviter un recours marketplace.', 'Ouvrir le dossier et transmettre la revue à l’opérateur Enterprise habilité.', {universes: ['ENTERPRISE', 'ARTISAN', 'OPERATIONS'], authority: 'Enterprise · dispatch hybride', unavailable_reason: 'L’Admin global ne reçoit aucune délégation tenant supplémentaire.'});
          if (f.mode === 'internal_first' && ['internal_offered','no_internal_candidate'].includes(f.status) && time(f.fallback_due_at) !== null && time(f.fallback_due_at) <= now) add(source, o, 'enterprise.fallback', 'P1', 'Échéance de fallback hybride atteinte', [`État ${f.status} ; échéance ${f.fallback_due_at}.`], 'Le relais de prise en charge doit être vérifié.', 'Examiner les offres et le relais canonique Enterprise.', {universes: ['ENTERPRISE', 'OPERATIONS'], unavailable_reason: 'Aucun déclenchement automatique de fallback par RAFI.'});
          if(f.status === 'external_failed')add(source,o,'enterprise.dispatch_failed','P1','Échec du relais externe Enterprise',['Le dispatch hybride canonique rapporte external_failed.'],'La prise en charge externe peut rester bloquée.','Ouvrir le dossier et faire examiner le retry par l’opérateur Enterprise habilité.',{universes:['ENTERPRISE','OPERATIONS'],unavailable_reason:'Aucun retry Enterprise exécuté par l’Admin global.'});
          break;
        }
      }
    }
  }
  // One dominant operational decision for the same request; keep distinct network/finance work.
  decisions.sort((a, b) => a.priority.localeCompare(b.priority) || (b.age_minutes ?? -1) - (a.age_minutes ?? -1) || b.affected_count - a.affected_count || (a.decision_id < b.decision_id ? -1 : 1));
  const seen = new Set(), targets = new Set();
  const unique = decisions.filter(d => {
    const operational = ['request.waiting', 'enterprise.sla', 'enterprise.fallback'].includes(d.decision_type);
    if (seen.has(d.decision_id) || operational && targets.has(d.target_id)) return false;
    seen.add(d.decision_id); if (operational) targets.add(d.target_id); return true;
  });
  const partial = SOURCES.some(s => states[s]?.status !== 'FRESH');
  return {contract_version: VERSION, generated_at: new Date(now).toISOString(), classification,
    status: unavailable.length === SOURCES.length ? 'UNAVAILABLE' : partial ? 'PARTIAL' : 'FRESH',
    sources: Object.fromEntries(SOURCES.map(s => [s, {source: s, status: states[s]?.status || 'UNAVAILABLE', as_of: states[s]?.as_of || null, error: states[s]?.error || null, total_observations: states[s]?.data?.total_observations ?? null, returned_observations: states[s]?.data?.observations?.length ?? null}])),
    decisions: unique, top_decision: unique[0]?.decision_id || null,
    count_scope: 'decisions_in_observed_window', llm_required: false, authority_manifest: 'control-v1',
    limitations: ['Couverture déclarative ; éligibilité finale dans Dispatch.', 'SLA d’acceptation uniquement lorsqu’un snapshot canonique existe.', 'Les sources absentes ne contribuent pas aux décisions.'],
  };
}

module.exports = {VERSION, SOURCES, FRESH_MS, PRIORITIES, sourceState, build, decisionResult};
