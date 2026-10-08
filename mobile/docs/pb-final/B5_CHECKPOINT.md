# B5 — Quote version, durable draft and PDF contract

2026-10-08. PASS SOFTWARE: TypeScript, lint, 198 Mobile tests. Evidence b5-*; no native PDF claimed.

Devis Studio preserves three stages and expands only one line; other lines remain readable summaries. Existing searchable owner-scoped client catalogue is reused. Exact MAD/discount validation retained; test 1×250=250 and 50×250=12,500.

Draft hydration occurs once per owner/document. Refresh no longer replaces the editor. A saved draft against an older server baseline is restored as a conflict instead of discarded. Copy status is acknowledged only after AsyncStorage succeeds. Disk-full failure appears inline and preserves memory. Invalid stored data blocks restoration/overwrite. Session-generation changes reject pending writes; owner/scope isolation and explicit-logout purge preserved. Reentering the editor after server save correctly resumes local autosave (found and fixed by disk-full test).

Update is conditional on id + owner + source personal + status draft + expected updated_at in one PostgREST UPDATE. Missing version is rejected. Changed version cannot overwrite; exact read-only payload reconciliation handles an earlier committed identical retry. Newly created stable-ID reconciliation rejects different content. UI displays conflict, supports server document comparison, explicit reapplication onto newly read version, or explicit replacement by server. It never silently merges. Atomic predicate and cross-owner tests pass.

STAGING schema read-only observation: quote RLS enabled; original link-integrity trigger present. No updated_at trigger exists; inspected current Mobile/Web writers set updated_at, and this update advances it above expected time. No migration required, no grants/policies changed. The original PB1.1 link migration remains byte-identical. Proof b5-staging-quote-schema.json.

PDF pipeline remains native expo-print + expo-sharing: A4 595×842, byte/header checks, accents, 50 rows, repeated table header, split protection and unchanged business status on sharing dismissal tested with controlled native adapters. Real 250 MAD/50-line Android PDFs, page breaks and native sharing are PHYSICALLY-DEFERRED R20. No WeasyPrint file substituted as native proof.

No live fixture mutation or dispatch/send. Rollback: revert named B5 source commit; no DB rollback required. B6 adds navigation/dirty and pending-action resilience.
