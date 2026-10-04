/** Presentation only. No requests, mission transitions, haptics or timers here. */
export const RAFI_STATES = ['idle', 'listening', 'understanding', 'working', 'matching', 'intervention', 'success', 'attention'] as const;
export type RafiPresenceState = typeof RAFI_STATES[number];
export type RafiSettleState = Exclude<RafiPresenceState, 'success'>;
export type LegacyRafiMode = 'idle' | 'listening' | 'working' | 'success';
export const RAFI_LABELS: Record<RafiPresenceState, string> = {
  idle: 'RAFI est prêt', listening: 'RAFI écoute', understanding: 'RAFI comprend votre demande',
  working: 'RAFI travaille', matching: 'FIXEO recherche un artisan', intervention: 'Intervention en cours',
  success: 'RAFI a terminé cette étape', attention: 'Une action demande votre attention',
};
export function fromLegacyRafiMode(mode: LegacyRafiMode): RafiPresenceState { return mode; }

export function getClientRafiPresence(input: {
  override?: RafiPresenceState | null; loopState?: string; journeyStatus?: string;
  photoDiagnosticBusy?: boolean; safetyStop?: boolean;
}): RafiPresenceState {
  if (input.override === 'listening') return 'listening';
  if (input.photoDiagnosticBusy || input.override === 'understanding') return 'understanding';
  if (input.override) return input.override;
  if (input.safetyStop || input.loopState === 'error') return 'attention';
  if (input.loopState === 'creating') return 'working';
  if (input.journeyStatus === 'completed') return 'attention';
  if (input.journeyStatus === 'in_progress') return 'intervention';
  if (input.journeyStatus === 'assigned') return 'success';
  if (input.journeyStatus === 'matching' || input.loopState === 'matching') return 'matching';
  if (input.loopState === 'understanding') return 'understanding';
  if (input.loopState === 'confirm') return 'attention';
  return 'idle';
}

export function getArtisanRafiPresence(input: {
  missionStatus?: string | null; offersCount: number; accepting?: boolean; loadError?: boolean;
}): RafiPresenceState {
  if (input.accepting) return 'working';
  if (input.loadError) return 'attention';
  if (input.missionStatus === 'completed') return 'attention';
  if (input.missionStatus === 'in_progress') return 'intervention';
  if (input.missionStatus === 'assigned') return 'attention';
  if (input.offersCount > 0) return 'attention';
  return 'idle';
}

/** Consume a success entry even when motion is unavailable: focus/resume must not replay it. */
export function createRafiSuccessLatch() {
  let current: string | undefined;
  return {
    enter(mode: RafiPresenceState, eventKey: string, canAnimate: boolean) {
      if (mode !== 'success') { current = undefined; return false; }
      if (current === eventKey) return false;
      current = eventKey;
      return canAnimate;
    },
  };
}

export function getRafiGeometry(requestedSize: number) {
  const size = Number.isFinite(requestedSize) ? Math.min(192, Math.max(32, requestedSize)) : 96;
  const compact = size <= 58;
  return { size, compact, frame: size * (compact ? 1.25 : 1.5), halo: size * (compact ? 1.14 : 1.24) };
}

export type ActivitySource = { read: () => boolean; listen: (listener: (active: boolean) => void) => () => void };
/** One application subscription regardless of mounted Orbs; inactive until a subscriber exists. */
export function createRafiActivityStore(source: ActivitySource) {
  const listeners = new Set<() => void>();
  let active = false;
  let stop: (() => void) | undefined;
  return {
    getSnapshot: () => active, getServerSnapshot: () => false,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        active = source.read();
        stop = source.listen(value => {
          if (value === active) return;
          active = value; listeners.forEach(notify => notify());
        });
      }
      return () => { listeners.delete(listener); if (!listeners.size) { stop?.(); stop = undefined; active = false; } };
    },
  };
}
