/** W4 presentation only. The existing services remain the authority for every state. */
import type { ClientNotification, ClientRequestHistory } from './clientWorkspace';
import type { RafiPresenceState } from '../ui/rafiPresence';

const ATTENTION_ORDER: Readonly<Record<string, number>> = { completed: 0, in_progress: 1, assigned: 2, new: 3 };
export function clientAttentionRequest(items: readonly ClientRequestHistory[]) {
  // Preserve chronological order within a priority, without mutating the service result.
  return items.reduce<ClientRequestHistory | null>((best, item) => {
    const rank = ATTENTION_ORDER[item.status];
    if (rank === undefined) return best;
    return !best || rank < ATTENTION_ORDER[best.status] ? item : best;
  }, null);
}

export const CLIENT_STATUS: Readonly<Record<string, string>> = {
  new: 'Recherche en cours', assigned: 'Artisan trouvé', in_progress: 'En intervention',
  completed: 'À valider', validated: 'Terminée', cancelled: 'Annulée', no_match: 'À reprendre',
};

export function clientHomeCopy(journey: string, presence: RafiPresenceState, creating: boolean) {
  if (creating) return { eyebrow: 'VOTRE DEMANDE', title: 'On prépare la suite.', detail: 'FIXEO enregistre votre demande. Un instant.' };
  if (presence === 'listening') return { eyebrow: 'RAFI VOUS ÉCOUTE', title: 'Dites-moi tout.', detail: 'Décrivez ce qui se passe, avec vos mots.' };
  if (presence === 'understanding' || presence === 'thinking') return { eyebrow: 'RAFI COMPREND', title: 'Je regarde avec vous.', detail: 'Vous pourrez vérifier et confirmer avant de continuer.' };
  if (journey === 'completed') return { eyebrow: 'À VOUS DE CONFIRMER', title: 'Une dernière\nvérification.', detail: 'Vérifiez l’intervention et les photos avant de valider.' };
  if (journey === 'in_progress') return { eyebrow: 'EN CE MOMENT', title: 'Votre intervention\navance.', detail: 'Retrouvez les étapes et les photos dans votre suivi.' };
  if (journey === 'assigned') return { eyebrow: 'ARTISAN TROUVÉ', title: 'Vous êtes\naccompagné.', detail: 'Votre artisan et la prochaine étape, au même endroit.' };
  if (journey === 'matching') return { eyebrow: 'RECHERCHE EN COURS', title: 'FIXEO cherche\npour vous.', detail: 'Votre recherche continue. Un autre besoin peut avancer en parallèle.' };
  return { eyebrow: 'RAFI · VOTRE ASSISTANT', title: 'Un problème ?\nOn s’en occupe.', detail: 'Parlez, montrez ou écrivez.\nVous gardez le contrôle.' };
}

export function clientHeroSize(width: number, height: number, compact = false) {
  return compact ? 88 : width <= 340 || height <= 640 ? 120 : 160;
}

export function clientMissionPresentation(status: string | undefined) {
  const copy: Record<string, { eyebrow: string; title: string; detail: string; orb: RafiPresenceState }> = {
    new: { eyebrow: 'RECHERCHE EN COURS', title: 'FIXEO cherche pour vous.', detail: 'Votre demande est active. L’artisan apparaîtra ici après son affectation.', orb: 'matching' },
    assigned: { eyebrow: 'ARTISAN TROUVÉ', title: 'La suite se prépare.', detail: 'Suivez l’arrivée de votre artisan, puis le début de l’intervention.', orb: 'success' },
    in_progress: { eyebrow: 'EN CE MOMENT', title: 'Votre intervention avance.', detail: 'L’artisan intervient. Les étapes et les photos restent accessibles ici.', orb: 'intervention' },
    completed: { eyebrow: 'À VOUS DE CONFIRMER', title: 'Vérifiez, puis validez.', detail: 'Confirmez uniquement si la fin de l’intervention est conforme.', orb: 'attention' },
    validated: { eyebrow: 'MISSION VALIDÉE', title: 'Tout est terminé.', detail: 'Votre validation est enregistrée. Retrouvez le suivi ci-dessous.', orb: 'success' },
    cancelled: { eyebrow: 'DEMANDE ANNULÉE', title: 'Cette demande est close.', detail: 'Aucune validation n’est attendue pour cette demande.', orb: 'idle' },
    no_match: { eyebrow: 'RECHERCHE TERMINÉE', title: 'Aucun artisan affecté.', detail: 'Retrouvez votre demande depuis votre espace FIXEO.', orb: 'attention' },
  };
  return copy[status || ''] || { eyebrow: 'VOTRE INTERVENTION', title: status ? 'Suivi à actualiser.' : 'Ouverture du suivi.', detail: 'Les informations confirmées par FIXEO apparaîtront ici.', orb: 'working' as const };
}

export function clientMissionSteps(status: string | undefined, arrivalRecorded: boolean) {
  const rank = ['new', 'assigned', 'in_progress', 'completed', 'validated'].indexOf(status || '');
  if (rank < 0) return [];
  const arrived = arrivalRecorded || rank >= 2;
  const steps = [
    { label: 'Artisan trouvé', done: rank >= 1 },
    { label: 'Artisan arrivé', done: arrived },
    { label: 'Intervention en cours', done: rank >= 2 },
    { label: 'Intervention terminée', done: rank >= 3 },
    { label: 'Mission validée', done: rank >= 4 },
  ];
  const current = status === 'new' ? -1 : status === 'assigned' ? (arrived ? 1 : 0) : rank;
  return steps.map((step, index) => ({ ...step, phase: index < current ? 'past' as const : index === current ? 'now' as const : 'next' as const }));
}

const ACTION_EVENTS = new Set(['c_mission_completed', 'c_mission_change_presented']);
export function clientNotificationSections(items: readonly ClientNotification[]) {
  const terminal = new Map<string, string>();
  for (const item of items) {
    if (item.type === 'c_mission_validated' && item.related_entity_id) {
      const previous = terminal.get(item.related_entity_id);
      if (!previous || previous < item.created_at) terminal.set(item.related_entity_id, item.created_at);
    }
  }
  const groups: { title: string; data: ClientNotification[] }[] = [
    { title: 'À vérifier', data: [] }, { title: 'Informations', data: [] }, { title: 'Déjà vues', data: [] },
  ];
  for (const item of items) {
    const superseded = item.type === 'c_mission_completed' && !!item.related_entity_id
      && (terminal.get(item.related_entity_id) || '') > item.created_at;
    groups[item.read ? 2 : ACTION_EVENTS.has(item.type) && !superseded ? 0 : 1].data.push(item);
  }
  return groups.filter(group => group.data.length > 0);
}
