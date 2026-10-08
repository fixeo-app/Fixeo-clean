# B0 — Recovery and authority — 2026-10-08

Status: PASS SOFTWARE PREFLIGHT. This is not a physical certification.

- Governing mandate: FIXEO MOBILE FINAL B0–B8, uploaded on 2026-10-08. Audit PB1.1 (50 pages) read; original proof package recovered and left intact.
- Repository: fixeo-app/Fixeo-clean; PR #150 OPEN / DRAFT / UNMERGED; base feat/fixeo-mobile-m4-terrain at 7256eeda9898639debe7c5a4e574a463d6fb2234.
- Remote starting HEAD: a5e53cea27906781050a7bb5f4e054aa8036f864; root tree 6d3200646019dc681a11fe8fdce9597fd54e7902. Five existing CI workflows re-read SUCCESS (baseline only).
- All 3,361 tracked blobs recovered from prior copies and verified individually against the current complete GitHub tree (3,575 entries, not truncated). Exact original commit object recovered and hash verified. A separate shallow repository reproduces the same HEAD and tree; status was clean before this document. No synthetic baseline commit.
- Five old worktrees reference a missing common Git directory. They were not repaired, reset, deleted or edited; all existing files remain untouched. The new copy is the sole mutation context for this execution.
- Concurrency: no other running process visible in the accessible worktrees; prior PR reports STOP after delivery. No global cross-conversation ownership API is available. Re-read the remote HEAD before each publication and use a non-force expected-SHA update; any divergence stops publication.
- STAGING: Supabase project kqyhusnbybsukbcaoqtu / fixeo-diagnostic-staging re-read ACTIVE_HEALTHY. Migration pb1_1_business_link_integrity already present at remote version 20261008150316; local migration filename 20261008145315 is preserved. No migration re-applied.
- EAS: fixeo-maroc/fixeo-mobile; latest listed build 90e43558-8f4f-4bd3-a5f1-39663213bdfe SUCCEEDED, 0.3.2 (11), source a5e53cea; no active build in the observed list. Existing default JKS credential for ma.fixeo.app present, uploaded 2026-10-01. No credential downloaded/generated/modified.
- EAS billing read-only: Starter, USD 7 / 45 credits shown used; USD 38 remaining at observation. Recheck before build. Build profile w6-physical-certification: internal / preview environment / application STAGING / APK / developmentClient false / local version / no autoIncrement / no auto-submit. Supabase and API URLs target the exact STAGING ref.
- Production baseline: main f8e59d5ad7294dd5493bf7b0219740248d2a8d64; fixeo.ma alias dpl_63jTTiFwLrBD3D4Tc3Gxi7KVNjvR read-only. This is not a claim to have exhaustively certified every remote alias.
- Baseline TypeScript: PASS, before code edits. Local dependencies reuse the intact prior dependency directory; no installation or package update.

## Preservation and rollback

Keep the old worktrees and proof package untouched. Preserve RAFI MASTER assets, identity, Auth, RLS, data fixtures and prior migration. Changes proceed sequentially B1–B8 with named commits. Rollback uses new revert commits on this branch, never reset/force-push/main. Any STAGING backend mutation requires its own before-state, reviewed additive diff and rollback before execution.

No build until all software P0/P1 gates pass and the final SHA is frozen. At most one Android build, no automatic retry. No web preview, merge, Production, iOS, stores, Auth changes, dispatch, WhatsApp, payment or real send. R01–R32 physical tests begin DEFERRED.

## Source integrity

- Uploaded mandate SHA256: 973ce28450615fe9af72ebc95e574870b4cba09ba8f33c7467e8e247dd477259.
- Uploaded audit SHA256: 4c806a3113b2c2f73753aefc2c944794a95e5e1d58a703bc3874bcc96fd586c5.

Initial F01–F14 disposition: F01–F10 remain software corrections; F11 PHYSICALLY-DEFERRED; F12–F14 remain software corrections. Detailed evidence will be attached per block, with no inherited physical PASS.
