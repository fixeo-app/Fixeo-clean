import { rafiMotionTokens } from './tokens';
import { RAFI_LABELS, canonicalRafiState, type RafiPresenceState } from './rafiPresence';
export type RafiOrbMode = RafiPresenceState;
export type RafiOrbMotion = {
  breathDuration: number; orbitDuration: number;
  coreScale: [number, number]; haloScale: [number, number]; haloOpacity: [number, number];
  signatureScale: [number, number]; signatureLift: number; orbitOpacity: number;
  lift: number; reflection: number;
};
const profiles = {
  idle: { coreScale: [1, 1.009], haloScale: [1, 1.025], haloOpacity: [0.55, 0.69], signatureScale: [1, 1.012], lift: -0.006, reflection: 0.12 },
  listening: { coreScale: [1, 1.017], haloScale: [1, 1.045], haloOpacity: [0.66, 0.84], signatureScale: [1, 1.035], lift: -0.004, reflection: 0.17 },
  thinking: { coreScale: [1, 0.994], haloScale: [1.015, 1], haloOpacity: [0.62, 0.76], signatureScale: [1, 0.985], lift: -0.003, reflection: 0.22 },
  speaking: { coreScale: [1, 1.014], haloScale: [1, 1.034], haloOpacity: [0.63, 0.79], signatureScale: [1, 1.025], lift: -0.002, reflection: 0.15 },
  success: { coreScale: [1, 1.02], haloScale: [1, 1.075], haloOpacity: [0.55, 0.88], signatureScale: [1, 1.05], lift: -0.005, reflection: 0.26 },
  attention: { coreScale: [1, 1.003], haloScale: [1, 1.012], haloOpacity: [0.43, 0.50], signatureScale: [1, 1.004], lift: -0.002, reflection: 0.06 },
} as const;
export function getRafiOrbMotion(mode: RafiOrbMode, size = 96, reduced = false, subtle = false): RafiOrbMotion {
  const state = canonicalRafiState(mode), p = profiles[state];
  const amount = (size <= 58 ? 0.22 : size < 96 ? 0.65 : 1) * (subtle ? 0.4 : 1);
  const scale = (pair: readonly [number, number]): [number, number] => reduced ? [1, 1] : pair.map(x => 1 + (x - 1) * amount) as [number, number];
  return { ...rafiMotionTokens[mode], orbitDuration: 0, orbitOpacity: 0, signatureLift: 0,
    breathDuration: reduced ? 6500 : rafiMotionTokens[mode].breathDuration * (subtle ? 1.25 : 1),
    coreScale: scale(p.coreScale), haloScale: scale(p.haloScale), signatureScale: scale(p.signatureScale),
    haloOpacity: [p.haloOpacity[0], p.haloOpacity[0] + (reduced ? 0.025 : (p.haloOpacity[1] - p.haloOpacity[0]) * amount)],
    lift: reduced ? 0 : p.lift * amount, reflection: reduced ? 0 : p.reflection * amount,
  };
}
export function getRafiOrbAccessibilityLabel(mode: RafiOrbMode) { return RAFI_LABELS[mode]; }
