'use strict';

// Pure preparation module. No runtime caller, DB writes, or catalogue activation.
// BP 3.3 chapters 14 and 38. All money is integer MAD centimes.
const VERSION = 'vap-bp33-v1';
const MAX_MINOR = 50000000; // Technical limit: total client <= 500,000 MAD.

function money(value, name, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0) || value > MAX_MINOR) {
    throw new RangeError(name + ' must be integer MAD centimes within bounds');
  }
  return BigInt(value);
}

function commissionMinor(vapMinor) {
  let remaining = money(vapMinor, 'vapMinor', true);
  let weighted = 0n;
  // Widths in centimes, rates in percent. Round only after summing all bands.
  for (const [width, rate] of [[200000n, 15n], [300000n, 10n], [500000n, 7n]]) {
    const part = remaining < width ? remaining : width;
    weighted += part * rate;
    remaining -= part;
  }
  weighted += remaining * 5n;
  const rounded = (weighted + 50n) / 100n; // Half-up, one centime precision.
  return Number(rounded < 6000n ? 6000n : rounded > 150000n ? 150000n : rounded);
}

function buildBreakdown(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('input required');
  const allowed = new Set(['pricingVersion', 'vapMinor', 'materialsMinor']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new TypeError('Unsupported field: ' + key);
  }
  if (input.pricingVersion !== VERSION) throw new RangeError('Explicit supported pricingVersion required');
  money(input.vapMinor, 'vapMinor', true);
  money(input.materialsMinor, 'materialsMinor'); // Explicit, never silently assume zero.
  const fee = commissionMinor(input.vapMinor);
  const total = input.vapMinor + fee + input.materialsMinor;
  money(total, 'clientTotalMinor', true);
  return Object.freeze({
    pricingVersion: VERSION,
    currency: 'MAD',
    vapMinor: input.vapMinor,
    commissionMinor: fee,
    materialsMinor: input.materialsMinor,
    clientTotalMinor: total,
    // Cash retained after remitting FIXEO, including material reimbursement.
    // Neither this amount nor VAP represents profit after artisan costs.
    artisanRetentionMinor: input.vapMinor + input.materialsMinor
  });
}

module.exports = { VERSION, MAX_MINOR, commissionMinor, buildBreakdown };
