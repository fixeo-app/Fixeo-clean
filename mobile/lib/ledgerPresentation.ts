type Ledger = { entry_type: string; source: string; category?: string | null; note?: string | null; job_id?: string | null };
const categories: Record<string, string> = { other: 'Autre', materials: 'Fournitures', supplies: 'Fournitures',
  transport: 'Transport', equipment: 'Équipement', labor: 'Main-d’œuvre', labour: 'Main-d’œuvre' };
export function ledgerTypeLabel(row: Ledger) {
  if (row.entry_type === 'income') return row.source === 'fixeo' ? 'Encaissement FIXEO' : 'Encaissement personnel';
  if (row.entry_type === 'expense') return row.source === 'fixeo' ? 'Dépense FIXEO' : 'Dépense personnelle';
  return 'Mouvement';
}
export function ledgerDetailLabel(row: Ledger) {
  return row.note?.trim() || (row.category && row.category !== 'other' ? categories[row.category] || 'Autre' : '') || ledgerTypeLabel(row);
}
export function ledgerJobLabel(row: Ledger, jobs: readonly { id: string; title: string }[]) {
  return row.job_id ? jobs.find(job => job.id === row.job_id)?.title || 'Intervention liée' : null;
}
