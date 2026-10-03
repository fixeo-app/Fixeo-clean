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
