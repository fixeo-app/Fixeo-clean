export type ContextualCockpitTone = 'light' | 'dark' | 'muted';

export type ContextualCockpitAction =
  | 'client_follow'
  | 'client_rafi'
  | 'client_alerts'
  | 'artisan_mission'
  | 'artisan_workspace'
  | 'artisan_agenda'
  | 'none';

export type ContextualCockpitModel = {
  eyebrow: string;
  title: string;
  detail: string;
  status: string;
  tone: ContextualCockpitTone;
  action: ContextualCockpitAction;
  actionLabel?: string;
  context?: string;
};

export function getClientContextualCockpit(input: {
  activeStatus?: string | null;
  unreadCount: number;
  subject?: string | null;
  city?: string | null;
}): ContextualCockpitModel {
  const status = String(input.activeStatus || '');
  const context = [input.subject, input.city].filter(Boolean).join(' · ') || undefined;

  if (status === 'completed') {
    return {
      eyebrow: 'À FAIRE MAINTENANT',
      title: 'Une intervention attend votre validation.',
      detail: 'Vérifiez la fin de mission et confirmez uniquement si tout est conforme.',
      status: 'Validation requise',
      tone: 'dark',
      action: 'client_follow',
      actionLabel: 'Vérifier l’intervention',
      context,
    };
  }

  if (status === 'in_progress') {
    return {
      eyebrow: 'EN CE MOMENT',
      title: 'Votre intervention est en cours.',
      detail: 'FIXEO suit les étapes pendant que l’artisan intervient. Vous pouvez reprendre le suivi à tout moment.',
      status: 'Intervention active',
      tone: 'dark',
      action: 'client_follow',
      actionLabel: 'Suivre l’intervention',
      context,
    };
  }

  if (status === 'assigned') {
    return {
      eyebrow: 'PROCHAINE ÉTAPE',
      title: 'Votre artisan est affecté.',
      detail: 'La recherche est terminée. FIXEO vous accompagne maintenant jusqu’à la clôture.',
      status: 'Artisan trouvé',
      tone: 'light',
      action: 'client_follow',
      actionLabel: 'Voir le suivi',
      context,
    };
  }

  if (status === 'new') {
    return {
      eyebrow: 'FIXEO TRAVAILLE POUR VOUS',
      title: 'La recherche est en cours.',
      detail: 'Vous n’avez rien à relancer. FIXEO garde la demande active et vous prévient dès qu’un artisan est affecté.',
      status: 'Recherche active',
      tone: 'light',
      action: 'client_follow',
      actionLabel: 'Reprendre le suivi',
      context,
    };
  }

  if (input.unreadCount > 0) {
    return {
      eyebrow: 'À VOIR',
      title: `${input.unreadCount} alerte${input.unreadCount > 1 ? 's' : ''} à lire.`,
      detail: 'RAFI vous remonte uniquement ce qui a changé ou mérite votre attention.',
      status: 'Nouveaux événements',
      tone: 'muted',
      action: 'client_alerts',
      actionLabel: 'Voir les alertes',
    };
  }

  return {
    eyebrow: 'RAFI EST PRÊT',
    title: 'Rien d’urgent pour le moment.',
    detail: 'Dès qu’un problème apparaît, parlez, montrez ou écrivez. FIXEO prend le relais.',
    status: 'Tout est calme',
    tone: 'light',
    action: 'client_rafi',
    actionLabel: 'Parler à RAFI',
  };
}

export function getArtisanContextualCockpit(input: {
  missionStatus?: string | null;
  offersCount: number;
  availability?: string | null;
  jobsCount: number;
  quotesCount: number;
  missionSubject?: string | null;
  missionCity?: string | null;
}): ContextualCockpitModel {
  const missionStatus = String(input.missionStatus || '');
  const availability = String(input.availability || '');
  const missionContext = [input.missionSubject, input.missionCity].filter(Boolean).join(' · ') || undefined;

  if (missionStatus === 'in_progress') {
    return {
      eyebrow: 'FOCUS MAINTENANT',
      title: 'Une intervention est en cours.',
      detail: 'Gardez la mission au premier plan. RAFI conserve le contexte et FIXEO suit chaque étape.',
      status: 'Mission active',
      tone: 'dark',
      action: 'artisan_mission',
      actionLabel: 'Reprendre la mission',
      context: missionContext,
    };
  }

  if (missionStatus === 'completed') {
    return {
      eyebrow: 'EN ATTENTE CLIENT',
      title: 'Votre intervention est terminée.',
      detail: 'Les preuves sont déposées. FIXEO attend maintenant la confirmation finale du client.',
      status: 'Validation client',
      tone: 'dark',
      action: 'artisan_mission',
      actionLabel: 'Voir la mission',
      context: missionContext,
    };
  }

  if (missionStatus) {
    return {
      eyebrow: 'PROCHAINE ACTION',
      title: 'Une mission vous attend.',
      detail: 'Ouvrez-la avant toute autre action pour suivre le parcours FIXEO dans le bon ordre.',
      status: 'Mission affectée',
      tone: 'dark',
      action: 'artisan_mission',
      actionLabel: 'Ouvrir la mission',
      context: missionContext,
    };
  }

  if (input.offersCount > 0) {
    return {
      eyebrow: 'OPPORTUNITÉS MAINTENANT',
      title: `${input.offersCount} mission${input.offersCount > 1 ? 's' : ''} disponible${input.offersCount > 1 ? 's' : ''}.`,
      detail: 'Les opportunités correspondant à votre profil sont remontées juste en dessous. Le premier artisan éligible qui accepte gagne.',
      status: 'À décider',
      tone: 'light',
      action: 'none',
    };
  }

  if (availability === 'unavailable') {
    return {
      eyebrow: 'VISIBILITÉ MISE EN PAUSE',
      title: 'Vous êtes indisponible.',
      detail: 'FIXEO ne vous pousse pas de nouvelles opportunités tant que vous ne réactivez pas votre disponibilité.',
      status: 'Indisponible',
      tone: 'muted',
      action: 'artisan_workspace',
      actionLabel: 'Gérer ma disponibilité',
    };
  }

  if (availability === 'busy') {
    return {
      eyebrow: 'MODE OCCUPÉ',
      title: 'Votre cockpit reste en veille.',
      detail: 'Votre activité personnelle continue dans Artisan OS pendant que FIXEO limite les nouvelles opportunités.',
      status: 'Occupé',
      tone: 'muted',
      action: input.jobsCount > 0 ? 'artisan_agenda' : 'artisan_workspace',
      actionLabel: input.jobsCount > 0 ? 'Voir mon agenda' : 'Ouvrir Artisan OS',
    };
  }

  if (input.jobsCount > 0) {
    return {
      eyebrow: 'PROCHAINE PRIORITÉ',
      title: `${input.jobsCount} intervention${input.jobsCount > 1 ? 's' : ''} dans votre agenda.`,
      detail: 'Aucune mission FIXEO n’est active. Profitez de ce moment pour préparer vos interventions personnelles.',
      status: 'Agenda à suivre',
      tone: 'light',
      action: 'artisan_agenda',
      actionLabel: 'Ouvrir mon agenda',
    };
  }

  if (input.quotesCount > 0) {
    return {
      eyebrow: 'ACTIVITÉ PERSONNELLE',
      title: `${input.quotesCount} devis dans votre espace.`,
      detail: 'Aucune mission FIXEO ne demande votre attention maintenant. Votre activité personnelle reste accessible dans Artisan OS.',
      status: 'Cockpit calme',
      tone: 'light',
      action: 'artisan_workspace',
      actionLabel: 'Ouvrir Artisan OS',
    };
  }

  return {
    eyebrow: 'COCKPIT CALME',
    title: 'Rien à traiter maintenant.',
    detail: 'Restez disponible. FIXEO vous remettra immédiatement en mouvement dès qu’une mission correspond à votre profil.',
    status: availability === 'available' ? 'Disponible' : 'Prêt à configurer',
    tone: 'light',
    action: 'artisan_workspace',
    actionLabel: 'Ouvrir Artisan OS',
  };
}
