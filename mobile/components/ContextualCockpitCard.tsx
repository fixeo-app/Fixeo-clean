import { StyleSheet, Text, View } from 'react-native';
import type { ContextualCockpitModel } from '@/lib/contextualCockpit';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoCard } from '@/ui/FixeoCard';
import { colors, radius, spacing, type } from '@/ui/tokens';

type Props = {
  model: ContextualCockpitModel;
  onAction?: () => void;
};

export function ContextualCockpitCard({ model, onAction }: Props) {
  const inverse = model.tone === 'dark';
  const showAction = model.action !== 'none' && !!model.actionLabel && !!onAction;

  return (
    <FixeoCard tone={model.tone} style={styles.card}>
      <View style={styles.topRow}>
        <Text style={[styles.eyebrow, inverse && styles.inverseMuted]}>
          {model.eyebrow}
        </Text>
        <View style={[styles.statusPill, inverse && styles.statusPillDark]}>
          <View style={[styles.statusDot, inverse && styles.statusDotInverse]} />
          <Text style={[styles.statusText, inverse && styles.inverse]}>
            {model.status}
          </Text>
        </View>
      </View>

      <Text style={[styles.title, inverse && styles.inverse]}>
        {model.title}
      </Text>

      <Text style={[styles.detail, inverse && styles.inverseMuted]}>
        {model.detail}
      </Text>

      {showAction && (
        <FixeoAction
          label={model.actionLabel!}
          variant={inverse ? 'secondary' : 'primary'}
          onPress={onAction}
        />
      )}
    </FixeoCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  eyebrow: {
    flex: 1,
    color: colors.textMuted,
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  statusPillDark: {
    backgroundColor: '#242426',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.ink,
  },
  statusDotInverse: {
    backgroundColor: colors.inverse,
  },
  statusText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  title: {
    color: colors.text,
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  detail: {
    color: colors.textMuted,
    fontSize: type.body,
    lineHeight: 22,
  },
  inverse: {
    color: colors.inverse,
  },
  inverseMuted: {
    color: '#D2D2D5',
  },
});
