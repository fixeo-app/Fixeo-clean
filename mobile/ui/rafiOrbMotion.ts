import { rafiMotionTokens } from './tokens';
import { RAFI_LABELS, type RafiPresenceState } from './rafiPresence';
/** Additive API: all four legacy modes remain valid. */
export type RafiOrbMode = RafiPresenceState;
export type RafiOrbMotion = {
  breathDuration: number; orbitDuration: number;
  coreScale: [number, number]; haloScale: [number, number]; haloOpacity: [number, number];
  signatureScale: [number, number]; signatureLift: number; orbitOpacity: number;
};
const MOTION: Record<RafiOrbMode, RafiOrbMotion> = {
  idle: { ...rafiMotionTokens.idle, coreScale: [1, 1.012], haloScale: [1, 1.03], haloOpacity: [0.55, 0.7], signatureScale: [1, 1.015], signatureLift: 0, orbitOpacity: 0 },
  listening: { ...rafiMotionTokens.listening, coreScale: [1, 1.022], haloScale: [1, 1.06], haloOpacity: [0.7, 0.94], signatureScale: [1.04, 1.10], signatureLift: -0.01, orbitOpacity: 0 },
  understanding: { ...rafiMotionTokens.understanding, coreScale: [1, 0.987], haloScale: [1.03, 1], haloOpacity: [0.7, 0.86], signatureScale: [0.94, 0.90], signatureLift: -0.02, orbitOpacity: 0 },
  working: { ...rafiMotionTokens.working, coreScale: [1, 1.018], haloScale: [1, 1.05], haloOpacity: [0.72, 0.95], signatureScale: [1, 1.025], signatureLift: 0, orbitOpacity: 0 },
  matching: { ...rafiMotionTokens.matching, coreScale: [1, 1.008], haloScale: [1, 1.03], haloOpacity: [0.65, 0.85], signatureScale: [1, 1.015], signatureLift: 0, orbitOpacity: 0.7 },
  intervention: { ...rafiMotionTokens.intervention, coreScale: [1, 1.004], haloScale: [1, 1.012], haloOpacity: [0.42, 0.50], signatureScale: [1, 1], signatureLift: 0, orbitOpacity: 0 },
  success: { ...rafiMotionTokens.success, coreScale: [1, 1.035], haloScale: [1, 1.12], haloOpacity: [0.65, 1], signatureScale: [1, 1.10], signatureLift: 0, orbitOpacity: 0 },
  attention: { ...rafiMotionTokens.attention, coreScale: [1, 1.008], haloScale: [1.02, 1.035], haloOpacity: [0.86, 0.98], signatureScale: [1.02, 1.04], signatureLift: -0.006, orbitOpacity: 0 },
};
export function getRafiOrbMotion(mode: RafiOrbMode): RafiOrbMotion { return MOTION[mode]; }
export function getRafiOrbAccessibilityLabel(mode: RafiOrbMode) { return RAFI_LABELS[mode]; }
