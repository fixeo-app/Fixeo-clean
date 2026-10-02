export type TerrainGuidance = {
  title: string;
  checks: string[];
};

export function getTerrainGuidance(serviceCategory?: string | null): TerrainGuidance {
  const service = String(serviceCategory || '').toLowerCase();

  if (service.includes('plomb')) {
    return {
      title: 'RAFI · Avant d’agir',
      checks: [
        'Confirmez avec le client la zone exacte du problème.',
        'Photographiez l’état initial avant toute intervention.',
        'Si le périmètre ou le prix change, faites valider l’ajustement avant de poursuivre.',
      ],
    };
  }

  if (service.includes('élect') || service.includes('elect')) {
    return {
      title: 'RAFI · Sécurité terrain',
      checks: [
        'Confirmez la zone concernée et sécurisez votre intervention.',
        'Photographiez l’état initial avant toute modification.',
        'Tout changement de périmètre ou de prix passe par une validation FIXEO.',
      ],
    };
  }

  return {
    title: 'RAFI · Check terrain',
    checks: [
      'Confirmez le problème avec le client.',
      'Gardez une preuve de l’état initial.',
      'Faites valider tout changement de périmètre ou de prix avant de poursuivre.',
    ],
  };
}
