/** Exact decimal arithmetic for non-negative MAD values. Mirrors numeric round(..., 2). */
function ratio(value: number): [bigint, bigint] {
  if (!Number.isFinite(value) || value < 0) throw new Error('QUOTE_AMOUNT_INVALID');
  const [mantissa, exponentText = '0'] = String(value).toLowerCase().split('e');
  const fraction = (mantissa.split('.')[1] || '').length;
  const scale = fraction - Number(exponentText);
  const digits = BigInt(mantissa.replace('.', ''));
  return scale >= 0 ? [digits, 10n ** BigInt(scale)] : [digits * 10n ** BigInt(-scale), 1n];
}
const rounded = (n: bigint, d: bigint) => Number((2n * n + d) / (2n * d));
export function moneyMinor(value: number) { const [n, d] = ratio(value); return rounded(n * 100n, d); }
export function lineTotalMinor(quantity: number, price: number) {
  const [q, qd] = ratio(quantity), [p, pd] = ratio(price);
  return rounded(q * p * 100n, qd * pd);
}
// Standard unpriced marketplace quote. Priced offers/settled missions use their persisted breakdown instead.
export const STANDARD_MARKETPLACE_COMMISSION_BPS = 1500;
export function quoteEconomics(total: number, source: string, persistedCommission?: number | null) {
  const clientMinor = moneyMinor(total);
  if (source !== 'fixeo') return { total: clientMinor / 100, commission: null, net: null };
  const commissionMinor = persistedCommission == null
    ? rounded(BigInt(clientMinor) * BigInt(STANDARD_MARKETPLACE_COMMISSION_BPS), 10000n) : moneyMinor(persistedCommission);
  if (commissionMinor > clientMinor) throw new Error('QUOTE_AMOUNT_INVALID');
  return { total: clientMinor / 100, commission: commissionMinor / 100, net: (clientMinor - commissionMinor) / 100 };
}
