# FIXEO Design System V2 — W1 Foundation

Direction: **Luxury Calm Tech**. Complexity stays behind the experience; hierarchy makes the next useful action obvious. This foundation supports W2–W8 without rebuilding the certified P1–P7 screens.

## Entry audit

Repository `fixeo-app/Fixeo-clean`; parent branch `feat/fixeo-mobile-m4-terrain`; checkpoint `506979aba8e2745747a599cd763c667d8b95ab0c`.

Reviewed the tokens, Action/Card/Screen primitives, MotionReveal, MobileShell, WorkspaceShortcutGrid, ContextualCockpitCard, EntryStage, RafiOrb and its motion model; route layout, sign-in, Client and Artisan workspaces; mobile package and Expo configuration; feedback contract and existing tests. There is no root package.json or AGENTS.md at this checkpoint. Mobile commands run inside `mobile/`.

Findings:

- 131 `fontWeight: '900'` declarations and 112 literal font-size declarations across `mobile/app` and `mobile/components`. Repeated titles (34/38, 36/40), kickers (12/900), metadata and form styles lack shared roles.
- Existing tokens contain useful neutral colors but no semantic surface hierarchy, complete text scale, focus contract, depth levels or interaction state model.
- Card defaults put a border around every surface. Many screens repeat dark decision panels and inverse text colors. W1 preserves those screens; new Surface defaults to flat and unbordered.
- Action has a useful 58-point minimum but no default button role, busy/selected state contract or keyboard focus treatment; press scaling ignores Reduced Motion. Selection feedback runs on every default action.
- MotionReveal and RafiOrb duplicate OS preference subscriptions and initially assume animation is allowed. EntryStage always animates. Drawer durations and transforms are separate and remain a W2 migration item.
- Shell menu is 44×44; its right action is 40 high. Password visibility has no explicit target. These route/navigation migrations belong to W2/W4, not this foundation.
- Safe-area padding is repeated in Shell; Screen owns top/bottom only. KeyboardAvoidingView is already used by sign-in, and Android uses resize. A future dock must reserve its measured height without adding the keyboard inset twice.
- The haptic implementation is a best-effort Vibration fallback, not native semantic iOS haptics. The native runtime library set is unchanged.

## Token architecture

`ui/tokens.ts` remains the single entry point. Existing exports `colors`, `spacing`, `radius`, `type`, `motion` retain every value, protected by compatibility tests.

| Export | Contract |
| --- | --- |
| `semanticColors.background` | canvas, surface, raised, subtle, focus, inverse |
| `semanticColors.text` | primary, secondary, tertiary, inverse, inverseSecondary, disabled |
| `semanticColors.border` | subtle, hairline, strong, focus, inverse |
| `semanticColors.status` | success, warning, danger, information: text/surface/border triples |
| `semanticColors.interaction` | transparent, pressed, disabled, selected and selectedText |
| `typography`, `typographyUsage` | nine roles with size, line height, weight, tracking and intended use |
| `space`, `layout` | four-point grid plus 2-point optical adjustment; control/component/section/screen/floating metrics |
| `radii` | control 18, card 24, sheet 30, floating 24, pill 999 |
| `depth` | flat, raised, floating; opt-in subtle native shadows |
| `interaction` | minimum target 48; action default 58; focus/press state constants |
| `motionTokens`, `motionGeometry` | six durations/easing/reduction contracts and entrance distances |
| `rafiMotionTokens` | original per-state rhythm, completion timing and easing; static reduced behavior |
| `iconography` | Ionicons family and 16/20/24 size roles |

Black is reserved for a decision/focus surface and its primary action. Routine content belongs on canvas/surface/subtle. Raised uses the same white as surface, with opt-in depth providing separation. Borders need a structural purpose; status colors must always accompany meaningful text. Do not mix inverse text with a light surface.

`SemanticColorTokens` widens values while preserving semantic keys, so a future theme can implement the same interface. W1 is intentionally light-only; no theme provider or automatic dark-mode switching has been added.

## Typography

Use native system fonts. No downloaded font, weight 900, default truncation, or text-scale cap in the new Text primitive.

| Role | Size / line height | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| display | 42 / 48 | 600 | -1.2 | One focal statement |
| hero | 36 / 42 | 600 | -0.9 | Screen entry |
| title | 30 / 36 | 600 | -0.6 | Screen title |
| heading | 22 / 28 | 600 | -0.3 | Section or decision |
| bodyLarge | 18 / 27 | 400 | 0 | Introduction |
| body | 16 / 24 | 400 | 0 | Reading and forms |
| supporting | 14 / 20 | 400 | 0 | Secondary explanation |
| caption | 12 / 18 | 500 | 0.1 | Short metadata |
| eyebrow | 12 / 18 | 600 | 1.2 | Short orientation |

Controls use body metrics with 600 emphasis. Essential instructions use body/supporting, not caption. Allow multiline copy and flexible height before applying any explicit truncation. Native large-text behavior still needs the physical certification planned after W3.

## Primitives and compatibility

- `FixeoText`: TextProps plus `variant` and `tone`; no extra wrapper. Used by Action and available to later screen migrations.
- `FixeoSurface`: ViewProps plus semantic `tone`, `rounding`, `elevation`, `border`; flat and borderless by default. No forced padding.
- `FixeoCard`: compatibility facade over Surface, preserving `light/dark/muted`, 22 padding, 24 radius and existing borders.
- `FixeoAction`: existing label, variants, style callback and text-fitting props remain supported. Adds destructive/busy/busyLabel/selected; defaults to a button role; blocks disabled/busy presses; exposes native and Web accessibility states; includes visible focus and at least 48×48 touch area. Default height remains 58. Label is 600 rather than 800. Secondary outline is stronger for control recognition. Disabled colors replace whole-control opacity. Ordinary actions are now silent (`feedback="none"`); explicit semantic feedback remains available.
- `FixeoScreen`: preserves portrait padding and existing style overrides, protects side cutouts, and optionally reserves measured floating/keyboard space. It creates no dock and changes no route.
- `MotionReveal`: centralized timing/easing and one shared Reduced Motion preference. EntryStage reuses the orchestration preset without changing its typography or layout. RAFI reuses the same preference and its existing numeric rhythm; its appearance and mode model are unchanged.

No IconButton, StatusChip, Divider or Section library is introduced before a real migration consumes it. The icon contract is ready without eagerly loading a font or replacing every glyph.

```tsx
<FixeoSurface tone="surface" rounding="card" style={{ padding: layout.component.padding }}>
  <FixeoText variant="heading">Votre intervention</FixeoText>
  <FixeoText tone="secondary">Le prix est annoncé avant intervention.</FixeoText>
  <FixeoAction label="Continuer" busy={saving} busyLabel="Enregistrement…" onPress={save} />
</FixeoSurface>
```

Keep asynchronous operation guards in their existing business handlers; a UI busy state does not replace idempotence or server authority. Trigger success feedback only after actual success, not from the initial press.

## Motion and feedback

| Intent | Duration | Easing | Reduced Motion |
| --- | --- | --- | --- |
| instant | 0 ms | linear | immediate |
| micro | 100 ms | cubic in/out | immediate |
| control | 160 ms | cubic in/out | immediate |
| transition | 240 ms | cubic in/out | immediate |
| reveal | 360 ms | cubic out | visible immediately, no transform/delay |
| orchestration | 520 ms | cubic out | visible immediately, no transform/delay |
| RAFI expressive | original mode-specific durations | breathing / orbit / completion | static state; accessible label remains |

`useReducedMotion` shares one native listener across all consumers. Unknown/read-error state stays static. A newer event wins over a late query; the final subscriber releases the native listener. Reveal animations stop on cleanup. Press feedback retains opacity without scale when motion is reduced.

`lib/feedbackContract.ts` centralizes selection/impact/success/warning/error/none intent, existing Android patterns and the 70 ms throttle. Existing explicit feedback sites and iOS fallback behavior are preserved. Selection is silent on iOS; other intents use its generic vibration. Web is silent. No new vibration loop or provider is added.

Reanimated and Skia are not introduced. W3 should only reconsider the renderer after measuring its actual animation workload on the existing devices.

## Safe areas, keyboard and future dock

`getScreenMetrics` accepts actual top/bottom/left/right insets. Top/bottom preserve a minimum 16. `floatingHeight` must be the measured control height, including any text expansion. Its bottom offset is max(safe inset, keyboard overlap) + 12; content reserves that offset + measured height + 12. Without a floating control, content reserves only max(safe inset, keyboard overlap).

`keyboardOverlap` is only the area obscuring the already-laid-out content. Use exactly one keyboard owner: native resize, KeyboardAvoidingView, or this explicit overlap. Never pass the raw keyboard height on top of resize/KAV. The existing screens opt into neither new argument in W1.

## Icon strategy

Use the installed `@expo/vector-icons/Ionicons` with outline glyphs for ordinary navigation and a filled variant only when it communicates selection. Initial vocabulary: `menu-outline`, `close-outline`, `chevron-back-outline`, `chevron-forward-outline`, `mic-outline`, `camera-outline`, `checkmark-circle-outline`, `alert-circle-outline`. Load one family once in the future Shell; verify glyph names against the installed map. Keep a text label on the parent control and hide a decorative glyph from accessibility. Icon size is not touch size: any standalone icon action needs at least 48×48. W1 does not migrate Unicode arrows/status marks.

## Gates and boundaries

Tests protect legacy aliases, intended contrast pairings, typography bounds, busy/disabled semantics, reduced motion preference races and cleanup, press reduction, insets and dock/keyboard accounting. Real primitives are rendered through the installed React Native Web adapter in a separate Node fixture; components are not mocked. This covers rendering and accessible attributes, not device interaction or physical screen-reader certification.

`npm run test:contracts` uses `node --import tsx --test tests/*.test.ts`, preserving the suite while avoiding the tsx CLI's auxiliary IPC socket, which is unavailable in this execution environment. CI uses Node 20; local validation uses Node 24. Dependency ranges and Expo/app configuration are unchanged. As in existing CI, `npm install` generates the lockfile used by Expo Doctor; W1 does not add that generated dependency snapshot to the source diff.

Deferred work is explicit: Shell/drawer navigation and its old motion (W2), RAFI redesign (W3), screen-level typographic/spacing/glyph migrations (W4–W7), physical large-text/touch/keyboard/screen-reader certification (later device gate). No claim of whole-app accessibility certification is made by W1.

Reference contracts consulted:

- [React Native AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo): initial preference and change event.
- [Android accessibility controls](https://developer.android.com/guide/topics/ui/accessibility/apps): 48 dp touch target guidance.
- [W3C contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): supported text pairings tested at 4.5:1; focus pairings at 3:1.
