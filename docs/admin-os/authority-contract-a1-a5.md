# FIXEO Admin OS — Authority Contract A1–A5

Baseline: 23bc695a76d1be0a9ad759ae14428c8d53756f7b

## A1 Existing admin
Legacy UI is layered across admin.html, admin.js, admin-unified-engine.js, admin-control-center-p1.js,
admin-command-center.js, admin-canonical-sync-v1.js and analytics/commission/notification modules.
The redesign is additive first; canonical engines are reused rather than duplicated.

## A2 Universe map
- Client: public users/profiles + service_requests + missions and their canonical relations.
- Artisan: artisans/profiles + marketplace quotes/missions/commissions; personal Artisan OS data remains private
  and is never treated as FIXEO accounting.
- Enterprise: enterprise accounts/sites/members/request context/workforce/SLA/finance/governance read models.
- Admin: supervisory views and governed actions only.

## A3 Authority
- Authentication: live Supabase session.
- Role authority: public.users.role; admin requires canonical role=admin.
- Existing public.is_admin()/server-side admin checks remain authoritative.
- No service-role secret or privileged credential is exposed to the browser.
- Sensitive mutations must use existing governed RPC/API paths; no RLS bypass is introduced.

## A4 Action classes
1. READ — operational inspection/search.
2. OPERATIONAL — governed dispatch/status actions already supported.
3. SENSITIVE — identity, verification, finance, permissions; explicit confirmation + audit required.
4. DESTRUCTIVE — never added implicitly by Admin OS.

## A5 Canonical source rules
- service_requests: request lifecycle.
- missions: mission lifecycle and authoritative mission prices where populated.
- artisans/profiles/users: identities and role-specific public/admin fields.
- commissions/payment state: canonical marketplace fields only.
- enterprise_* + enterprise request context: Enterprise tenant data.
- notifications/audit sources: only persisted real events.
- No fake KPI, revenue, score, SLA, payment, mission or incident.
- No duplication of Client/Artisan/Enterprise domain records for presentation.

Gate A PASS criteria:
- authority unchanged;
- no DB migration required for shell;
- no new privileged browser write;
- every future panel declares its canonical source;
- every sensitive action preserves server-side authorization.
