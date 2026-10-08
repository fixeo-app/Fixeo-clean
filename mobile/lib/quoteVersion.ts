import type { BusinessQuote } from './artisanOS';
/** Compare only the persisted editable contract, never owner/status/number authority. */
export function sameQuoteContent(row: BusinessQuote, input: Partial<BusinessQuote>) {
  const text = (v: unknown) => String(v ?? '').trim();
  return ['title','client_id','notes','validity_date','estimated_duration'].every(key => text(row[key as keyof BusinessQuote]) === text(input[key as keyof BusinessQuote]))
    && Number(row.discount) === Number(input.discount)
    && JSON.stringify(row.items.map(l => [l.type,text(l.label),Number(l.quantity),Number(l.unit_price)])) === JSON.stringify(input.items?.map(l => [l.type,text(l.label),Number(l.quantity),Number(l.unit_price)]));
}
