import type { PropsWithChildren } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { FixeoText } from '@/ui/FixeoText';
import { RafiOrb } from '@/ui/RafiOrb';
import type { RafiPresenceState } from '@/ui/rafiPresence';
import { layout, radii, rafiVisualTokens, semanticColors, space, typography } from '@/ui/tokens';
import { clientHeroSize } from '@/lib/clientExperience';

/** Client-only composition. W2 shell and W3 material/motion are used unchanged. */
export function ClientHero({ eyebrow, title, detail, mode, eventKey, compact = false }: {
  eyebrow: string; title: string; detail: string; mode: RafiPresenceState; eventKey?: string; compact?: boolean;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const small = width <= 340 || height <= 640;
  return <View testID="client-hero" style={[styles.hero, small && styles.heroSmall]}>
    <RafiOrb size={clientHeroSize(width, height, compact)} mode={mode} eventKey={eventKey} />
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
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.xl, width: '100%', maxWidth: layout.screen.maxContentWidth, alignSelf: 'center' },
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
  intro: { paddingTop: space.lg, gap: space.sm },
  signature: { width: space.xl, height: 2, backgroundColor: rafiVisualTokens.champagne, marginBottom: space.xs },
  section: { gap: space.sm },
  surface: { backgroundColor: semanticColors.background.surface, borderRadius: radii.card, padding: space.lg },
});
