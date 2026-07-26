# RAFI V5 — Canonical Freeze Document

> **RAFI V5 is frozen as the canonical FIXEO conversion flow.**
>
> Canonical commit: **`ac37d1e`**
> Canonical engine version: **`fxrf4-v5a1`**
> Frozen: **2026-07-26**

---

## 1. Identity

| Property | Value |
|---|---|
| Engine version | `fxrf4-v5a1` |
| Canonical commit | `ac37d1e35b6ca8145b0dd821055a0560567741ba` |
| JS file | `js/fx-request-flow-v4.js` |
| CSS file | `css/fx-request-flow-v4.css` |
| JS lines | 1 702 |
| CSS lines | 2 683 |
| Cache-bust (JS) | `?v=fxrf4-v5a1` |
| Cache-bust (CSS) | `?v=fxrf4-v5z` |
| Feature flag | `window.FIXEO_FLOW_V4` (default: on; set `false` to disable) |
| Public API | `window.FixeoRequestFlowV4.open(opts)` / `.close()` |
| Deployed | `https://www.fixeo.ma` |

---

## 2. Supported Modes

RAFI V5 is a **single engine** with two entry modes. Mode is resolved at `open()` time and governs every screen that follows.

| Mode value | Entry point | Alias |
|---|---|---|
| `"emergency"` | `data-request-mode="express"` on any CTA | `express` → `emergency` inside `open()` |
| `"default"` | `data-open-request-form="true"` without mode attr | — |
| `"marketplace"` | `data-request-mode="marketplace"` | — |

`marketplace` behaves identically to `default` throughout the current engine. It exists as a future routing signal.

---

## 3. Screen Flow — Both Modes

### Mode A: Emergency (`"emergency"`)

```
STEP 1 — Situation selection
  RAFI: "Que se passe-t-il ?"
  Helper: "Je vais trouver les bons artisans en fonction de votre situation."

  7 situation chips (single column):
    💧  J'ai une fuite d'eau          → slug: plomberie
    ⚡  Plus de courant chez moi      → slug: electricite
    🔐  Je suis bloqué dehors         → slug: serrurerie
    🚿  Mon WC ou évier est bouché    → slug: plomberie
    ❄️  Climatiseur en panne          → slug: climatisation
    🚪  Porte ou fenêtre bloquée      → slug: menuiserie
    ⚠️  Autre urgence                 → inline expand → text input

  Predefined tap:  _chipTap (80ms scale + dim) → auto-advance 260ms → STEP 2
  "Autre urgence": card expands inline → RAFI speaks → user types (≥3 chars)
                   → "Continuer →" → STEP 2

     ↓

STEP 2 — City
  RAFI: "Vous êtes où ?" / "Vous êtes à {city} ?" (if detected)
  City chips: detected city card (full-width) + top-5 grid
  "Autre ville →" → native <select> with all 20 cities
  Tap → st.city set → auto-advance 200ms → STEP 3
  ← Retour → STEP 1

  NOTE: No urgency section in emergency mode. Urgency is pre-locked to
  "Urgent (moins de 30 min)" from _fresh('emergency'). It never changes.

     ↓

STEP 3 — Phone
  RAFI: "Sur quel numéro peut-on vous rappeler ?"
       / "C'est bien ce numéro ?" (returning user)
  [ 🇲🇦 +212 | input | ✓ ]  CSS grid — no overlap
  CTA: "Trouver un artisan maintenant" (amber, is-urgent)
  Valid phone → submit → interstitial (820ms) → SUCCESS (emergency)
  ← Retour → STEP 2

     ↓

SUCCESS (emergency)
  Ring: amber ambient glow
  Title: "Votre urgence est déjà prise en charge."
  Body:  "RAFI contacte déjà les artisans disponibles près de chez vous.
          Vous recevrez très bientôt une confirmation par téléphone ou WhatsApp."
  Steps: ✅ Enregistrée → 📲 Artisans contactés → 💬 Confirmation tél/WhatsApp
  Progress fill: rgba(234, 137, 54, 0.90)  [amber]
  CTA: "Voir mes demandes" → /dashboard-client.html#requests
       "Retour à l'accueil" → /index.html
```

---

### Mode B: Standard / Publish Request (`"default"` / `"marketplace"`)

```
STEP 1 — Service selection
  RAFI: "De quoi avez-vous besoin ?"

  10 service chips (2-column grid):
    🔧 Plomberie       ⚡ Électricité    🔐 Serrurerie    ❄️ Climatisation
    🪟 Menuiserie      🖌 Peinture       🧱 Maçonnerie     🧹 Nettoyage
    🌿 Jardinage       📦 Déménagement
    + Autre chose  (full-width, escape hatch)

  Standard chip:  _chipTap → auto-advance → STEP 2
  "Autre chose":  expand below grid → RAFI speaks → user types (≥3 chars)
                  → "Confirmer →" → STEP 2

     ↓

STEP 2 — City + Timing
  RAFI: "Parfait. Vous êtes où ?" / "Parfait. Vous êtes à {city} ?"
  City chips: same as emergency (detected card + grid + "Autre ville")
  Tap → st.city set → timing section reveals (no auto-advance)

  3 timing cards:
    ⚡ Maintenant    → urgency: "Urgent (moins de 30 min)"
    📅 Aujourd'hui  → urgency: "Aujourd'hui"
    🗓 Plus tard    → urgency: "Normal"

  Timing tap → auto-advance 240ms → STEP 3
  ← Retour → STEP 1

  BACK FROM STEP 3: city pre-selected + timing cards auto-revealed
                    + previously chosen timing card pre-selected.
                    User proceeds without re-tapping anything.

     ↓

STEP 3 — Phone
  RAFI: "Sur quel numéro peut-on vous joindre ?"
       / "C'est toujours ce numéro ?" (returning user)
  [ 🇲🇦 +212 | input | ✓ ]
  CTA: "Envoyer ma demande" (indigo, no is-urgent)
  Valid phone → submit → interstitial (820ms) → SUCCESS (standard)
  ← Retour → STEP 2

     ↓

SUCCESS (standard)
  Ring: teal ambient glow
  Title: "Votre demande est déjà entre de bonnes mains."
  Body:  "RAFI sélectionne déjà les artisans disponibles pour vous.
          Vous recevrez une confirmation dès les premières réponses."
  Steps: ✅ Enregistrée → 🔍 RAFI sélectionne → 💬 Confirmation WhatsApp
  Progress fill: rgba(32, 201, 151, 0.80)  [teal]
  CTA: "Voir mes demandes" → /dashboard-client.html#requests
       "Retour à l'accueil" → /index.html
```

---

## 4. Shared vs. Mode-Specific Screens

| Screen | Emergency | Standard | Notes |
|---|---|---|---|
| Step 1 situation chips | ✅ mode-specific | — | `_renderEmergencyStep1` |
| Step 1 service grid | — | ✅ mode-specific | `_renderStandardStep1` |
| Step 2 city section | ✅ shared | ✅ shared | Same DOM, same chips |
| Step 2 urgency timing | ❌ absent | ✅ present | `urgencySection = null` in emergency |
| Step 3 phone screen | ✅ shared | ✅ shared | CTA label + colour differ by mode |
| Interstitial | ✅ shared | ✅ shared | RAFI message differs |
| Success screen | ✅ mode-specific copy | ✅ mode-specific copy | `isEmergency` branch |
| Progress bar colour | Amber | Teal | Fill colour at success |

---

## 5. Payload Contract

Every submission produces one localStorage entry (and fires one `fixeo:client-request-submit-success` CustomEvent). The shape is fixed:

```typescript
interface FixeoRequest {
  id:           number;          // Date.now() at submit time
  service:      string;          // serviceSlug || serviceLabel
                                 // Predefined: slug (e.g. "plomberie")
                                 // Free-text:  "autre" (machine-readable)
  problem:      string;          // Human-readable label
                                 // Predefined: category label (e.g. "Plomberie")
                                 // Free-text:  user's typed description
  description:  string;          // Free-text user input (mirrors problem for "autre")
                                 // Predefined categories: "" (empty — no free text)
  city:         string;          // One of 20 Moroccan cities, plain name
  phone:        string;          // Raw user input (e.g. "0612345678")
  urgency:      string;          // "Urgent (moins de 30 min)" | "Aujourd'hui" | "Normal"
  tracking_ref: string;          // "FX-XXXX" — generated ref for user comms
  status:       "nouvelle";      // Fixed at creation
  created_at:   string;          // ISO 8601 UTC timestamp
  source:       "fxrf4-v5a1";    // Engine version — FROZEN
  mode:         string;          // "emergency" | "default" | "marketplace"
  viewed:       false;           // Fixed at creation
}
```

### Payload examples — canonical

**Emergency predefined (fuite d'eau → plomberie):**
```json
{
  "service":      "plomberie",
  "problem":      "Plomberie",
  "description":  "",
  "city":         "Casablanca",
  "urgency":      "Urgent (moins de 30 min)",
  "mode":         "emergency",
  "source":       "fxrf4-v5a1"
}
```

**Emergency "Autre urgence" free-text:**
```json
{
  "service":      "autre",
  "problem":      "Odeur de gaz dans la cuisine",
  "description":  "Odeur de gaz dans la cuisine",
  "city":         "Casablanca",
  "urgency":      "Urgent (moins de 30 min)",
  "mode":         "emergency",
  "source":       "fxrf4-v5a1"
}
```

**Standard predefined (Plomberie, Maintenant):**
```json
{
  "service":      "plomberie",
  "problem":      "Plomberie",
  "description":  "",
  "city":         "Rabat",
  "urgency":      "Urgent (moins de 30 min)",
  "mode":         "default",
  "source":       "fxrf4-v5a1"
}
```

**Standard predefined (Peinture, Plus tard):**
```json
{
  "service":      "peinture",
  "problem":      "Peinture",
  "description":  "",
  "city":         "Marrakech",
  "urgency":      "Normal",
  "mode":         "default",
  "source":       "fxrf4-v5a1"
}
```

**Standard "Autre chose" free-text:**
```json
{
  "service":      "autre",
  "problem":      "Fissures dans le plafond du salon",
  "description":  "Fissures dans le plafond du salon",
  "city":         "Rabat",
  "urgency":      "Aujourd'hui",
  "mode":         "default",
  "source":       "fxrf4-v5a1"
}
```

### Field invariants

- `service` is always a known slug OR `"autre"`. Never raw user text.
- `description` is empty for predefined categories. Always populated for `service = "autre"`.
- `phone` is stored as the user typed it. The dashboard normalises for WhatsApp via its own `buildWA()`.
- `urgency` in emergency mode is always `"Urgent (moins de 30 min)"`. It is pre-locked in `_fresh('emergency')` and never overwritten.
- `source` is `"fxrf4-v5a1"` for all submissions made from this engine version.

---

## 6. State Lifecycle

### State object (`_st`)

Created by `_fresh(mode)` on every `open()`. Destroyed (`_st = null`) by `close()`. There is no persistence between sessions except for prefill reads from `localStorage`.

```
_fresh(mode) creates:
  mode, source, screen, serviceSlug, serviceLabel, city,
  urgency (pre-set per mode), phone, description, ref,
  submitLocked, submitTs, prefillService, prefillCity,
  prefillPhone, detectedCity
```

### DOM lifecycle

`_buildDOM()` is called once at page load (pre-build) and once at first `open()`. The `_root` element is a singleton appended to `<html>` (not `<body>`) and reused across opens. `open()` clears `#fxrf4-body` and `#fxrf4-foot` innerHTML before re-rendering step 1.

### Back navigation guarantees

| From → To | State preserved |
|---|---|
| Step 3 → Step 2 | `st.city` ✓ | `st.urgency` ✓ (timing cards auto-revealed in standard) |
| Step 2 → Step 1 | Step 1 re-renders fresh. `st.serviceSlug/Label` cleared by new render but user must re-select. |
| Any step → close | `_st = null`. Full reset. |

**Standard mode — Back from Step 3:**
`_renderStep2` detects `st.city` already set + `urgencySection` exists → calls `setTimeout(_showUrgencyCards, 0)` → timing section is visible and the previously chosen card is pre-selected. User does not need to re-tap the city chip.

**Emergency mode — Back from Step 3:**
`urgencySection = null` → `_showUrgencyCards` guard is `false` → no side effect. City chip is re-selected. Auto-advance fires on city tap as normal.

### Close guarantees

`close()` performs:
1. `_isOpen = false`
2. Remove `.fxrf4-active` from `_root`
3. Clear `_typeTimer`
4. `_transitioning = false`
5. `_teardownKeyboard()` — removes `visualViewport` and `window.resize` listeners
6. Remove `.is-emergency` from RAFI name element
7. `_unlock()` — clear `overflow:hidden` on `<html>` and `<body>`, restore `scrollY`
8. `_st = null`

No stale state, no locked transitions, no keyboard listeners remain after close.

---

## 7. Submission Guarantees

### Success path

Success screen is shown **only** after `_saveRequest(st)` returns a truthy `saved` object. If `localStorage` throws (full storage, Private Browsing restriction, security exception), `_saveRequest` catches and returns `{ request: null }`. `_submitRequest` detects `!saved` and returns early — the user remains on Step 3 with the button restored.

### Failure path

On save failure:
- `st.submitLocked = false`
- Button restored with correct mode-specific label:
  - Emergency → `"Trouver un artisan maintenant"` (amber)
  - Standard  → `"Envoyer ma demande"` (indigo)
- User can retry immediately

### Double-submit guard

`st.submitLocked = true` is set synchronously before any async work. A second tap within 1 600 ms is rejected. `_btnLoading(btn)` disables the DOM button immediately. The guard persists for the lifetime of the request (reset at interstitial start: `st.submitLocked = false` at 820 ms).

### Deduplication

`_saveRequest` inspects the last entry in `localStorage`. If `problem + city + phone` match and the timestamp delta is < 2 500 ms, the request is flagged `duplicated: true` and the existing entry is returned rather than a new one being written.

---

## 8. Frozen Files

The following files constitute RAFI V5 and are frozen at canonical commit `ac37d1e`:

| File | Role | Frozen version |
|---|---|---|
| `js/fx-request-flow-v4.js` | Engine — full state machine, all screens, submit logic | `fxrf4-v5a1` |
| `css/fx-request-flow-v4.css` | All visual styling for the flow | `fxrf4-v5z` |
| `index.html` | Cache-bust references | `?v=fxrf4-v5a1` (JS) / `?v=fxrf4-v5z` (CSS) |

### Locked namespaces

- **`fxrf4-*`** — all CSS classes and JS identifiers in the flow
- **`window.FIXEO_FLOW_V4`** — feature flag; `false` disables V5 entirely
- **`window.FixeoRequestFlowV4`** — public API object
- **`#fxrf4-root`** — DOM root; always appended to `<html>`, never to `<body>`

### Locked behaviours (must never change without explicit approval)

| Behaviour | Locked value / rule |
|---|---|
| `body.style.position` | NEVER set in scroll lock |
| `#fxrf4-root` parent | Always `document.documentElement` |
| Avatar breathe period | 4.8 s |
| Avatar breathe opacity | `0.72 → 0.94` |
| `mode: 'express'` | Always aliased to `'emergency'` inside `open()` |
| Emergency urgency value | `"Urgent (moins de 30 min)"` — pre-locked, never UI-selectable |
| Emergency urgency DOM | Never built (`urgencySection = null`) |
| Emergency amber accent | `rgba(234, 137, 54, ...)` — no red anywhere |
| City tap auto-advance (emergency) | 200 ms — single tap confirms + advances |
| Keyboard threshold | `kbInset > 60 px` |
| Progress fill full opacity | Always full opacity (both modes) |
| Close button border-radius | `50%` |
| Step 1 never auto-advances | Hero prefill pre-selects chip visually only |
| Step 2 always renders fully | No auto-skip in standard mode |
| MSG strings with apostrophes | Double-quoted strings only |
| `"Voir mes demandes"` destination | `/dashboard-client.html#requests` |

---

## 9. Rules for Future Modifications

RAFI V5 may only be modified for:

1. **Verified bugs** — reproducible functional failure in a supported browser
2. **Regressions** — behaviour broken by a change elsewhere in the codebase
3. **Accessibility** — WCAG compliance, screen reader compatibility, focus management
4. **Performance** — measurable improvement to LCP, FID, or memory footprint
5. **Explicitly approved functional extensions** — new mode, new step, new CTA variant, approved by product owner before implementation

The following are **not** sufficient reasons to modify frozen files:

- Visual preference changes without product approval
- Refactoring "for cleanliness"
- Copy changes without explicit instruction
- Adding analytics events without confirming they don't affect payload or flow
- CSS polish that touches layout or animation values locked above

### Modification protocol

1. State the finding category (bug / regression / accessibility / performance / approved extension)
2. Identify the exact file, function, and line number
3. Describe the minimal change required
4. Run the full regression checklist (Section 10) after the change
5. Bump the minor version suffix: `v5a1 → v5a2 → v5b1` etc.
6. Update cache-bust in `index.html`
7. Commit with prefix `fix(flow):` or `feat(flow):` and version tag

---

## 10. Regression Checklist

Run in full before committing any future change to the frozen files.

### A. Emergency mode — all 7 situations

- [ ] 💧 Fuite d'eau — chip tap → ack "Compris." → city step
- [ ] ⚡ Plus de courant — chip tap → ack "Je comprends." → city step
- [ ] 🔐 Bloqué dehors — chip tap → ack "D'accord." → city step
- [ ] 🚿 WC/évier — chip tap → ack "Compris." → city step
- [ ] ❄️ Climatiseur — chip tap → ack "Compris." → city step
- [ ] 🚪 Porte/fenêtre — chip tap → ack "D'accord." → city step
- [ ] ⚠️ Autre urgence — card expands, RAFI line visible, input focusable on iOS Safari
- [ ] Autre urgence — disabled below 3 chars, enabled at 3+ chars
- [ ] Autre urgence — description and serviceLabel both carry user text in payload
- [ ] No urgency section appears at any point in emergency mode

### B. Standard mode — all 10 services + "Autre chose"

- [ ] All 10 category chips auto-advance to city step
- [ ] "Autre chose" expand + text input + confirm advances to city step
- [ ] "Autre chose" — `p.service = "autre"`, `p.problem = user text`, `p.description = user text`
- [ ] City step reveals timing section on city tap (not before)
- [ ] All 3 timing options store correct `urgency` value
- [ ] Standard success copy (not emergency copy) shown

### C. Shared city screen (both modes)

- [ ] Detected city shows `.is-detected` full-width card
- [ ] Tapping detected city advances (emergency: step 3 / standard: timing)
- [ ] "Autre ville →" reveals `<select>` with all 20 cities
- [ ] Selecting city from `<select>` advances correctly per mode
- [ ] Back from step 3: city chip still shows `.is-selected`
- [ ] Back from step 3 (standard): timing section auto-revealed, previous selection pre-selected

### D. Phone screen (both modes)

- [ ] No prefix/input overlap at 320 px, 375 px, 390 px
- [ ] Prefix `🇲🇦 +212` renders at correct opacity and spacing
- [ ] Valid Moroccan number: button enables, check icon appears
- [ ] Invalid number: button remains disabled
- [ ] Submit with invalid number: error hint shown, focus returned to input
- [ ] Emergency: CTA is amber and reads "Trouver un artisan maintenant"
- [ ] Standard: CTA is indigo and reads "Envoyer ma demande"
- [ ] Phone value present in final payload

### E. Success screens

- [ ] Emergency: amber ring, emergency copy, emergency step labels
- [ ] Standard: teal ring, standard copy, standard step labels
- [ ] Emergency copy never shown in standard mode
- [ ] Standard copy never shown in emergency mode
- [ ] `tracking_ref` shown on success screen
- [ ] "Voir mes demandes" navigates to `/dashboard-client.html#requests`
- [ ] "Retour à l'accueil" navigates to `/index.html`

### F. Payload integrity

For at least one emergency predefined and one standard predefined submission:
- [ ] `service` = correct slug
- [ ] `problem` = correct label
- [ ] `description` = `""` (predefined — no free text)
- [ ] `urgency` = correct value for mode/timing choice
- [ ] `mode` = `"emergency"` or `"default"` as appropriate
- [ ] `source` = `"fxrf4-v5a1"` (or current freeze version)

For "Autre urgence" and "Autre chose" submissions:
- [ ] `service` = `"autre"`
- [ ] `problem` = user typed text
- [ ] `description` = user typed text (same as problem)

### G. State, back navigation, and reopening

- [ ] `close()` followed immediately by `open()`: fresh state, no stale DOM
- [ ] Emergency open → close → standard open: no `.is-emergency` class on RAFI name
- [ ] Double-tap submit: only one localStorage entry created
- [ ] Back from each step: previous step renders correctly
- [ ] Close while keyboard open: keyboard dismissed, scroll position restored
- [ ] Rapid Back/Continue: `_transitioning` guard prevents double-render

### H. Failure and edge cases

- [ ] localStorage unavailable (Private Browsing): button restores to correct label, no success screen
- [ ] Invalid phone submitted: no advance, error shown
- [ ] Rapid double-tap on submit: deduplication guard holds
- [ ] Swipe down > 80 px: closes modal
- [ ] Android back button: closes modal
- [ ] Escape key: closes modal

---

## Audit History

| Date | Auditor | Findings | Outcome |
|---|---|---|---|
| 2026-07-26 | RAFI V5 QA (pre-freeze) | 5 findings (F1–F5) | All resolved in `ac37d1e` |

| Finding | Severity | Description | Resolution |
|---|---|---|---|
| F1 | P1 | `st.description` never written in free-text paths | `st.description = val` added to `_confirmAutre` + `_confirmOther` |
| F2 | P2 | Timing section hidden after Back from step 3 | `setTimeout(_showUrgencyCards, 0)` when `st.city` already set |
| F3 | P2 | Failure CTA hardcoded to standard label in emergency mode | Mode-aware restore via `_failIsEmergency` |
| F4 | P3 | Stale `source: "fxrf4-v5p"` in payload | Updated to `"fxrf4-v5a1"` |
| F5 | P3 | Stale `VERSION: "fxrf4-v5p"` on public API | Updated to `"fxrf4-v5a1"` |

---

*This document is part of the Fixeo production repository. It describes frozen behaviour and must be updated whenever a modification to RAFI V5 is approved and deployed.*
