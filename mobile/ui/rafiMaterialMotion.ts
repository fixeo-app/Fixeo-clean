import { canonicalRafiState, type RafiPresenceState } from './rafiPresence';

export type MaterialFrame = { time: number; flow: number; breath: number; tension: number; touch: number; x: number; y: number };
export type FrameScheduler = { request: (callback: (now: number) => void) => number; cancel: (id: number) => void };
export function materialFrame(time: number, flow: number, tension: number, touchedAt: number, x: number, y: number, compact: boolean): MaterialFrame {
  const age = time - touchedAt;
  const contact = age >= 0 && age < 2.6 ? (1 - Math.exp(-age * 22)) * Math.exp(-age * 2.1) : 0;
  return { time, flow, tension, breath: (Math.sin(time * Math.PI * 2 / 9.7) + 0.24 * Math.sin(time * 0.417 + 0.8)) * (compact ? 0.004 : 0.011),
    touch: contact, x, y };
}
/** Clock and contact live outside React. Pauses preserve phase; no catch-up jump. */
export function createMaterialMotion(scheduler: FrameScheduler, draw: (frame: MaterialFrame) => void, compact = false) {
  let id: number | null = null, disposed = false, enabled = false, reduced = false;
  let time = 0, flow = 0, last: number | null = null, lastDraw = -Infinity;
  let tension = 1, target = 1, touchedAt = -10, x = 0, y = 0;
  const frame = () => materialFrame(time, flow, tension, touchedAt, x, y, compact);
  const stop = () => { if (id !== null) scheduler.cancel(id); id = null; last = null; };
  const tick = (now: number) => {
    id = null;
    if (disposed || !enabled || reduced) return;
    const dt = last === null ? 0 : Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now; time += dt; tension += (target - tension) * (1 - Math.exp(-dt * 1.7));
    flow += dt * tension;
    if (now - lastDraw >= (compact ? 1000 / 24 : 1000 / 30)) { draw(frame()); lastDraw = now; }
    if (!disposed && enabled && !reduced) id = scheduler.request(tick);
  };
  return {
    setMode(mode: RafiPresenceState, subtle = false) {
      const state = canonicalRafiState(mode);
      target = (state === 'listening' ? 1.18 : state === 'thinking' ? 1.13 : state === 'speaking' ? 1.10 : 1) * (subtle ? 0.82 : 1);
    },
    setActivity(active: boolean, reduceMotion: boolean) {
      if (disposed) return;
      enabled = active; reduced = reduceMotion;
      if (!enabled || reduced) { stop(); touchedAt = -10; if (enabled) draw(frame()); }
      else if (id === null) { lastDraw = -Infinity; id = scheduler.request(tick); }
    },
    touch(px: number, py: number) {
      if (disposed || !enabled || reduced) return;
      x = Math.max(-1, Math.min(1, px)); y = Math.max(-1, Math.min(1, py)); touchedAt = time - 0.012;
      draw(frame());
    },
    snapshot: frame,
    dispose() { disposed = true; enabled = false; stop(); },
  };
}
