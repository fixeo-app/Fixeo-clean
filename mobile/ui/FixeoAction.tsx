import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { colors, radius, spacing, type } from './tokens';

type Props = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function FixeoAction({
  label,
  variant = 'primary',
  disabled,
  style,
  ...props
}: Props) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
    >
      <Text
        style={[
          styles.label,
          variant !== 'primary' && styles.labelDark,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 58,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.36,
  },
  label: {
    color: colors.inverse,
    fontSize: type.body,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  labelDark: {
    color: colors.text,
  },
});
