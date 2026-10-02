import { StyleSheet, Text, View } from 'react-native';
import type { RafiContextSnapshot } from '@/lib/rafiContext';
import { RAFI_PROVENANCE_LABELS } from '@/lib/rafiContext';
import { FixeoCard } from '@/ui/FixeoCard';
import { colors, radius, spacing, type } from '@/ui/tokens';

type Props = {
  snapshot: RafiContextSnapshot;
};

export function RafiContextCard({ snapshot }: Props) {
  if (!snapshot.facts.length) return null;

  return (
    <FixeoCard tone="muted" style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.kicker}>RAFI A COMPRIS</Text>
        <Text style={styles.caption}>Rien n’est présenté comme certain sans confirmation.</Text>
      </View>

      <View style={styles.facts}>
        {snapshot.facts.map((fact, index) => (
          <View key={fact.label + index} style={styles.fact}>
            <View style={styles.factTop}>
              <Text style={styles.label}>{fact.label}</Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{RAFI_PROVENANCE_LABELS[fact.provenance]}</Text>
              </View>
            </View>
            <Text style={styles.value}>{fact.value}</Text>
          </View>
        ))}
      </View>
    </FixeoCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  kicker: {
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  facts: {
    gap: spacing.sm,
  },
  fact: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  factTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
  },
  value: {
    fontSize: type.body,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.text,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
});
