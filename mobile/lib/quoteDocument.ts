import type { QuoteLine } from './artisanExperience';
import { money } from './artisanExperience';
import { formatWorkspaceDate } from './workspacePresentation';

export type QuoteDocument = {
  number: string; status: string; title: string; updatedAt?: string;
  issuer: { name?: string; city?: string; phone?: string };
  client?: { full_name: string; phone?: string | null; address?: string | null; city?: string | null };
  items: QuoteLine[]; subtotal: number; discount: number; total: number;
  validity?: string; duration?: string; notes?: string;
};
export const QUOTE_PROVENANCE = 'Devis personnel émis par l’artisan. FIXEO fournit l’outil de préparation ; FIXEO n’est pas le prestataire de cette intervention.';
export const QUOTE_FISCAL = 'TVA non calculée sans statut fiscal renseigné.';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Offline, self-contained document. No external URLs or private CRM notes. */
export function quoteDocumentHtml(q: QuoteDocument) {
  const e = escape, m = (n: number) => e(money(n));
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${e(q.number)}</title><style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; } body { color: #171715; font: 11px/1.55 Arial, sans-serif; margin: 0; }
    .brand { color: #716653; font-size: 10px; letter-spacing: 3px; font-weight: bold; }
    h1 { font-size: 32px; font-weight: normal; letter-spacing: -1px; margin: 12px 0 4px; }
    h2 { font-size: 18px; line-height: 1.4; margin: 24px 0 14px; overflow-wrap: anywhere; }
    .meta { color: #66635d; } .rule { border-top: 1px solid #c6b18a; margin: 18px 0; }
    .identities { display: table; width: 100%; } .identity { display: table-cell; width: 50%; padding-right: 18px; vertical-align: top; overflow-wrap: anywhere; }
    .label { color: #716653; font-size: 9px; letter-spacing: 1.5px; margin-bottom: 6px; }
    .name { font-weight: bold; font-size: 14px; } table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; } th { text-align: left; color: #716653; background: #f5f2ec; font-size: 9px; padding: 10px 6px; }
    td { padding: 12px 6px; vertical-align: top; border-bottom: 1px solid #e7e2d9; overflow-wrap: anywhere; }
    tr { break-inside: avoid; page-break-inside: avoid; } .numeric { text-align: right; } .kind { font-size: 9px; color: #79766f; }
    .totals { margin: 18px 0 24px auto; width: 55%; break-inside: avoid; } .sum { padding: 5px 0; display: table; width: 100%; }
    .sum span { display: table-cell; } .sum span:last-child { text-align: right; }
    .total { background: #191916; color: #fffdf8; padding: 12px; font-size: 18px; margin-top: 8px; }
    .conditions { white-space: pre-wrap; overflow-wrap: anywhere; } footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ded7cb; color: #716e67; font-size: 9px; }
  </style></head><body><div class="brand">FIXEO · DEVIS STUDIO</div><h1>Devis</h1>
  <div class="meta">${e(q.number)} · ${e(q.status)}${q.updatedAt ? ` · Mis à jour le ${e(formatWorkspaceDate(q.updatedAt))}` : ''}</div>
  <div class="rule"></div><div class="identities"><div class="identity"><div class="label">ÉMETTEUR</div><div class="name">${e(q.issuer.name || 'Artisan — identité à compléter')}</div>${[q.issuer.city, q.issuer.phone].filter(Boolean).map(e).join('<br>')}</div>
  <div class="identity"><div class="label">DESTINATAIRE</div><div class="name">${e(q.client?.full_name || 'Client à renseigner')}</div>${[q.client?.address, q.client?.city, q.client?.phone].filter(Boolean).map(e).join('<br>')}</div></div>
  <h2>${e(q.title)}</h2><table><thead><tr><th style="width:52%">DÉSIGNATION</th><th class="numeric" style="width:10%">QTÉ</th><th class="numeric" style="width:19%">PRIX UNITAIRE</th><th class="numeric" style="width:19%">MONTANT</th></tr></thead><tbody>
  ${q.items.map(line => `<tr><td>${e(line.label)}<div class="kind">${line.type === 'labor' ? 'Main-d’œuvre' : line.type === 'supply' ? 'Fourniture' : 'Prestation'}</div></td><td class="numeric">${e(line.quantity)}</td><td class="numeric">${m(line.unit_price)}</td><td class="numeric">${m(line.total)}</td></tr>`).join('')}
  </tbody></table><div class="totals"><div class="sum"><span>Sous-total</span><span>${m(q.subtotal)}</span></div>${q.discount > 0 ? `<div class="sum"><span>Remise</span><span>− ${m(q.discount)}</span></div>` : ''}<div class="sum total"><span>Total</span><span>${m(q.total)}</span></div></div>
  ${q.validity ? `<p>Valable jusqu’au ${e(formatWorkspaceDate(q.validity))}</p>` : ''}${q.duration ? `<p>Durée prévue : ${e(q.duration)}</p>` : ''}
  ${q.notes ? `<div class="label">NOTES ET CONDITIONS</div><div class="conditions">${e(q.notes)}</div>` : ''}
  <footer>${QUOTE_FISCAL}<br>${QUOTE_PROVENANCE}<br>Le statut du devis décrit l’information enregistrée par l’artisan. Le partage de ce document ne confirme ni envoi, ni accord, ni paiement.</footer></body></html>`;
}
