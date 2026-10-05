import { motionTokens } from './tokens';

/** Unknown OS preference must be treated as reduced motion. */
export function resolveMotion(preset: keyof typeof motionTokens, reduceMotion: boolean, delay = 0) {
  const token = motionTokens[preset];
  return {
    duration: reduceMotion ? 0 : token.duration,
    delay: reduceMotion || token.duration === 0 ? 0 : Math.max(0, Number.isFinite(delay) ? delay : 0),
    easing: token.easing,
  };
}

export type MotionPreferenceSource = {
  read: () => Promise<boolean>;
  listen: (listener: (value: boolean) => void) => () => void;
};

/** One native listener shared by all primitives; no initial animation flash. */
export function createMotionPreferenceStore(source: MotionPreferenceSource) {
  let reduced = true;
  let generation = 0;
  let stop: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (value: boolean) => {
    if (reduced === value) return;
    reduced = value;
    listeners.forEach(listener => listener());
  };

  return {
    getSnapshot: () => reduced,
    getServerSnapshot: () => true,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        const request = ++generation;
        let receivedEvent = false;
        stop = source.listen(value => {
          if (generation !== request) return;
          receivedEvent = true;
          publish(value);
        });
        void source.read().then(value => {
          if (generation === request && !receivedEvent) publish(value);
        }).catch(() => { /* Keep static UI when native preference is unavailable. */ });
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          ++generation;
          stop?.();
          stop = undefined;
          reduced = true;
        }
      };
    },
  };
}
