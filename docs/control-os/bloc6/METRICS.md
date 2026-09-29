# Marketplace metric contract — v1

All metrics are Admin-only Marketplace supervision, excluding private Artisan Business. Scope is exact normalized city/trade, canonical classification, optional enterprise/site. Dates use `[from,to)` in `Africa/Casablanca`; UTC timestamps are retained. Stock is observed at RPC `as_of`; request cohorts use SR.created_at; quote cohorts use current-version presented_at; review flows use review.created_at. No description heuristic excludes tests. Each displayed count links to the same filtered population and then Universal Dossier, unless explicitly stated unavailable. No automatic business action exists.

Freshness: database snapshot FRESH for 60 seconds; original profile timestamps remain visible and do not prove availability freshness. Source failure/timeout is UNAVAILABLE with error and null facts, never an empty success. Missing dimensions are UNKNOWN, not zero profiles. Cells and populations are keyset paged with exact counts and filter-bound cursors. A concurrent page mismatch is PARTIAL. Financial amounts are MAD.

| Metric / field ID | Grain and formula | Source | Unknown / interpretation | Population |
|---|---|---|---|---|
| operations.cohort_requests | distinct requests created in W | service_requests | Undated requests separately reported | cohort |
| operations.open | status new/no_match/assigned/in_progress at as_of | service_requests | Does not imply no dispatch | open |
| operations.waiting | new/no_match and no current external/internal engagement | service_requests + missions + internal assignments | Offered is not accepted | waiting |
| operations.urgent_waiting | waiting and urgency now/urgent | same | Declared urgency only | waiting |
| operations.oldest_waiting / undated | minimum creation time / missing dates | same | Missing time is null | waiting |
| operations.offered_missions | missions offered attached to waiting requests | missions | Offers, not acceptances | waiting → dossier |
| operations.failed_notifications | failed outbox rows for open requests | dispatch_notification_outbox | Failure, not refusal | open → dossier |
| operations.enterprise_open | open requests with canonical Enterprise context | enterprise_request_context | Does not grant tenant actions | open → dossier |
| network.referenced | distinct normalized declared city/trade matches, including secondary dimensions | artisans + artisan_service_cities/categories | Not eligible capacity; not additive across cells | profiles |
| network.claimed / verified | coherent owner+claimed / verified=true | artisans | Legacy flag never ORed into verification | profiles |
| network.available_declared / availability_unknown | explicit available / NULL or unrecognized availability | artisans | Not reserved, not promised fresh | profiles |
| network.claimable | claimable=true, unclaimed, no owner, no pending claim | artisans + claim_requests | Activation opportunity, not active worker | claimable |
| network.verification_ready | claimed+owner+onboarding, verified not true | B5 predicates | Review opportunity, not guaranteed verification | verification_ready |
| network.pending_claims / trust_conflicts | pending claims / canonical ownership or verified-legacy divergence | canonical Trust sources | Trust events remain distinct from reviews | profiles → dossier |
| network.oldest_profile_update / undated_profiles | earliest profile update / missing timestamp | artisans.updated_at | Profile update is not a proved availability confirmation | profiles |
| network.eligible / residual_capacity / coverage | unavailable aggregate | Dispatch / workforce authorities | Always null; bounded on-demand check is separately labeled | waiting → coverage → dossier |
| coverage.has_eligible_candidate | existence in canonical Dispatch preview, max five requests/call | dispatch_preview_v22 through B2 read | Exact existence only for checked non-Enterprise new requests; global ratio and total candidate count unknown | request / candidate dossier |
| coverage.Enterprise context | current Hybrid policy/permission/minimal workforce totals | control_hybrid_read_v1 | Observation is not assignment permission | request dossier |
| commerce.quotes_presented / quotes_review / quotes_expired | quote counts for request creation cohort, distinct quote grain | quotes | No quote does not mean QUOTE_REQUIRED | cohort → dossier |
| cohorts.requests.total / mature / censored | request cohort / age >= fixed horizon / younger | service_requests | Censored requests never silently become failures | cohort or previous |
| cohorts.requests.unknown_acceptance | inconsistent/missing required acceptance proof | missions + assignments + request state | Partial conversion, total rate null | cohort or previous |
| cohorts.requests.accepted_within_horizon | distinct mature observable requests with first proven acceptance <= created+horizon | persisted accepted_at / assigned_at | External/internal union deduplicated, including provable historical cancelled execution | cohort or previous |
| cohorts.conversion | numerator / observable denominator, fixed horizon 1/24/72/168h | prior fields | Empty denominator null; incomplete source null; censoring explicit | cohort or previous |
| cohorts.acceptance_p50/p95_minutes / delay_sample | percentiles of converted observable requests, n explicit | acceptance timestamp minus request creation | Not intervention/resolution time; no conversions = null | cohort or previous |
| cohorts.accepted_observed / fulfilled_state / cancelled_state | current observed acceptance / current fulfilled or cancelled state of cohort | requests + execution timestamps | State stock in a cohort, not completion flow in W | cohort or previous |
| cohorts.quotes | currently presented exact reviewed-version cohort, coherent accepted quote-version mission within horizon | quotes + accepted_quote_id/version | Superseded presentation history unavailable, missing relation explicit | cohort dossiers and B5 quote register |
| cohorts.quality | mean + n verified reviews with coherent mission/artisan and existing request, review event in W | reviews | No review = unknown mean, not poor quality | related dossier reviews |
| cohorts.finance | current canonical balances for missions in request creation cohort | control_finance_facts_v1 | Unknown cases prevent aggregate due balance; not period revenue; missing parents unattributable | cohort → mission / Finance dossier |
| cohorts.dispatch.first_sent_p50_minutes | median first persisted sent_at−request creation, n explicit | dispatch_notification_outbox | Recorded sending, not delivery/acceptance or first execution | cohort → dispatch dossier |
| cohorts.dispatch.execution_delay / offer_acceptance_rate | unavailable | complete immutable execution/presented-offer denominator absent | Always null; never inferred from queue/offer creation | dossier for actual events |
| comparison.volume_difference / relative_change | current cohort count−previous / divided by previous | two equal civil-day windows | Zero previous denominator = null relative change | both cohorts |
| comparison.conversion | percentage-point difference, Wilson 95% intervals | mature observable cohorts | <30 each, censoring, missing proof or stale data prevents established trend; overlap inconclusive; no causal/revenue forecast | both cohorts |
| unattributed_missions | missions whose request no longer exists, unfiltered scope only | missions LEFT request | No dimensions or balance reconstructed; filtered value null | existing Finance/Trust orphan dossiers |

Wilson method reference: NIST/SEMATECH e-Handbook §7.2.4.1, https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm. The minimum 30 observable requests per cohort is a conservative display rule, not a claim that observations are randomized or causal. Statistical intervals assume binomial outcomes; composition and seasonality remain uncontrolled.
