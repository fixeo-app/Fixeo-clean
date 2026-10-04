import { createElement, useMemo, useState } from 'react';
import { Animated, AppState, StyleSheet, View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { RafiOrb } from '../../ui/RafiOrb';
import { RAFI_STATES, RAFI_LABELS, type RafiPresenceState } from '../../ui/rafiPresence';
import { FixeoText } from '../../ui/FixeoText';
import { RafiInputRail } from '../../components/RafiInputRail';
import { captureCalls } from './rafi-capture.web';
import { semanticColors, space } from '../../ui/tokens';
import Client from '../../app/index';
import Artisan from '../../app/artisan';
const { createRoot } = require('react-dom/client');
const params = new URLSearchParams(location.search);
const scene = params.get('scene') || 'states';
const stats = { loopStarts: 0, timingStarts: 0, timingStops: 0, activitySubscriptions: 0, activityStops: 0, events: [] as unknown[] };
const originalLoop = Animated.loop;
Animated.loop = (...args) => { const loop = originalLoop(...args); const start = loop.start.bind(loop); loop.start = (...input) => { stats.loopStarts++; start(...input); }; return loop; };
const originalTiming = Animated.timing;
(Animated as { timing: typeof Animated.timing }).timing = (...args: Parameters<typeof Animated.timing>) => { const timing = originalTiming(...args); const start = timing.start.bind(timing), stop = timing.stop.bind(timing);
  timing.start = (...input) => { stats.timingStarts++; start(...input); }; timing.stop = () => { stats.timingStops++; stop(); }; return timing; };
const activityListeners = new Set<(state: string) => void>();
// Deterministic AppState source only for runtime lifecycle tests; OS Reduced Motion is real.
if (scene === 'runtime') {
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  AppState.addEventListener = ((_type: string, fn: (state: string) => void) => {
    stats.activitySubscriptions++; activityListeners.add(fn);
    return { remove: () => { stats.activityStops++; activityListeners.delete(fn); } };
  }) as typeof AppState.addEventListener;
}
function Fixture() {
  const [mode, setMode] = useState<RafiPresenceState>('idle');
  const [eventKey, setEventKey] = useState('first');
  const [mounted, setMounted] = useState(true);
  const navigation = useMemo(() => {
    let focused = true;
    const listeners = { focus: new Set<() => void>(), blur: new Set<() => void>() };
    return { isFocused: () => focused,
      addListener: (type: 'focus' | 'blur', fn: () => void) => { listeners[type].add(fn); return () => { listeners[type].delete(fn); }; },
      focus: (value: boolean) => { focused = value; listeners[value ? 'focus' : 'blur'].forEach(fn => fn()); },
      listeners,
    };
  }, []);
  (globalThis as any).__w3 = { stats, captureCalls, setMode, setEventKey, setMounted,
    focus: navigation.focus, navigationListeners: navigation.listeners,
    background: (active: boolean) => activityListeners.forEach(fn => fn(active ? 'active' : 'background')) };
  if (scene === 'client' || scene === 'artisan') return <SafeAreaInsetsContext.Provider value={{ top: 44, bottom: 34, left: 0, right: 0 }}>
    {scene === 'client' ? <Client /> : <Artisan />}
  </SafeAreaInsetsContext.Provider>;
  if (scene === 'runtime') return <NavigationContext.Provider value={navigation as any}>
    <View style={styles.page}>{mounted && <RafiOrb mode={mode} eventKey={eventKey} size={params.has('compact') ? 44 : 96} />}</View>
  </NavigationContext.Provider>;
  if (scene === 'material') {
    const size = Number(params.get('size') || 96);
    return <View style={[styles.page, { alignItems: 'center', justifyContent: 'center', gap: 24 }]}>
      <FixeoText variant="eyebrow" tone="secondary">RAFI · {size === 96 ? 'HERO' : size === 76 ? 'MEDIUM' : 'COMPACT'} {size}</FixeoText>
      <RafiOrb size={size} active={false} materialMode={params.has('procedural') ? 'procedural' : 'master'} />
      <FixeoText variant="supporting" tone="secondary">{size} px réels · capture densité ×3</FixeoText>
      <FixeoText variant="caption" tone="secondary">{size === 44 ? 'Matière compacte conservée' : 'Master Core V1 · signature runtime'}</FixeoText>
    </View>;
  }
  if (scene === 'comparison') return <View style={[styles.page, { alignItems: 'center', justifyContent: 'center', gap: 24 }]}>
    <FixeoText variant="eyebrow" tone="secondary">RAFI · HERO 96 · AVANT / APRÈS</FixeoText>
    <View style={{ flexDirection: 'row', gap: 20 }}>
      <View style={{ alignItems: 'center', gap: 12 }}><RafiOrb size={96} active={false} materialMode="procedural" /><FixeoText variant="caption">Core W3 précédent</FixeoText></View>
      <View style={{ alignItems: 'center', gap: 12 }}><RafiOrb size={96} active={false} /><FixeoText variant="caption">Master Core V1</FixeoText></View>
    </View>
    <FixeoText variant="supporting" tone="secondary">96 px réels · capture densité ×3</FixeoText>
  </View>;
  if (scene === 'hero') return <View style={[styles.page, { alignItems: 'center', justifyContent: 'center', gap: 24 }]}>
    <FixeoText variant="eyebrow" tone="secondary">RAFI · HERO 96</FixeoText>
    <RafiOrb size={96} active={false} />
    <FixeoText variant="supporting" tone="secondary">96 px réels · capture densité ×3</FixeoText>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}><RafiOrb size={76} active={false} /><RafiOrb size={44} active={false} /></View>
    <FixeoText variant="caption" tone="secondary">Medium 76 · Compact 44</FixeoText>
  </View>;
  if (scene === 'composer') return <View style={styles.page}>
    <FixeoText variant="eyebrow" tone="secondary">RAFI · FIXEO</FixeoText>
    <RafiOrb size={96} active={false} />
    <FixeoText variant="title">Un mot. Une photo.{ '\n' }On vous écoute.</FixeoText>
    <RafiInputRail onVoiceReady={uri => stats.events.push(['voice', uri])}
      onPhotoReady={(uri, mime) => stats.events.push(['photo', uri, mime])}
      onWrite={() => stats.events.push(['write'])} onListeningChange={value => stats.events.push(['listening', value])} />
    <FixeoText variant="caption" tone="secondary">Fixture de composants · aucune demande créée</FixeoText>
  </View>;
  return <View style={styles.page}>
    <FixeoText variant="eyebrow" tone="secondary">FIXEO · PRÉSENCE RAFI V2</FixeoText>
    <FixeoText variant="title">Une même présence.</FixeoText>
    <FixeoText variant="supporting" tone="secondary">{params.has('reduced') ? 'Reduced Motion · états statiques' : 'Huit états · poses de référence statiques'}</FixeoText>
    <View style={styles.grid}>{RAFI_STATES.map(state => <View key={state} testID={`state-${state}`} style={styles.cell}>
      <RafiOrb mode={state} size={76} active={false} />
      <FixeoText variant="caption" style={styles.label}>{RAFI_LABELS[state]}</FixeoText>
      <FixeoText variant="caption" tone="secondary">{state}</FixeoText>
    </View>)}</View>
    <View style={styles.sizes}><RafiOrb size={44} active={false} /><RafiOrb size={76} active={false} /><RafiOrb size={96} active={false} /></View>
    <FixeoText variant="caption" tone="secondary">Compact 44 · Medium 76 · Hero 96</FixeoText>
  </View>;
}
const styles = StyleSheet.create({
  page: { minHeight: '100%', padding: space.lg, gap: space.md, backgroundColor: semanticColors.background.canvas },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg, marginHorizontal: -space.xs },
  cell: { width: '50%', alignItems: 'center', paddingHorizontal: space.xs, gap: space.xxs },
  label: { textAlign: 'center' },
  sizes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
});
createRoot(document.getElementById('root')).render(createElement(Fixture));
