# Diagnostic release — 22 September 2026

Scope: Diagnostic section and modal only. Hero and Estimation frontend untouched.

Two new Vercel Production sensitive variables were created with independent 48-byte
cryptographically random values: FIXEO_DIAGNOSTIC_SECRET and CRON_SECRET.
Values were never written to a file, GitHub or logs. Existing secrets untouched.

Production migration diagnostic_bridge_preserve_estimation_v1 adds the private
Diagnostic confirmation core and its server-only RPCs. The canonical Estimation
confirmation definition remains MD5 8385d4401513eed11fe50300b1277933, checked before
and after application. No existing business record modified.

Model: gpt-4.1-mini-2025-04-14, Responses API, store:false. Image input and structured
outputs supported. Pricing: USD 0.40/M input tokens, 1.60/M output tokens.
Source: https://developers.openai.com/api/docs/models/gpt-4.1-mini
Existing limits: 3 sanitized images, 2048 output tokens, 25-second provider timeout,
USD 0.10 conservative reservation per analysis and USD 10 daily reservation ceiling.
Consent and retention notice already present in Diagnostic modal; only private
sanitized media is sent to OpenAI. No claim of provider zero-retention is made.

Vercel Pro Fluid Compute: enabled, default duration 300 seconds observed in UI.
Hourly authenticated maintenance is configured in vercel.json.
Activation now also requires CRON_SECRET >= 32 characters.

Validation before push: 12 targeted Diagnostic API, media, provider, retention and
auth tests PASS. Local migration application, unchanged legacy definition and
browser-role RPC denial PASS. Standalone Vercel build PASS.
The old standalone Chromium harness could not launch (binary absent); the actual
production browser smoke will use the available authenticated browser.

Diagnostic remains OFF for the first technical deployment. Activation flags are
not saved until the live build gate passes. Production publication is gated by api/diagnostic/verify-build.cjs, executed by
Vercel before deployment can become READY: real signed photo upload, WebP metadata
removal, unauthenticated read denial, cross-owner denial, real OpenAI analysis,
authenticated cleanup including replayed upload deletion. Any failure exits 1.
Only synthetic Diagnostic test dossiers are created, with no booking or mission.
Build-local deduplication marker contains only PASS, no secret or user data.

The proposed global automatic domain-assignment setting change was rejected by
automatic approval review; it was not applied. Build-time validation avoids changing
that production setting. Existing production remains available if a build fails.
Rollback: prior READY deployment dpl_9s8fgr2ZmpZQt2ARC7pVQG1o7EC5, SHA
22fe473773aea96bdb2b24a9a3e1f9b6e6beefe1 (Diagnostic disabled in its environment).

Premature readiness/activation flag saving was also rejected by automatic approval
review and was cancelled. Verification now runs with a test-only injected
configuration inside the build process while the public Diagnostic stays OFF.
After real tests pass, the same SHA can be redeployed with public activation.

Live build and production smoke results are pending at preparation of this commit.
