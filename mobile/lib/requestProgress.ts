/** Only confirmed server state; no elapsed time, simulated dispatch or invented artisan. */
export function requestProgress(status: string, missionId?: string | null) {
  const rows = ['Demande reçue'];
  if (status === 'new') rows.push('Recherche en cours · aucun artisan affecté pour le moment');
  if (missionId && ['assigned', 'in_progress', 'completed', 'validated'].includes(status)) rows.push('Artisan affecté par FIXEO');
  if (status === 'in_progress') rows.push('Intervention en cours');
  if (status === 'completed') rows.push('Fin déclarée · votre validation est attendue');
  if (status === 'validated') rows.push('Intervention validée');
  if (status === 'cancelled') rows.push('Demande annulée');
  if (status === 'no_match') rows.push('Recherche terminée sans affectation');
  return rows;
}
