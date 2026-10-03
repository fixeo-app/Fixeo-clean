import {
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type TextStyle,
} from 'react-native';
import { triggerFixeoFeedback, type FixeoFeedbackKind } from '@/lib/feedback';
import { colors, radius, spacing, type } from './tokens';

type Props = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  feedback?: FixeoFeedbackKind;
  labelNumberOfLines?: number;
  labelStyle?: TextStyle;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
};

export function FixeoAction({
  label,
  variant = 'primary',
  feedback = 'selection',
  disabled,
  style,
  onPress,
  labelNumberOfLines,
  labelStyle,
  adjustsFontSizeToFit = false,
  minimumFontScale = 0.82,
  ...props
}: Props) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      onPress={(event) => {
        if (!disabled) triggerFixeoFeedback(feedback);
        onPress?.(event);
      }}
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
        numberOfLines={labelNumberOfLines}
        adjustsFontSizeToFit={adjustsFontSizeToFit}
        minimumFontScale={minimumFontScale}
        style={[
          styles.label,
          variant !== 'primary' && styles.labelDark,
          labelStyle,
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
