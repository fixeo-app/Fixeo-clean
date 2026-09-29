# Bloc 5 — rollback

Initial application baseline: `d907d2e237a6a2c1288e903ba15e42925d0c5030` (B3+B4+P0).

Before cutover retain the exact Git tree, function definitions/ACLs, migration hashes and private 26-table fingerprints. Backup evidence inherited: Supabase Production PHYSICAL 2026-09-29 00:11:57 UTC, Restore available (user-provided manual evidence). No restore is initiated.

1. If a critical condition requires Production rollback: stop further cutover operations and report the exact failure.
2. Revert the Bloc 5 application merge through the canonical PR/Git workflow, or roll Vercel back to the observed baseline deployment. Check READY, aliases, SHA/tree and HTTP. The additive read functions are safe to retain.
3. Only if withdrawal of reads is necessary after the old application is served, apply `rollback.sql`: it drops exactly the twelve additive read functions, without CASCADE, table change or business mutation. Retain the migration/audit history; any later reintroduction requires a new reviewed migration.
4. **Retain both integrity guards.** Do not restore older `admin_commission_remittance_v1` or `control_action_preview_v1` bodies: that would reintroduce orphan financial mutation. The tightened signatures are backwards compatible. Never alter `admin_settle_mission_v1` or its P0 preview branch.
5. No restoration of deleted requests, no alteration of the 19 orphan missions, no reversal of legitimate operator business actions, no deletion of audit or remittance history.

The isolated rollback test compares all prior RLS/policies/table ACLs and both guard definitions after withdrawing the reads, checks business rows, then proves additive readers can be installed again. Production rollback has not been executed.
