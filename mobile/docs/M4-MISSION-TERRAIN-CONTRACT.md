# FIXEO Mobile — M4 Mission Terrain Contract

## North star
After an artisan accepts, the user must feel that FIXEO has taken control of the problem. The app should reduce uncertainty instead of exposing internal workflow.

Client promise:
**Artisan trouvé → intervention suivie → fin confirmée.**

Artisan promise:
**Mission claire → client joignable → action terrain simple → clôture sûre.**

## Canonical state mapping
The backend remains authoritative.

| service_requests.status | missions.status | Mobile meaning |
| --- | --- | --- |
| assigned | pending | Artisan accepted; intervention not started |
| in_progress | pending | Intervention underway |
| completed | done | Artisan finished; client validation pending |
| validated | validated | Mission closed |

No mobile-only state may overwrite canonical mission authority.

## M4.1 — Recovery + active mission
- Artisan can reopen the accepted mission after app restart.
- Client can reopen the active intervention after app restart.
- Read RPCs are authenticated and ownership-scoped.
- No direct privileged table access from the app.

## M4.2 — Terrain actions
Artisan:
1. Open accepted mission.
2. See service, city, urgency, description and client phone.
3. Call client.
4. Start intervention through canonical start_mission.
5. Complete intervention through canonical complete_mission.
6. Wait for client validation.

Client:
1. See assigned artisan.
2. See a clear progress timeline.
3. See when the intervention starts and finishes.
4. Confirm completion through canonical confirm_completed_mission.

## M4.3 — Deep-link continuity
Push notifications should route to the relevant mission when a mission identifier is known.

## M4.4 — Reliability requirements
- repeated taps must not create duplicate requests or duplicate acceptance;
- accepted missions must recover after process death/reopen;
- a network failure must not invent success;
- server state wins during reconciliation;
- completion and validation are idempotent;
- sensitive operations remain authenticated and ownership-scoped.

## Product rule
The UI speaks in outcomes, not implementation:
- "Artisan trouvé"
- "Intervention en cours"
- "Intervention terminée"
- "Mission validée"

The customer should never need to understand dispatch queues, RPCs, statuses or retries.
