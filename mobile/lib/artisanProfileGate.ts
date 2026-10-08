export const profileFieldLabels: Record<string, string> = {
  full_name: 'Nom professionnel', service_category: 'Métier(s)', city: 'Ville / zone',
  approval: 'Approbation du profil par FIXEO', owner: 'Rattachement du profil à votre compte',
};
export function profileMissingMessage(fields?: string[]) {
  const labels = (fields || []).map(field => profileFieldLabels[field]).filter(Boolean);
  return labels.length ? `Profil à compléter : ${labels.join(', ')}.` : 'Actualisez votre profil pour vérifier les éléments à compléter.';
}
