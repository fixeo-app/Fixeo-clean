import { Pressable, StyleSheet, Text, View } from 'react-native';
import { triggerFixeoFeedback } from '@/lib/feedback';
import { colors, radius, spacing } from '@/ui/tokens';

export type WorkspaceShortcut = {
  key: string;
  label: string;
  meta: string;
  onPress: () => void;
};

type Props = {
  items: WorkspaceShortcut[];
};

export function WorkspaceShortcutGrid({ items }: Props) {
  return (
    <View style={styles.grid}>
      {items.map(item => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          onPress={() => {
            triggerFixeoFeedback('selection');
            item.onPress();
          }}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
          <Text style={styles.label}>{item.label}</Text>
          <Text style={styles.meta}>{item.meta}</Text>
          <Text style={styles.arrow}>→</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  item: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 128,
    maxWidth: '100%',
    minHeight: 116,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'space-between',
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.86,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '400',
  },
  arrow: {
    alignSelf: 'flex-end',
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
  },
});
