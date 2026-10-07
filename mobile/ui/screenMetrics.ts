import { layout, spacing } from './tokens';

type Insets = { top: number; bottom: number; left: number; right: number };
type Options = {
  padded?: boolean;
  floatingHeight?: number;
  /** Height obscuring the content, not the raw keyboard screen height. */
  keyboardOverlap?: number;
};
const nonNegative = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

/** Default reproduces FixeoScreen P1–P7; floating/keyboard reservation is opt-in.
 * One owner per inset: don't combine keyboardOverlap with KeyboardAvoidingView.
 */
export function getScreenMetrics(insets: Insets, { padded = true, floatingHeight = 0, keyboardOverlap = 0 }: Options = {}) {
  const bottomSafe = Math.max(nonNegative(insets.bottom), layout.screen.edge);
  const keyboard = nonNegative(keyboardOverlap);
  const floating = nonNegative(floatingHeight);
  const floatingBottom = Math.max(bottomSafe, keyboard) + layout.floating.gap;
  return {
    paddingTop: Math.max(nonNegative(insets.top), layout.screen.edge),
    paddingBottom: floating ? floatingBottom + floating + Math.max(24, layout.floating.gap) : Math.max(bottomSafe, keyboard),
    paddingLeft: Math.max(nonNegative(insets.left), padded ? spacing.lg : 0),
    paddingRight: Math.max(nonNegative(insets.right), padded ? spacing.lg : 0),
    floatingBottom,
  };
}
