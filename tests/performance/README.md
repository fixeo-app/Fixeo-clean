# Homepage performance cleanup — first dependency cut

Baseline: `b983706edf5d60f3e30730a564099e70559c3173`.

This change removes the homepage marketplace bootstrap, its hidden sections,
legacy dialogs, comparison UI and automatic eight-script booking preload.
Directory/profile assets remain in the repository and are unchanged.
`fixeo-home-core.js` provides métier selection independently of artisan filtering,
keeps the generic modal contract, routes service buttons into RAFI and directs
header search to the visible hero. The estimation entry reads that same hero.

## Source budget (not compressed transfer size)

| Metric | Before | Candidate |
| --- | ---: | ---: |
| External script declarations | 68 | 49 |
| Stylesheet declarations, including noscript fallbacks | 90 | 69 |
| Declared JS source bytes (excludes dynamic imports/CDN) | 1,543,192 | about 1,025,150 |
| HTML bytes | 287,933 | about 235,300 |
| HTML elements before runtime insertion | 974 | 573 |
| Idle legacy booking scripts | 8 | 0 |

Production baseline in the cloud browser: 1,384 artisans injected approximately
5.4 seconds after navigation began. Cached reload reached `load` in 1.23 seconds.
These are observational timings, not LCP/INP measurements or a reproduction of
the user's >60 second PC load. No candidate browser timing is claimed.

## Verification

From a full checkout:

```sh
npm install --prefix tests/performance
npm test --prefix tests/performance
node --test tests/estimator/*.test.cjs
```

The DOM integration test executes actual homepage scripts with network/auth
mocked. It verifies startup, footer, absence of artisan bootstrap and idle
booking scripts, métier selection, RAFI prefill, header focus and estimation
text continuity. It never creates a request or sends an artisan notification.
`FIXEO_TEST_ASSET_DIR` optionally supplies unchanged JS in a partial checkout.

Before merging: inspect the preview in a real browser on desktop and mobile;
verify full footer, menu/account controls, geolocation/manual city, text/voice,
estimation/back/confirmation UI, urgent path and estimate resume. Measure cold
and warm visits under the same conditions, network waterfall, LCP and interaction
responsiveness. Do not equate source-byte savings with time savings.

## Deliberately retained shared dependencies

QuickSearch, RAFI OS, hero resume, homepage-v13 and conversion optimizer still
have shared context/presentation responsibilities. They are not classified as
fully unused. Their remaining hidden UI and observers need a separate extraction
with visual/resume coverage. The new home core overrides the QuickSearch header
entry only; other pages keep their existing behavior.

No Supabase schema, RPC, payment configuration or pricing data is changed.
