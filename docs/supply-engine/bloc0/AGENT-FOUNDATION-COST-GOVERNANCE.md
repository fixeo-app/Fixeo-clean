# FIXEO SUPPLY ENGINE — BLOC 0
## Agent Foundation + Cost Governance — Canonical Contract

Status: CANDIDATE / NO PRODUCTION MUTATION
Baseline: main @ 22f140e30e1a20f5d47ab5d87954c17e8dfc7eb5
Date: 2026-09-30

## 1. Objective

Build the Supply Engine as a shared operating substrate for FIXEO humans, RAFI and future GPT agents.
Agents are workers, never transaction authorities.

Canonical flow:

canonical FIXEO data -> deterministic Supply Engine -> Agent Work Layer -> governed action gateway -> canonical FIXEO data

WhatsApp is a channel adapter, not the Supply Engine.

## 2. Baseline evidence

Production read-only audit at this checkpoint:
- 1,385 production artisan profiles.
- 1,385 profiles have a phone/contact value.
- 1,378 are claimable + unowned with no pending claim.
- 7 are claimed with an owner and have completed onboarding.
- 1 profile has canonical verified=true.
- 0 profiles satisfy the strict candidate predicate claimed + owner + onboarding + verified + availability=available.
- 1,379 rows currently declare availability=available. This MUST NOT be interpreted as 1,379 active workers.
- 51 declared cities and 42 primary service labels.
- claim_requests currently contains no rows.
- 22 mission rows reference 8 distinct artisans.
- Existing primitives include dispatch_preview_recruitment_v1, claim approval/rejection, onboarding, admin verification, dispatch queues and WhatsApp inbound ingestion.

## 3. Non-negotiable semantic separation

The following concepts MUST remain distinct:

1. referenced
   A profile exists in artisans.

2. contactable
   A usable contact exists and the profile is not suppressed/opted out.

3. recruitment_candidate
   The Supply Engine has selected the profile for activation work.

4. contacted
   A real outbound attempt has been recorded.

5. engaged
   A real inbound signal or explicit operator evidence exists.

6. claim_in_progress
   A canonical claim/ownership flow is underway.

7. claimed
   claimed=true AND owner_user_id IS NOT NULL with coherent claim state.

8. onboarded
   onboarding_completed=true.

9. verified
   canonical verified=true. Legacy is_verified is not an independent authority.

10. activated
    claimed + owner + onboarded + verified plus a current activation proof defined by the Supply lifecycle.

11. dispatch_eligible
    Determined by the dispatch authority at decision time. Never inferred solely from recruitment state.

12. operational_availability
    A current operational signal. Historical availability='available' is insufficient proof by itself.

No agent may collapse these states.

## 4. Agent identity

Every agent-originated operation MUST carry:
- agent_id
- agent_type
- agent_version
- run_id
- task_id
- campaign_id when applicable
- actor_kind = agent | human | system
- channel
- correlation_id
- idempotency_key

Agent types are capabilities, not database superusers. Initial planned capabilities:
- rafi_supply_orchestrator
- recruiter
- conversation_classifier
- activation
- recovery
- trust_preparer

## 5. Work queue contract

Agents do not scan the whole database autonomously.

FIXEO creates bounded work items containing:
- target_type / target_id
- task_type
- priority
- reason codes
- evidence references
- not_before
- expires_at
- lease_owner / lease_until
- attempt_count / max_attempts
- status
- idempotency_key
- cost_policy_id

Required states:
QUEUED -> LEASED -> RUNNING -> SUCCEEDED | RETRYABLE | FAILED | CANCELLED | HUMAN_REVIEW

One active lease per task.
One logical action per idempotency key.
Expired leases are recoverable.

## 6. Evidence contract

An LLM conclusion is never canonical evidence by itself.

Evidence classes:
- canonical_db
- provider_event
- user_message
- operator_assertion
- deterministic_rule
- model_inference

Every model inference that can affect lifecycle state must retain:
- source evidence ids
- model/version
- confidence or structured uncertainty
- extracted structured facts
- timestamp

Lifecycle mutations may require stronger evidence than model_inference.

Examples:
- "interested" can be supported by an inbound user message + classifier.
- "verified" requires the canonical verification authority.
- "available now" requires an approved current availability signal, never a language-model guess.

## 7. Action Gateway

Agents MUST NOT write directly to canonical business tables.

Permitted pattern:
agent proposes command -> server validates authority + current state + idempotency + budget -> canonical RPC executes -> audit event recorded.

Initial command vocabulary:
- record_contact_attempt
- record_inbound_signal
- classify_recruitment_response
- schedule_followup
- suppress_outreach
- create_claim_invitation
- mark_activation_step
- request_human_review
- prepare_verification
- record_channel_delivery

Direct agent UPDATE/INSERT/DELETE on artisans, claim_requests, missions, users, profiles and dispatch authority tables is prohibited.

## 8. Cost governance — deterministic first

Mandatory decision ladder for every task:

A. Can SQL/rules produce the reliable result?
   YES -> no model call.

B. Can a validated template produce the message?
   YES -> no generative call.

C. Is simple classification/extraction needed?
   -> cheapest approved model/tier.

D. Is ambiguity material to the next action?
   -> bounded escalation to a stronger model.

E. Is the action high-authority or irreversible?
   -> server/human authority, not model authority.

No continuous LLM polling.
No per-profile daily reasoning.
No autonomous full-table scans by models.

## 9. Cost Governor

Every model invocation must be attributable to:
- agent_id
- run_id
- task_id
- purpose_code
- model_tier
- input_units
- output_units
- cached_units when available
- estimated_cost_minor
- currency
- latency_ms
- escalation_from
- outcome_code

Budgets exist at:
- global Supply Engine
- agent
- campaign
- task type
- artisan/contact dossier

Hard gates:
- max calls per task
- max model escalations per task
- max tokens/units per call
- daily campaign budget
- daily global budget
- circuit breaker on abnormal spend

When a hard budget is reached:
NO silent overrun.
Task -> HUMAN_REVIEW or DEFERRED_BUDGET.

## 10. Cost KPIs

Control OS must eventually expose:
- AI cost / contacted artisan
- channel cost / contacted artisan
- total cost / engaged artisan
- total cost / claimed artisan
- total cost / activated artisan
- total cost / first completed mission
- model calls avoided by deterministic rules/templates
- escalation rate
- cost by city x trade x campaign

Optimization target is activation economics, not token volume.

## 11. Event-driven execution

Agents wake only on useful events:
- new prioritized recruitment task
- inbound artisan message
- scheduled follow-up becomes due
- claim state changes
- onboarding step changes
- verification decision changes
- supply gap crosses a configured threshold
- channel delivery status changes

No event -> no model call.

## 12. Conversation memory

FIXEO database is operational memory.

Agents share a canonical dossier timeline:
profile -> recruitment scores -> attempts -> messages -> objections -> consent/opt-out -> claim -> onboarding -> verification -> availability proofs -> missions -> performance.

An agent taking over a task must read the compact structured dossier, not replay an unbounded raw conversation.

Summaries are cached/versioned and refreshed only when source evidence changes.

## 13. Channel independence

Supply core is channel-neutral.

Channel adapters may include:
- Control OS manual action
- WhatsApp Business / 0663 when Meta enables it
- future SMS/email/other approved channels

Channel-specific provider ids and delivery states stay at the adapter boundary.
Recruitment lifecycle does not depend on WhatsApp availability.

## 14. Outreach safety and economics

Required controls:
- contact-hour policy
- frequency caps
- campaign quotas
- per-artisan cooldown
- duplicate-contact prevention
- permanent suppression / opt-out authority
- wrong-number state
- channel failure state
- human takeover
- global kill switch
- per-agent kill switch
- per-campaign kill switch

Opt-out/suppression outranks recruitment priority.

## 15. Reuse before build

Reuse canonical assets:
- public.artisans
- public.claim_requests
- artisan_service_categories
- artisan_service_cities
- dispatch_preview_recruitment_v1 as a recruitment-scoring primitive, not dispatch eligibility
- register_new_artisan / finalize_artisan_signup_v1
- complete_artisan_onboarding
- approve_artisan_claim / reject_artisan_claim
- admin_verify_artisan_v1
- dispatch authority and queues
- whatsapp_inbound_messages + ingestion RPC
- Control OS authority/audit patterns

Do NOT create a second artisan master table.
Do NOT create a second claim authority.
Do NOT make WhatsApp the system of record.

## 16. Required new bounded primitives for subsequent blocks

Bloc 1+ may introduce only after schema review:
- supply lifecycle/event ledger
- contact suppression/preferences
- recruitment attempts/outcomes
- agent registry/capabilities
- agent work queue/leases
- agent evidence links
- AI usage/cost ledger
- campaign budgets/policies

These are orchestration/history objects around canonical tables, not replacements.

## 17. Security model

Default deny.

Agent execution identity receives only RPC-level capabilities required for its task.
No service-role credential in browser or prompt.
Secrets remain server-side.
PII passed to models must be minimized to what the task needs.
Raw conversation/media retention follows channel/privacy policy.
All state-changing commands are auditable.

## 18. Certification gates for Bloc 0 implementation

Before Production mutation:
1. exact schema/ACL review
2. RLS/GRANT review
3. non-admin direct-write denial
4. agent direct canonical-write denial
5. lease concurrency test
6. idempotency replay test
7. budget hard-stop test
8. kill-switch test
9. opt-out precedence test
10. deterministic no-model path test
11. model escalation cap test
12. audit attribution test
13. rollback plan
14. zero synthetic business rows in Production

## 19. Decisions frozen by this contract

D01 Supply Engine is the orchestration authority; artisans remains the profile master.
D02 GPT agents are workers, never transaction authorities.
D03 FIXEO DB is shared operational memory.
D04 deterministic/rule/template execution precedes model use.
D05 cost governance is a hard runtime gate.
D06 WhatsApp is an adapter, not a dependency of Supply core.
D07 referenced != available != activated != dispatch_eligible.
D08 model inference cannot independently assert verification or current availability.
D09 all agent work is bounded, leased, idempotent and attributable.
D10 opt-out and kill switches outrank automation.
D11 no duplicate artisan/claim master data.
D12 Control OS will expose both operational conversion and acquisition cost economics.

## 20. Next block

BLOC 1 — Supply Lifecycle + Event Ledger + suppression semantics.

Before any Production cutover, Bloc 1 must map every proposed lifecycle transition to existing canonical fields/RPCs and prove that historical availability cannot masquerade as active capacity.
