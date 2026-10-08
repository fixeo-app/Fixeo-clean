import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { quoteDocumentHtml, type QuoteDocument } from '../lib/quoteDocument';
import { calculateQuote } from '../lib/artisanExperience';
const directory = process.argv[2];
if (!directory) throw new Error('Output directory required');
mkdirSync(directory, { recursive: true });
const sample: QuoteDocument = {
  number: 'DEV-2026-0002', status: 'Brouillon', title: 'Devis test PB1 - Plomberie', updatedAt: '2026-10-08T14:00:00Z',
  issuer: { name: 'PB1 Artisan Test', city: 'Fès' }, client: { full_name: 'PB1 Client Test', city: 'Fès' },
  ...calculateQuote([{ type: 'service', label: 'Réparation chasse d’eau qui coule en continu', quantity: 1, unit_price: 250 }]),
  validity: '2026-10-22', notes: 'Prix annoncé avant intervention.',
};
const long: QuoteDocument = { ...sample, number: 'EXEMPLE-MULTIPAGE', title: 'Contrôle de pagination · données synthétiques',
  ...calculateQuote(Array.from({ length: 50 }, (_, i) => ({ type: 'service' as const, label: `Ligne ${i + 1} · Électricité, plomberie et réfection à Fès. ` + 'Désignation détaillée pour vérifier les retours à la ligne. '.repeat(5), quantity: 1, unit_price: 250 })), 50),
  notes: 'Notes synthétiques. Aucun envoi.\n' + 'Équipement à confirmer sur place. '.repeat(100),
};
for (const [name, value] of Object.entries({ 'devis-250-mad': sample, 'devis-multipage': long })) {
  writeFileSync(path.join(directory, name + '.html'), quoteDocumentHtml(value));
}
