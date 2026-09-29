# FIXEO SEO — Master Map V1

Baseline application: `a2251921ea10e896bfd061095e4be0986d221f36`.

Search Console window: 2026-06-28 → 2026-09-27, settled through 2026-09-27.

## SEO-0 — observed truth

- 90-day property summary: 1,313 clicks, 45,519 impressions, CTR 2.88%, average position 11.24.
- Morocco: 1,270 clicks / 41,939 impressions.
- Mobile: 1,150 clicks / 35,757 impressions.
- Blog sitemap: 122 URLs; 110 received impressions; 183 clicks / 7,227 impressions.
- pSEO sitemap: 391 URLs; 355 received impressions; 302 clicks / 8,303 impressions.
- Profile sitemap: 1,205 URLs; 962 received impressions; 337 clicks / 19,384 impressions.
- Long-tail analysis: 704 low-traffic URLs in the sampled corpus, 703 with zero clicks. This is a review queue, not an automatic noindex list.

## Canonical architecture

One primary commercial URL per intent:

- service: `/{service}`
- service × city: `/{service}/{city}`
- district: `/{service}/{city}/{district}`
- problem: `/{problem}/{city}`
- price: `/prix/{service}/{city}`
- editorial: `/blog/{slug}`
- artisan: `/artisan/{public_slug}`

Legacy flat routes remain redirects only. They must not be reintroduced in new internal links or sitemaps.

## Decision vocabulary

- **KEEP**: proven useful and aligned.
- **UPGRADE**: strong impressions/position opportunity; improve without changing intent.
- **MERGE**: two pages answer the same intent and one should absorb the other.
- **REDIRECT**: historical route only; permanent transfer to canonical.
- **HOLD**: insufficient evidence; observe.
- **NOINDEX**: only after evidence of duplicate/low-value state, never by blanket rule.

## Wave 1

See `seo/data/seo-master-map-v1.json` for the machine-readable map. Priority intents:

Plombier — Tanger, Oujda, Nador, Tétouan.  
Serrurier — Casablanca, Tanger, Oujda, Marrakech.  
Électricien — Rabat.  
Climatisation — Oujda, Agadir.

## Guardrails

1. No mass noindex.
2. No redirect of a ranking URL unless the destination is the declared master and the redirect is exact/permanent.
3. No 2025 price copy presented as current.
4. No unverified availability, response-time, certification, guarantee or delivery claims.
5. Blog supports commercial pages; it does not duplicate their transaction intent.
6. Profiles remain indexable only under the existing eligibility gate.
7. Google Search Console performance is rechecked after cutover; ranking impact cannot be certified on deployment day.
