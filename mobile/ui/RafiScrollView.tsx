import { createContext, forwardRef, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Dimensions, Keyboard, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { rafiIntersectsViewport } from './rafiPresence';
import { focusedScrollDelta, keyboardGeometry } from './keyboardGeometry';

type Viewport = { subscribe: (fn: () => void) => () => void; measure: (fn: (top: number, bottom: number) => void) => void };
const RafiViewport = createContext<Viewport | null>(null);
type Field = RefObject<View | null>;
const KeyboardField = createContext<{ focus: (field: Field) => void; blur: (field: Field) => void; reveal: () => void } | null>(null);
export function useKeyboardField() { return useContext(KeyboardField); }

/** At most ~6 visibility measurements/sec while scrolling, no frame loop or timer. */
export const RafiScrollView = forwardRef<ScrollView, ScrollViewProps>(function RafiScrollView(props, forwarded) {
  const scroll = useRef<ScrollView | null>(null);
  const active = useRef<Field | null>(null), offset = useRef(0), keyboardTop = useRef<number | null>(null);
  const frame = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const mounted = useRef(true);
  const [overlap, setOverlap] = useState(0);
  const inspect = useRef(() => {});
  const fields = useMemo(() => {
    const reveal = () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => { frame.current = null; inspect.current(); });
    };
    return { reveal, focus: (field: Field) => { active.current = field; reveal(); },
      blur: (field: Field) => { if (active.current === field) active.current = null; } };
  }, []);
  inspect.current = () => {
    scroll.current?.getNativeScrollRef()?.measureInWindow((_x, y, _w, height) => {
      if (!mounted.current) return;
      const geometry = keyboardGeometry(y, height, keyboardTop.current);
      setOverlap(previous => previous === geometry.overlap ? previous : geometry.overlap);
      const field = active.current;
      if (!field || keyboardTop.current == null) return;
      field.current?.measureInWindow((_fx, fy, _fw, fh) => {
        if (!mounted.current || active.current !== field || keyboardTop.current == null) return;
        const delta = focusedScrollDelta(fy, fh, geometry.top, geometry.bottom);
        if (Math.abs(delta) > 1) scroll.current?.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
      });
    });
  };
  useEffect(() => {
    mounted.current = true;
    keyboardTop.current = Keyboard.metrics?.()?.screenY ?? null;
    const show = Keyboard.addListener('keyboardDidShow', event => { keyboardTop.current = event.endCoordinates.screenY; fields.reveal(); });
    const change = Keyboard.addListener('keyboardDidChangeFrame', event => { keyboardTop.current = event.endCoordinates.screenY; fields.reveal(); });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardTop.current = null; setOverlap(0); });
    return () => { mounted.current = false; active.current = null; show.remove(); change.remove(); hide.remove(); if (frame.current != null) cancelAnimationFrame(frame.current); };
  }, [fields]);
  const listeners = useRef(new Set<() => void>()).current;
  const notify = () => listeners.forEach(fn => fn());
  const viewport = useMemo<Viewport>(() => ({
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    measure(fn) { scroll.current?.getNativeScrollRef()?.measureInWindow((_x, y, _w, h) => fn(y, y + h)); },
  }), [listeners]);
  const container = StyleSheet.flatten(props.contentContainerStyle) || {};
  return <RafiViewport.Provider value={viewport}><KeyboardField.Provider value={fields}><ScrollView {...props} style={[{ flex: 1, minHeight: 0 }, props.style]}
    contentContainerStyle={[props.contentContainerStyle, { paddingBottom: Number(container.paddingBottom ?? container.paddingVertical ?? container.padding ?? 0) + overlap + 24 }]}
    ref={value => { scroll.current = value; if (typeof forwarded === 'function') forwarded(value); else if (forwarded) forwarded.current = value; }}
    scrollEventThrottle={Math.max(160, props.scrollEventThrottle || 0)}
    onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; notify(); props.onScroll?.(event); }}
    onLayout={event => { notify(); fields.reveal(); props.onLayout?.(event); }}
    onContentSizeChange={(w, h) => { notify(); fields.reveal(); props.onContentSizeChange?.(w, h); }}
  /></KeyboardField.Provider></RafiViewport.Provider>;
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
