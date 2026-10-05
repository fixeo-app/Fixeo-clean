# W6 Auth relay — staging only

Dedicated Vercel project: `fixeo-w6-auth-relay`.
Dedicated domain: `w6-auth-staging.fixeo.ma`.
Source: `feat/fixeo-mobile-w6-entry-auth-trust`, PR #150 (Draft).
Never attach this domain or deploy this folder to `fixeo-clean`.

## Build and contents

Run `node build.mjs` and `node --test test/*.test.mjs` from this folder with Node 24.
No package installation or npm dependencies are needed. The builder emits only
`.vercel/output/config.json` and `.vercel/output/static/callback.html`.
There are no functions, database accesses, Supabase keys, SDKs, Expo exports,
business data, analytics, pixels or storage. Production, unrelated Git branches
and the existing fixeo-clean project ID are refused by the builder.

## Routing and privacy

Only exact `GET /auth-callback` serves the document. Other methods on that path
return 405; all other paths return 404, including the internal filename.
No filesystem handler, external rewrite or SPA fallback is configured.
Every response receives no-store, no-referrer and nosniff headers.
Inline script and style are pinned by CSP hashes; connections, forms, frames and
external resources are prohibited. Vercel Toolbar and feedback must be disabled
on this dedicated project; no Drain or Analytics integration may be enabled.

The script captures incoming parameters only in volatile memory and immediately
clears the URL before parsing or rendering. Failure to clean prevents rendering
and handoff. A valid-shaped code enables a one-use "Ouvrir FIXEO" button. It sends
only `fixeo://auth-callback?code=...`; it does not claim the code is authenticated.
The original FIXEO context must retain its own PKCE verifier and exchange the code.
An email flow started in Web Preview is not interchangeable with a native flow.

All four bearer-token parameter names (access, refresh, provider and provider
refresh), unknown parameters, duplicate parameters, success/error ambiguity and
arbitrary redirect parameters cause a neutral refusal with no handoff.
Supabase error descriptions are never read or forwarded. Supported error mappings
are a closed vocabulary: expired, invalid, denied, unknown.

No application logger or persistent storage exists. This does not certify that
Vercel's internal infrastructure never retains query parameters: that distinction
must remain explicit in certification. Public tests use fake markers only.

## Phase boundaries

Phase 1 does not change Supabase Auth or W6 Auth approval/configuration, send email,
exchange real codes, open real sessions, merge, modify MAIN or create a device build.
Candidate allowlist entry for a future distinct GO only:
`https://w6-auth-staging.fixeo.ma/auth-callback`.

## Rollback

Detach only this custom domain from the relay, remove only DNS created for this
subdomain, and disable/delete only the relay project. Preserve fixeo-clean and
its protection. There is no Supabase Phase 1 change to undo and no localhost fallback.

The current deployment, DNS, TLS and public-test status is documented in
`../../mobile/docs/w6/CERTIFICATION.md`; local tests alone are not public certification.
