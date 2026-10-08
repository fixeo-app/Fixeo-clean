import { pageLayout } from '@/ui/pageLayout';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { Keyboard, StyleSheet, View, useWindowDimensions } from 'react-native';
import { FixeoText } from '@/ui/FixeoText';
import { RafiOrb } from '@/ui/RafiOrb';
import type { RafiPresenceState } from '@/ui/rafiPresence';
import { radii, semanticColors, space, typography } from '@/ui/tokens';
import { clientHeroSize } from '@/lib/clientExperience';

/** Client composition shares the canonical page rhythm and certified RAFI loop. */
export function ClientHero({ eyebrow, title, detail, mode, eventKey, compact = false, family = 'home' }: {
  eyebrow: string; title: string; detail: string; mode: RafiPresenceState; eventKey?: string; compact?: boolean; family?: 'home' | 'request' | 'tracking';
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const small = width <= 340;
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return <View testID="client-hero" style={[styles.hero, small && styles.heroSmall, family === 'request' && keyboardVisible && { display: 'none' }]}>
    <RafiOrb size={clientHeroSize(width, height, compact, family)} mode={mode} eventKey={eventKey} />
    <View style={styles.heroCopy}>
      <FixeoText variant="eyebrow" tone="secondary" style={styles.center}>{eyebrow}</FixeoText>
      <FixeoText accessibilityRole="header" variant={fontScale > 1.4 ? 'heading' : compact || small ? 'title' : 'hero'} style={styles.center}>{title}</FixeoText>
      <FixeoText variant="supporting" tone="secondary" style={styles.center}>{detail}</FixeoText>
    </View>
  </View>;
}

export function ClientPageIntro({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return <View style={styles.intro}>
    <View style={styles.signature} />
    <FixeoText variant="eyebrow" tone="secondary">{eyebrow}</FixeoText>
    <FixeoText accessibilityRole="header" variant="hero">{title}</FixeoText>
    {detail ? <FixeoText tone="secondary">{detail}</FixeoText> : null}
  </View>;
}

export function ClientSection({ label, children, surface = false, testID }: PropsWithChildren<{ label?: string; surface?: boolean; testID?: string }>) {
  return <View testID={testID} style={[styles.section, surface && styles.surface]}>
    {label ? <FixeoText accessibilityRole="header" variant="eyebrow" tone="secondary">{label}</FixeoText> : null}
    {children}
  </View>;
}

export const clientStyles = StyleSheet.create({
  content: pageLayout.content,
  row: { paddingVertical: space.lg, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: semanticColors.border.subtle },
  input: { ...typography.body, color: semanticColors.text.primary, minHeight: 56, padding: space.md,
    backgroundColor: semanticColors.background.surface, borderRadius: radii.control, borderWidth: 1, borderColor: semanticColors.border.subtle },
  note: { gap: space.sm, paddingVertical: space.md },
  error: { color: semanticColors.status.danger.text },
});

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: space.xs, gap: space.sm },
  heroSmall: { paddingTop: 0, gap: space.xxs },
  heroCopy: { gap: space.sm, width: '100%', alignItems: 'center' },
  center: { textAlign: 'center', maxWidth: 380, width: '100%' },
  intro: pageLayout.intro,
  signature: pageLayout.signature,
  section: { gap: space.sm },
  surface: { backgroundColor: semanticColors.background.surface, borderRadius: radii.card, padding: space.lg },
});
