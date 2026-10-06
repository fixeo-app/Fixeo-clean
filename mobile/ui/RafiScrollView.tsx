import { createContext, forwardRef, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Dimensions, ScrollView, View, type ScrollViewProps } from 'react-native';
import { rafiIntersectsViewport } from './rafiPresence';

type Viewport = { subscribe: (fn: () => void) => () => void; measure: (fn: (top: number, bottom: number) => void) => void };
const RafiViewport = createContext<Viewport | null>(null);

/** At most ~6 visibility measurements/sec while scrolling, no frame loop or timer. */
export const RafiScrollView = forwardRef<ScrollView, ScrollViewProps>(function RafiScrollView(props, forwarded) {
  const scroll = useRef<ScrollView | null>(null);
  const listeners = useRef(new Set<() => void>()).current;
  const notify = () => listeners.forEach(fn => fn());
  const viewport = useMemo<Viewport>(() => ({
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    measure(fn) { scroll.current?.getNativeScrollRef()?.measureInWindow((_x, y, _w, h) => fn(y, y + h)); },
  }), [listeners]);
  return <RafiViewport.Provider value={viewport}><ScrollView {...props}
    ref={value => { scroll.current = value; if (typeof forwarded === 'function') forwarded(value); else if (forwarded) forwarded.current = value; }}
    scrollEventThrottle={Math.max(160, props.scrollEventThrottle || 0)}
    onScroll={event => { notify(); props.onScroll?.(event); }}
    onLayout={event => { notify(); props.onLayout?.(event); }}
    onContentSizeChange={(w, h) => { notify(); props.onContentSizeChange?.(w, h); }}
  /></RafiViewport.Provider>;
});

export function useRafiViewport(ref: RefObject<View | null>, enabled: boolean) {
  const viewport = useContext(RafiViewport);
  const [visible, setVisible] = useState(false);
  const [measured, setMeasured] = useState(false);
  const measure = useRef(() => {});
  useEffect(() => {
    if (!enabled) { setVisible(false); return; }
    let alive = true;
    const inspect = () => {
      const compare = (top: number, bottom: number) => ref.current?.measureInWindow((_x, y, _w, h) => {
        if (alive) { setMeasured(true); setVisible(previous => { const next = rafiIntersectsViewport(y, h, top, bottom); return next === previous ? previous : next; }); }
      });
      if (viewport) viewport.measure(compare); else compare(0, Dimensions.get('window').height);
    };
    measure.current = inspect; inspect();
    const unsubscribe = viewport?.subscribe(inspect);
    const dimensions = Dimensions.addEventListener('change', inspect);
    return () => { alive = false; measure.current = () => {}; unsubscribe?.(); dimensions.remove(); };
  }, [ref, enabled, viewport]);
  return { visible, measured, onLayout: () => measure.current() };
}
