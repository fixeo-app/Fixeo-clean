# Controlled historical test-data maintenance

These templates preserve exact row images in the existing private authority audit before removing explicitly proven test fixtures. They do not alter schema, business rules, roles, RLS, policies or triggers. A consumed estimator ledger is retained and its deleted test-request link is cleared; canonical replay stays closed.

This directory contains **no Production identifiers, row images, classifications, inventories or execution evidence**. Keep those in the private operator checkpoint. The renderer never connects to a database and never runs SQL.

Required private inputs:

- A version-1 reviewed manifest containing the baseline commit, batch UUID, backup evidence and a closed list of table/ID/SHA256/reason/method entries, all independently established as category A.
- The exact private BEFORE export, including the consumed estimator ledger and its original request reference.

Run `node scripts/data-hygiene/render.cjs PRIVATE_MANIFEST PRIVATE_BEFORE_IMAGES PRIVATE_OUTPUT_DIRECTORY`. Output is created exclusively with private permissions; existing files are not overwritten. Do not commit or publish the rendered SQL or its inputs.

Before running rendered SQL, reconcile the actual code/deployment baseline, verify backup availability, investigate every dependency and rehearse cleanup plus rollback against the canonical PostgreSQL schema. The script requires an explicitly authorized privileged database maintenance actor.

Application uses one serializable transaction, short lock/statement timeouts, a batch advisory lock, exact row hashes, a scan of canonical JSON/text references and non-target table fingerprints. It records private before images and explicitly deletes leaf test fixtures. Unexpected dependencies, drift or a repeated batch fail the whole transaction.

Rollback reads only the private batch checkpoints, refuses occupied IDs or a changed ledger and verifies every restored hash. Canonical triggers stay enabled. No human Admin is impersonated; the privileged server context satisfies the existing classification guard. Rollback restores the previous pending outbox too, so it is reserved for an actual authorized rollback need.

This maintenance scope is deliberately bounded to requests, missions, queue/outbox rows and one consumed estimator ledger. Real or ambiguous records, artisan deduplication, account deletion, payments and Enterprise data are outside it. No automatic application, migration hook, CI deployment or Production replay is provided.
