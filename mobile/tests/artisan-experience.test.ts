import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateQuote,
  ledgerTotals,
  agendaConflicts,
  localDay,
  money,
  artisanError,
} from "../lib/artisanExperience";

test("W5 personal quote arithmetic preserves explicit prices, rounding and discount", () => {
  const result = calculateQuote(
    [
      { type: "labor", label: " Pose ", quantity: 1.5, unit_price: 125 },
      { type: "supply", label: "Joint", quantity: 3, unit_price: 12.35 },
    ],
    10,
  );
  assert.equal(result.subtotal, 224.55);
  assert.equal(result.total, 214.55);
  assert.equal(result.items[0].label, "Pose");
  assert.equal(result.items[0].type, "labor");
});
test("W5 incomplete or non-finite quote inputs cannot produce a valid amount", () => {
  const line = {
    type: "service" as const,
    label: "Pose",
    quantity: 1,
    unit_price: 100,
  };
  for (const bad of [
    { label: "" },
    { quantity: 0 },
    { quantity: NaN },
    { unit_price: -1 },
    { unit_price: Infinity },
  ]) {
    assert.throws(() => calculateQuote([{ ...line, ...bad }]));
  }
  assert.throws(() => calculateQuote([]));
  assert.throws(() => calculateQuote(Array(51).fill(line)));
  assert.throws(() => calculateQuote([line], 101));
  assert.throws(() => calculateQuote([line], NaN));
});
test("W5 ledger states income and expense separately and never substitutes missing money", () => {
  const rows = [
    { entry_type: "income", amount: 400, occurred_on: "2026-10-05" },
    { entry_type: "expense", amount: 50, occurred_on: "2026-10-05" },
    { entry_type: "income", amount: 800, occurred_on: "2026-10-04" },
  ];
  assert.deepEqual(ledgerTotals(rows, "2026-10-05"), {
    income: 400,
    expense: 50,
  });
  assert.equal(money(null), "Non renseigné");
  assert.equal(money(NaN), "Non renseigné");
  assert.notEqual(money(0), "Non renseigné");
});
test("W5 agenda only flags coincident active starts, without inferring duration", () => {
  const starts = agendaConflicts([
    { scheduled_at: "2026-10-05T10:00:00Z", status: "planned" },
    { scheduled_at: "2026-10-05T11:00:00+01:00", status: "planned" },
    { scheduled_at: "2026-10-05T11:00:00Z", status: "planned" },
    { scheduled_at: "2026-10-05T11:00:00Z", status: "cancelled" },
    { scheduled_at: null, status: "planned" },
  ]);
  assert.deepEqual([...starts], ["2026-10-05T10:00:00.000Z"]);
  assert.equal(localDay("2026-10-04T23:30:00Z"), "2026-10-05");
  assert.equal(localDay("invalid"), "");
});
test("W5 auth and ownership failures are actionable without exposing server internals", () => {
  assert.match(artisanError({ message: "SESSION_REVOKED" }), /Reconnectez/);
  assert.match(artisanError({ message: "ARTISAN_REQUIRED" }), /réservé/);
  assert.doesNotMatch(
    artisanError({ message: "secret trace eyJabc" }),
    /secret|trace|eyJ/,
  );
});
test("W5 Bio separates size rejection from a write whose readback is unconfirmed", () => {
  assert.match(artisanError({ message: "BIO_TOO_LONG" }), /4 000/);
  assert.match(
    artisanError({ message: "BIO_CONFIRMATION_PENDING" }),
    /pas pu être confirmé/,
  );
  assert.doesNotMatch(
    artisanError({ message: "BIO_CONFIRMATION_PENDING" }),
    /enregistrée|réussie/,
  );
});
