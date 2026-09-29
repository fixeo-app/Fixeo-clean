# Bloc 6 rollback

Baseline app commit: `8a83d1209fb3e9f67d9f6f8b3ac1eca9c6297100`, tree `ca0a2973c3c138fc8eb816ee2eaf5f49903bf376` (B5). Last certified baseline Vercel deployment: `dpl_CTmkrbWEQgiZGo9iHwvco2BFRS7U`.

No business table, mutation authority, policy, table ACL or stored data changes in this migration. The five new public read RPCs and four sealed private projection helpers are additive. Existing RAFI source RPCs remain installed and unchanged. P0 `admin_settle_mission_v1` and B5 Finance guards are not replaced.

If an actual rollback becomes necessary, stop cutover/verification and report the reason. Restore the exact B5 app tree using the canonical repository/Vercel workflow, verify READY/SHA/assets, then execute `rollback.sql` as a tracked rollback migration if removing B6 readers is necessary. Application rollback must precede dropping RPCs, because B6 calls them. Do not delete migration ledger history. No restoration of business data or deleted requests is involved.

The isolated rollback test compares every pre-existing public/private function body, ACL/config/owner, relation ACL/RLS, policy and seeded business/audit rows before migration, after migration, after rollback and after reapplication. P0 and B5 Finance remain intact. Production rollback has not been executed.
