import { rafiMotionTokens } from './tokens';

export type RafiOrbMode = 'idle' | 'listening' | 'working' | 'success';

export type RafiOrbMotion = {
  breathDuration: number;
  orbitDuration: number;
  coreScale: [number, number];
  haloScale: [number, number];
  haloOpacity: [number, number];
  ringOpacity: number;
  orbitOpacity: number;
};

const MOTION: Record<RafiOrbMode, RafiOrbMotion> = {
  idle: {
    ...rafiMotionTokens.idle,
    coreScale: [0.985, 1.025],
    haloScale: [0.96, 1.045],
    haloOpacity: [0.28, 0.42],
    ringOpacity: 0.36,
    orbitOpacity: 0.52,
  },
  listening: {
    ...rafiMotionTokens.listening,
    coreScale: [0.97, 1.055],
    haloScale: [0.94, 1.08],
    haloOpacity: [0.34, 0.58],
    ringOpacity: 0.52,
    orbitOpacity: 0.82,
  },
  working: {
    ...rafiMotionTokens.working,
    coreScale: [0.955, 1.075],
    haloScale: [0.92, 1.11],
    haloOpacity: [0.4, 0.68],
    ringOpacity: 0.62,
    orbitOpacity: 0.9,
  },
  success: {
    ...rafiMotionTokens.success,
    coreScale: [1, 1.045],
    haloScale: [0.98, 1.16],
    haloOpacity: [0.36, 0.62],
    ringOpacity: 0.42,
    orbitOpacity: 0.36,
  },
};

export function getRafiOrbMotion(mode: RafiOrbMode): RafiOrbMotion {
  return MOTION[mode];
}

export function getRafiOrbAccessibilityLabel(mode: RafiOrbMode) {
  return ({
    idle: 'RAFI prêt',
    listening: 'RAFI écoute',
    working: 'RAFI analyse',
    success: 'RAFI a terminé',
  } as const)[mode];
}
