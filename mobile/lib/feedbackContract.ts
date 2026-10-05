export type FixeoFeedbackKind = 'selection' | 'impact' | 'success' | 'warning' | 'error' | 'none';

/** Semantic intent, not navigation decoration. Android vibration is a fallback,
 * not a promise of native iOS selection/impact haptics. No new dependency in W1.
 */
export const feedbackContract = {
  minimumInterval: 70,
  usage: {
    none: 'Ordinary navigation, typing, opening a menu; default for actions.',
    selection: 'Explicit deliberate mode/option selection, when useful.',
    impact: 'A meaningful transition into an intervention.',
    success: 'Only after an operation has actually succeeded.',
    warning: 'A new actionable warning, once.',
    error: 'An operation rejected, once; never a polling loop.',
  },
  android: {
    selection: 8,
    impact: 16,
    success: [0, 18, 55, 24],
    warning: [0, 28, 70, 28],
    error: [0, 35, 55, 35, 55, 35],
  } satisfies Record<Exclude<FixeoFeedbackKind, 'none'>, number | number[]>,
};
