/** P1–P7 compatibility exports. Keep their values stable until each screen migrates. */
export const colors = {
  ink: '#0B0B0C',
  inkSoft: '#2A2A2D',
  paper: '#F7F7F5',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F0EE',
  line: '#E2E2DE',
  text: '#0B0B0C',
  textMuted: '#6C6C70',
  inverse: '#FFFFFF',
  success: '#17643A',
  warning: '#8A5A00',
  danger: '#A92D28',
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
  xxl: 40,
} as const;

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  pill: 999,
} as const;

export const type = {
  eyebrow: 12,
  body: 16,
  bodyLarge: 18,
  title: 32,
  display: 42,
} as const;

export const motion = {
  fast: 160,
  normal: 240,
  slow: 520,
} as const;

/** DS2 · Luxury Calm Tech. Roles describe intent, not a particular screen. */
export const semanticColors = {
  background: {
    canvas: colors.paper,
    surface: colors.surface,
    raised: colors.surface,
    subtle: colors.surfaceMuted,
    focus: colors.ink,
    inverse: colors.ink,
  },
  text: {
    primary: colors.text,
    secondary: '#55555B',
    tertiary: '#68686D',
    inverse: colors.inverse,
    inverseSecondary: '#C5C5CA',
    disabled: '#78787E',
  },
  border: {
    subtle: colors.line,
    hairline: '#EBEBE7',
    strong: '#79797F',
    focus: '#365AC7',
    inverse: '#56565D',
  },
  status: {
    success: { text: colors.success, surface: '#EDF6EF', border: '#8AAE96' },
    warning: { text: '#795000', surface: '#FFF5DF', border: '#B49450' },
    danger: { text: colors.danger, surface: '#FCEFED', border: '#C18C88' },
    information: { text: '#285B91', surface: '#EDF3FA', border: '#8BA5C2' },
  },
  interaction: {
    transparent: 'transparent',
    pressed: '#E8E8E4',
    disabled: '#E5E5E1',
    selected: '#E9EEF9',
    selectedText: '#284D9C',
  },
} as const;

// Widen color values so a future theme can implement the same semantic contract.
type ColorRoles<T> = { [K in keyof T]: T[K] extends string ? string : ColorRoles<T[K]> };
export type SemanticColorTokens = ColorRoles<typeof semanticColors>;

/** Native system fonts; no font download. Sizes scale with the OS text setting. */
export const typography = {
  display: { fontSize: 42, lineHeight: 48, fontWeight: '600', letterSpacing: -1.2 },
  hero: { fontSize: 36, lineHeight: 42, fontWeight: '600', letterSpacing: -0.9 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '600', letterSpacing: -0.6 },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.3 },
  bodyLarge: { fontSize: 18, lineHeight: 27, fontWeight: '400', letterSpacing: 0 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400', letterSpacing: 0 },
  supporting: { fontSize: 14, lineHeight: 20, fontWeight: '400', letterSpacing: 0 },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '500', letterSpacing: 0.1 },
  eyebrow: { fontSize: 12, lineHeight: 18, fontWeight: '600', letterSpacing: 1.2 },
} as const;
export type TypographyRole = keyof typeof typography;
export const typographyUsage: Record<TypographyRole, string> = {
  display: 'One short focal statement per canvas; never a list heading.',
  hero: 'Screen entry and situation summary.',
  title: 'Primary screen title.',
  heading: 'Section or decision title.',
  bodyLarge: 'Short introductory explanation.',
  body: 'Reading, forms and action labels.',
  supporting: 'Secondary explanation and metadata.',
  caption: 'Dates, counts and brief annotations; not essential instructions.',
  eyebrow: 'Short section orientation; never a paragraph.',
};

/** Four-point grid for new layouts. Legacy spacing above remains unchanged. */
export const space = { none: 0, hair: 2, xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48, hero: 64 } as const;
export const layout = {
  control: { gap: space.xs, paddingX: space.lg, paddingY: space.md },
  component: { gap: space.sm, padding: space.lg },
  section: { gap: space.xl },
  screen: { gutter: space.lg, edge: space.md, bottom: space.xxl, maxContentWidth: 640 },
  floating: { gap: space.sm, minHeight: 64 },
} as const;

export const radii = { control: 18, card: 24, sheet: 30, floating: 24, pill: 999 } as const;
/** Elevation is opt-in, never a substitute for hierarchy. */
export const depth = {
  flat: {},
  raised: { shadowColor: colors.ink, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  floating: { shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
} as const;

export const interaction = {
  minTarget: 48,
  actionHeight: 58,
  focusWidth: 2,
  pressedOpacity: 0.88,
  pressedScale: 0.985,
  disabledOpacity: 1,
} as const;

export const motionTokens = {
  instant: { duration: 0, easing: 'linear', reduced: 'instant' },
  micro: { duration: 100, easing: 'standard', reduced: 'instant' },
  control: { duration: 160, easing: 'standard', reduced: 'instant' },
  transition: { duration: 240, easing: 'standard', reduced: 'instant' },
  reveal: { duration: 360, easing: 'enter', reduced: 'instant' },
  orchestration: { duration: 520, easing: 'enter', reduced: 'instant' },
} as const;
export const motionGeometry = {
  reveal: { translateY: 8, scale: 0.992 },
  orchestration: { translateY: 10, scale: 1 },
} as const;
/** RAFI V2 — one material, independent from semantic status colors. */
export const rafiVisualTokens = {
  core: '#08090B', graphite: '#26272A', graphiteLight: '#454548',
  rim: '#71706D', deepRim: '#161719', champagne: '#C6AE84',
  signature: '#F3E1BA', signatureGlow: 'rgba(218,189,139,0.18)',
  highlight: 'rgba(255,247,229,0.14)', highlightClear: 'rgba(255,247,229,0)',
  haloOuter: 'rgba(198,174,132,0.035)', haloMiddle: 'rgba(198,174,132,0.055)',
  haloInner: 'rgba(198,174,132,0.10)', orbit: 'rgba(198,174,132,0.38)',
  transparent: 'transparent',
  /** The master texture already carries its illuminated rim; only a quiet external breath remains. */
  masterHalo: {
    medium: { haloOuter: 'rgba(198,174,132,0.035)', haloMiddle: 'rgba(198,174,132,0.050)', haloInner: 'rgba(198,174,132,0.070)' },
    hero: { haloOuter: 'rgba(198,174,132,0.045)', haloMiddle: 'rgba(198,174,132,0.065)', haloInner: 'rgba(198,174,132,0.090)' },
  },
  /** Optical finish only. Compact retains the certified palette above. */
  finish: {
    graphiteLight: '#57595C', graphite: '#26282C', rim: '#A29E94', deepRim: '#242629',
    signature: '#FBE8BD', signatureGlow: 'rgba(231,195,130,0.30)',
    bounce: 'rgba(209,175,117,0.18)',
    medium: {
      haloOuter: 'rgba(198,174,132,0.060)', haloMiddle: 'rgba(198,174,132,0.085)', haloInner: 'rgba(198,174,132,0.13)',
      specular: 'rgba(255,237,207,0.38)', arcWidth: 0.36, arcHeight: 0.19, arcStroke: 0.023,
    },
    hero: {
      haloOuter: 'rgba(198,174,132,0.080)', haloMiddle: 'rgba(198,174,132,0.11)', haloInner: 'rgba(198,174,132,0.16)',
      specular: 'rgba(255,237,207,0.54)', arcWidth: 0.39, arcHeight: 0.19, arcStroke: 0.025,
    },
  },
} as const;
export const rafiMotionTokens = {
  idle: { breathDuration: 3600, orbitDuration: 0 },
  listening: { breathDuration: 1800, orbitDuration: 0 },
  understanding: { breathDuration: 2600, orbitDuration: 0 },
  working: { breathDuration: 1500, orbitDuration: 0 },
  matching: { breathDuration: 6000, orbitDuration: 12000 },
  intervention: { breathDuration: 4800, orbitDuration: 0 },
  success: { breathDuration: 3600, orbitDuration: 0 },
  attention: { breathDuration: 4000, orbitDuration: 0 },
  easing: { breath: 'breathe', orbit: 'linear', successIn: 'enter', successOut: 'breathe' },
  completion: { delay: 0, enter: 280, exit: 600 },
  reduced: 'static',
} as const;

export const iconography = {
  family: 'Ionicons',
  sizes: { small: 16, standard: 20, action: 24 },
} as const;
