# FIXEO Mobile — M5 WOW EXPERIENCE + INTELLIGENCE SHELL

Status: execution branch opened after M4 physical certification.
Base checkpoint: M4 Android Staging 0.2.1 / versionCode 3.
Production/main: out of scope.

## Product promise

FIXEO Mobile must feel like a "solution miracle":
- the app understands before it asks;
- the next action is obvious;
- RAFI is present but never intrusive;
- the Decision Center works behind the scenes;
- web dashboards keep analytical depth;
- mobile becomes the contextual action layer.

## Non-negotiable principles

1. Do not shrink web dashboards into mobile screens.
2. Show only the information/action needed now.
3. Preserve canonical backend contracts; do not duplicate business truth.
4. Client, Artisan and Enterprise Field remain distinct universes in one app.
5. RAFI never invents price, availability, assignment or authorization.
6. Native interactions must remain fast on mid-range Android devices.
7. Every new visual effect must degrade gracefully and never block core actions.

## Seven execution blocks

### M5.1 — Mobile Design System + Motion
- semantic tokens: surfaces, typography, spacing, radii, elevation, state colors;
- native safe-area shell;
- premium cards, action buttons, pills, state badges;
- RAFI Orb component with restrained breathing/listening/working/success states;
- micro-interaction rules and loading skeletons;
- consistent Client / Artisan visual language.

Gate: no page keeps ad-hoc visual primitives for core flows.

### M5.2 — Client Adaptive Home
The Client home is not a dashboard; it is a state machine:
- idle -> RAFI entry;
- understanding -> contextual questions;
- matching -> live search;
- assigned -> artisan identity + ETA/state;
- active -> mission control;
- completed -> validation/review;
- no stale state after reopen.

The hero and actions morph with the current journey.

### M5.3 — Artisan Cockpit
Artisan home becomes "what should I do now":
- current mission first;
- opportunity inbox;
- availability state;
- today / next actions;
- quick access to quotes, CRM clients, agenda, money and profile;
- RAFI contextual guidance per mission;
- no heavy menu-first UX.

### M5.4 — RAFI Native Multimodal
- voice / photo / text as first-class inputs;
- contextual RAFI copy by universe and journey state;
- server-side intelligence only;
- visible distinction between observed, declared, inferred and confirmed;
- graceful fallback if AI is unavailable;
- no client-side privileged AI credential.

### M5.5 — Decision Center Bridge
Decision Center remains server-side and invisible as a dashboard.
Mobile receives actionable decisions:
- urgency;
- anomaly/risk;
- mission delay;
- quote inconsistency;
- field scope change;
- client confirmation required;
- artisan opportunity priority;
- enterprise SLA/approval later.

Each signal must map to one clear action, not another analytics screen.

### M5.6 — Feature Wiring
Reuse existing canonical capabilities:
- diagnostic / estimation;
- missions / dispatch;
- quotes;
- artisan CRM;
- agenda;
- personal interventions;
- encaissements / dépenses;
- profile / availability;
- notifications / deep links;
- Enterprise Field contracts where mobile-relevant.

No duplicate DB objects unless a mobile-specific technical object is required.

### M5.7 — WOW Polish + Physical Certification
- gesture and keyboard polish;
- haptics where useful;
- animation budget and performance;
- empty/error/loading states;
- accessibility and large text;
- offline/reopen recovery;
- two-device physical Client/Artisan certification;
- visual consistency pass on low/mid-range Android;
- iOS physical pass when Apple enrollment is available.

## Visual target

Premium, calm, unmistakably FIXEO.
Not "tech dashboard".
Not decorative futurism.
The user should feel:
"FIXEO already knows what is happening and is handling it."

## Core interaction sentence

RAFI understands.
Decision Center prioritizes.
FIXEO orchestrates.
The user acts.

## Release boundary

- Work only on feat/fixeo-mobile-m5-wow-experience.
- Base remains the certified M4 branch.
- Draft PR only.
- No merge to main/Production without an explicit release decision.
