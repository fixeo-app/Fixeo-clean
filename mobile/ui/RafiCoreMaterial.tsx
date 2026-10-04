import type { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { rafiVisualTokens as material } from './tokens';

// Bundled locally by Metro, never fetched from a service. Original RGBA pixels retained.
const MASTER_CORE = require('../assets/rafi/rafi-master-core-v1.png');
// A square viewport around the useful sphere. Uniform scale preserves its original proportions.
// All pixels with alpha > 8 fit inside its 552 px radius; only near-transparent extraction dust is clipped.
export const RAFI_MASTER_TEXTURE = { width: 1230, height: 1278, viewport: 1104, left: 63, top: 71 } as const;

type Props = {
  diameter: number; compact: boolean; master: boolean;
  onError: () => void; children: ReactNode;
};

/** Static material only. The parent owns every animated value and the signature. */
export function RafiCoreMaterial({ diameter, compact, master, onError, children }: Props) {
  const hero = diameter >= 96;
  const finish = hero ? material.finish.hero : material.finish.medium;
  const factor = diameter / RAFI_MASTER_TEXTURE.viewport;
  return <>
    {master ? <Image testID="rafi-master-material" source={MASTER_CORE} accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      resizeMode="contain" fadeDuration={0} onError={onError}
      style={{ position: 'absolute', width: RAFI_MASTER_TEXTURE.width * factor, height: RAFI_MASTER_TEXTURE.height * factor,
        left: -RAFI_MASTER_TEXTURE.left * factor, top: -RAFI_MASTER_TEXTURE.top * factor }} />
      : <LinearGradient testID="rafi-procedural-material"
        colors={[compact ? material.rim : material.finish.rim, compact ? material.deepRim : material.finish.deepRim, material.core, material.champagne]}
        locations={[0, 0.28, 0.82, 1]} start={{ x: 0.12, y: 0 }} end={{ x: 0.85, y: 1 }} style={StyleSheet.absoluteFill} />}
    <View style={[styles.inset, { borderRadius: diameter / 2, backgroundColor: master ? material.transparent : material.core }]}>
      {!master && !compact && <>
        <LinearGradient colors={[material.finish.graphiteLight, material.finish.graphite, material.core, material.core]}
          locations={[0, 0.28, 0.64, 1]} start={{ x: 0.05, y: 0 }} end={{ x: 0.83, y: 0.96 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={[finish.specular, material.highlightClear]} locations={[0, 0.75]}
          start={{ x: 0.35, y: 0 }} end={{ x: 0.55, y: 1 }}
          style={[styles.reflection, { top: -diameter * 0.43, left: -diameter * 0.27, width: diameter * 1.45, height: diameter * 1.05,
            borderRadius: diameter }]} />
        {hero && <LinearGradient colors={[material.highlightClear, material.highlightClear, material.finish.bounce]} locations={[0, 0.68, 1]}
          start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />}
      </>}
      {children}
    </View>
  </>;
}
const styles = StyleSheet.create({
  inset: { position: 'absolute', top: 0.8, left: 0.8, bottom: 0.8, right: 0.8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  reflection: { position: 'absolute', transform: [{ rotate: '-24deg' }] },
});
