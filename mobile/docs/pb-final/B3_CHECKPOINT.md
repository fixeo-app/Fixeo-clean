# B3 — Photo consent and one-photo contract

2026-10-08. PASS SOFTWARE: typecheck, lint, 193 tests Mobile (including real-component provider-controlled photo flow), and camera permission/refusal/replacement controls. No live AI call. Evidence b3-*.

One 88 dp thumbnail with full-screen viewing; replace/remove/clarify contextual controls. Clarification keeps photo and text while invalidating dependent analysis. Replacement resets analysis consent and optional retention. Capture and consent toggle make zero analysis calls. Analysis action AND handler require explicit consent; retention invokes the existing distinct persisted contract only after opt-in. Request lock, session generation and STOP guards preserved. Test confirms no creation, no automatic provider call, separate retention count and STOP retained after restart. Diagnostic no longer mounts a second RAFI hero.

Contract remains exactly one image. Multi-photo DEFERRED: future v2 must accept 1–3 stable media IDs, bounded per-image/aggregate bytes and MIME, total quota charged once per explicit analysis, owner/RLS validation for each image, per-image observed/inferred provenance, immutable consent versions, atomic invalidation on removal/replacement, compatible v1 fallback, and failure/timeout/partial-upload rollback tests. No v2 endpoint or three-photo claim introduced.

Native camera/IME, billable live analysis, screenshots and new Samsung APK proof PHYSICALLY-DEFERRED. No backend mutation, build or deployment. Rollback is the named B3 commit only.
