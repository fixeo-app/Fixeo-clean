import { StyleSheet, Text, View } from 'react-native';
import type { MobileDecisionCue } from '@/lib/decisionCenter';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoCard } from '@/ui/FixeoCard';
import { colors, radius, spacing, type } from '@/ui/tokens';

type Props = {
  cue: MobileDecisionCue;
  onAction: () => void;
};

const PRIORITY_LABEL: Record<MobileDecisionCue['priority'], string> = {
  low: 'À SAVOIR',
  normal: 'FIXEO VOUS GUIDE',
  high: 'À FAIRE MAINTENANT',
  critical: 'ACTION REQUISE',
};

export function DecisionCueCard({ cue, onAction }: Props) {
  const hasAction = cue.action.kind !== 'none';

  return (
    <FixeoCard tone={cue.priority === 'critical' ? 'dark' : 'light'} style={styles.card}>
      <View style={styles.topRow}>
        <Text
          style={[
            styles.kicker,
            cue.priority === 'critical' && styles.inverseMuted,
          ]}
        >
          {PRIORITY_LABEL[cue.priority]}
        </Text>
        <View style={[
          styles.sourcePill,
          cue.priority === 'critical' && styles.sourcePillDark,
        ]}>
          <Text
            style={[
              styles.sourceText,
              cue.priority === 'critical' && styles.inverse,
            ]}
          >
            {cue.source === 'canonical' ? 'CANONIQUE' : 'DECISION CENTER'}
          </Text>
        </View>
      </View>

      <Text
        style={[
          styles.headline,
          cue.priority === 'critical' && styles.inverse,
        ]}
      >
        {cue.headline}
      </Text>

      <Text
        style={[
          styles.detail,
          cue.priority === 'critical' && styles.inverseMuted,
        ]}
      >
        {cue.detail}
      </Text>

      {hasAction && (
        <FixeoAction
          label="Continuer"
          variant={cue.priority === 'critical' ? 'secondary' : 'primary'}
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
  kicker: {
    flex: 1,
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  sourcePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  sourcePillDark: {
    backgroundColor: '#262629',
  },
  sourceText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  headline: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.6,
    color: colors.text,
  },
  detail: {
    fontSize: type.body,
    lineHeight: 22,
    color: colors.textMuted,
  },
  inverse: {
    color: colors.inverse,
  },
  inverseMuted: {
    color: '#D2D2D5',
  },
});
