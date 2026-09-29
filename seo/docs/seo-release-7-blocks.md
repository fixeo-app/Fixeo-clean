# FIXEO SEO Consolidation — Seven-Block Release

## Baseline

Application / Production baseline before SEO consolidation:

`a2251921ea10e896bfd061095e4be0986d221f36`

Branch owner:

`feat/seo-consolidation-7-blocks`

No Supabase migration is required or authorized by this SEO release.

## SEO-0 — Inventory & Google truth

PASS — Search Console data is frozen in the Master Map decision record.

Reference window: 2026-06-28 → 2026-09-27, settled through 2026-09-27.

The release treats impressions/clicks as evidence of Google visibility, not proof that every URL is indexed or healthy.

## SEO-1 — Canonical architecture

PASS candidate.

Canonical host: `https://www.fixeo.ma`.

Primary commercial hierarchy:

- `/{service}`
- `/{service}/{city}`
- `/{service}/{city}/{district}`
- `/{problem}/{city}`
- `/prix/{service}/{city}`
- `/blog/{slug}`
- `/artisan/{public_slug}`

Legacy flat service-city routes remain permanent redirects; new internal linking targets clean canonical routes.

## SEO-2 — Wave 1

PASS candidate.

Eleven high-value service-city masters receive explicit support links to their distinct price/problem/editorial intents:

- Plombier: Tanger, Oujda, Nador, Tétouan
- Serrurier: Casablanca, Tanger, Oujda, Marrakech
- Électricien: Rabat
- Climatisation: Oujda, Agadir

No ranking legacy route is deleted. Redirects remain the consolidation mechanism.

## SEO-3 — Blog Authority 2026

PASS candidate for targeted high-value updates.

Protected/upgraded articles include:

- recharge gaz climatisation
- prix électricien Maroc
- prix climatisation Maroc
- climatisation Agadir
- urgence plomberie Casablanca
- profile-artisan trust guide

Stale 2025 metadata is removed from the upgraded pages. Fixed availability / response-time / certification / guarantee claims are removed or reframed where reviewed. Existing high-performing URLs are preserved.

## SEO-4 — pSEO Quality Gate

PASS candidate.

The current `sitemap-pseo.xml` corpus is frozen at a maximum of 391 URLs during this release. No mass expansion and no blanket noindex.

Any future pSEO URL requires distinct intent, canonical support, truthful copy and documented demand/business evidence.

## SEO-5 — Artisan profiles

PASS candidate.

Existing profile SSR remains canonical. Generic anonymous placeholder identities remain reachable but become `noindex, follow` and are removed from `sitemap-profiles.xml`.

No profile is removed merely because it has zero clicks.

## SEO-6 — Sitemap / indexation / measurement

Candidate requirements:

- sitemap index canonical host = www
- updated Wave-1 local sitemap lastmod values
- updated high-value Blog lastmod values
- profile sitemap excludes anonymous placeholders
- robots advertises canonical sitemap index
- CI consolidation gate PASS
- Preview READY on exact candidate
- no migration / secret drift
- Production merge on exact certified SHA
- postflight HTTP/canonical/assets PASS
- canonical sitemap re-submitted to GSC
- targeted URL inspections recorded

## Rollback

Application rollback target:

`a2251921ea10e896bfd061095e4be0986d221f36`

Because this release contains no database migration, rollback is application-only. Search-engine recrawl state cannot be instantly rolled back; therefore redirect/canonical changes are deliberately conservative.

## Measurement limitation

Deployment certification can prove routing, metadata, sitemap and production integrity.

It cannot prove a ranking uplift on deployment day. Organic outcome is evaluated after Google recrawls the changed pages, using the same Search Console property and the frozen baseline window.
