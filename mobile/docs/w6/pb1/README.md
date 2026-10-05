# PB1 — Android physical certification preparation

Local preflight PASS. STOP — automatic approval review blocked Git push and Expo sign-in.
This is not an APK delivery and does not certify physical W6 Auth.

Both attempts were rejected by automatic approval review, not by the user. The review required trusted explicit end-user authorization for publishing to the shared W6 branch and accessing the Expo account session. Neither action was retried through another interface. The prepared commit is local only. A final read-only GitHub check confirms remote HEAD remains `38e454ab2e022a0c601091a8505e087605e54d1e`, with PR #150 open, Draft and unmerged.

## Checkpoint and scope

- Starting HEAD: `38e454ab2e022a0c601091a8505e087605e54d1e`.
- Fresh clone: `fixeo-app/Fixeo-clean`, branch `feat/fixeo-mobile-w6-entry-auth-trust`; clean starting tree, local/remote divergence 0/0.
- PR #150 verified open, Draft, unmerged; base `feat/fixeo-mobile-m4-terrain`.
- Original local W6 workspace was dirty and was not modified or used as the source tree.
- Existing untracked dependency lock matched the manifest exactly; it is now committed and verified with a fresh `npm ci` for reproducible Android compilation.
- Only the dedicated EAS profile, dependency lock and PB1 evidence are added. Application logic and previous profiles remain unchanged.

## Prepared profile

`w6-physical-certification`: internal, Android APK, no development client, explicit EAS environment `staging`, no submission, no auto-increment.

Supabase and RAFI gateway target only `kqyhusnbybsukbcaoqtu`. The only Supabase key is publishable. The approved callback is exactly `https://w6-auth-staging.fixeo.ma/auth-callback`.

EAS account entitlement to the custom `staging` environment and its remote variables must be reviewed after authentication. EAS CLI schema validation is not proof of account entitlement. No environment fallback has been selected.

## Local evidence

| Gate | Result |
| --- | --- |
| Mobile contracts | 114/114 PASS |
| Server regression | 201/201 PASS |
| Client C4 | 14/14 PASS |
| Relay contracts | 17/17 PASS |
| Expo Doctor 1.20.4 | 18/18 PASS |
| TypeScript | PASS |
| Gate A / Web export | PASS |
| Android Hermes export | PASS |
| Native preflight assertions | 20/20 PASS |
| Git whitespace check | PASS |

Native prebuild was generated in a disposable inspection directory, not committed into the app. `AndroidManifest.prebuild.xml` registers `fixeo` on MainActivity with VIEW, DEFAULT and BROWSABLE, supporting the configured `fixeo://auth-callback` entry. The actual APK must still be inspected after EAS compilation.

Microphone and foreground location appear in the app manifest; background location and its service are explicitly removed. CAMERA and POST_NOTIFICATIONS are supplied by the installed image-picker and notifications library manifests. SecureStore backup exclusion rules are supplied by its library. Native storage uses SecureStore for the PKCE verifier and Auth session. Permission requests are attached to user actions, with no request in root startup.

Android bundle contains the exact staging Supabase URL and callback. Decoded Hermes strings contain no Supabase secret key or JWT literal. The raw-byte scanner initially matched adjacent string-table entries after the SDK's standalone `sb_secret_` prefix; decoding individual strings resolved that false positive.

Package `ma.fixeo.app`, version `0.3.0`, versionCode `4`. The newest remote Android version and existing signing credentials remain to be checked. Local fingerprint is labelled separately from the pending EAS build fingerprint.

Prebuild emits an advisory about missing expo-system-ui for userInterfaceStyle. No design change is made here; observe actual device appearance during physical review.

## Resume without another audit

First obtain explicit user authorization in the conversation for pushing the prepared PB1 commit to the exact W6 branch and signing into the existing Expo/EAS account. The original attachment authorized the build scope, but automatic review did not accept it as sufficient for these two actions.

1. Authenticate the existing Expo account for the already-linked project `bb76a67f-4304-48a6-ad29-ca7382d28a7a` / `fixeo-maroc/fixeo-mobile`.
2. Verify EAS project, entitlement/environment variables, quota, existing signing credentials, versionCode and absence of another active build.
3. Recheck exact branch/HEAD and PR Draft status. If configuration must change, rerun only affected gates before building.
4. Run one Android build with profile `w6-physical-certification`, no auto-submit. Use existing remote signing credentials; do not silently generate a replacement keystore.
5. Record build ID, exact source SHA, EAS fingerprint, artifact size and final status. Inspect the resulting APK, deliver its official EAS URL, then STOP for installation.
6. After installation only: one Client recovery; stop immediately on 429. Artisan only after Client PASS. Preserve the user's physical certification matrix.

No build launched, no Auth request/session created, no Supabase/DNS/Vercel setting changed, no merge, no main/Production change, no W7. Supabase Phase 2A remains USER-OBSERVED / MANUAL EVIDENCE. Native deep link, real PKCE, recovery, login and role isolation remain NOT TESTED physically.
