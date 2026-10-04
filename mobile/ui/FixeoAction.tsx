import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type PressableProps,
  type TextStyle,
} from 'react-native';
import { useState } from 'react';
import { triggerFixeoFeedback, type FixeoFeedbackKind } from '@/lib/feedback';
import { FixeoText } from './FixeoText';
import { getInteractionStyle, resolveActionState } from './interactionContract';
import { useReducedMotion } from './useReducedMotion';
import { interaction, radii, semanticColors, spacing } from './tokens';

type Props = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  busy?: boolean;
  busyLabel?: string;
  selected?: boolean;
  feedback?: FixeoFeedbackKind;
  labelNumberOfLines?: number;
  labelStyle?: TextStyle;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
};

export function FixeoAction({
  label,
  variant = 'primary',
  feedback = 'none',
  disabled,
  busy = false,
  busyLabel,
  selected,
  accessibilityState,
  onFocus,
  onBlur,
  style,
  onPress,
  labelNumberOfLines,
  labelStyle,
  adjustsFontSizeToFit = false,
  minimumFontScale = 0.82,
  ...props
}: Props) {
  const [focused, setFocused] = useState(false);
  const reduceMotion = useReducedMotion();
  const state = resolveActionState(disabled ?? false, busy, selected, accessibilityState);
  const inverse = variant === 'primary' || variant === 'destructive';
  const foreground = state.blocked ? semanticColors.text.disabled
    : state.accessibilityState.selected ? semanticColors.interaction.selectedText
    : inverse ? semanticColors.text.inverse : semanticColors.text.primary;

  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      accessibilityState={state.accessibilityState}
      aria-busy={state.busy}
      aria-disabled={state.blocked}
      aria-selected={state.accessibilityState.selected}
      disabled={state.blocked}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }}
      onPress={(event) => {
        if (state.blocked) return;
        triggerFixeoFeedback(feedback);
        onPress?.(event);
      }}
      style={({ pressed }) => {
        const custom = typeof style === 'function' ? style({ pressed }) : style;
        const customMetrics = StyleSheet.flatten(custom);
        const customHeight = customMetrics?.minHeight;
        const customWidth = customMetrics?.minWidth;
        return [
          styles.base,
          styles[variant],
          custom,
          state.accessibilityState.selected && styles.selected,
          state.blocked && styles.disabled,
          getInteractionStyle({ pressed, focused, disabled: state.blocked, reduceMotion }),
          {
            minWidth: typeof customWidth === 'number' ? Math.max(interaction.minTarget, customWidth) : customWidth ?? interaction.minTarget,
            minHeight: Math.max(interaction.minTarget, typeof customHeight === 'number' ? customHeight : interaction.actionHeight),
          },
        ];
      }}
    >
      {state.busy && !reduceMotion && <ActivityIndicator color={foreground} accessible={false} />}
      <FixeoText
        numberOfLines={labelNumberOfLines}
        adjustsFontSizeToFit={adjustsFontSizeToFit}
        minimumFontScale={minimumFontScale}
        style={[
          styles.label,
          { color: foreground },
          labelStyle,
        ]}
      >
        {state.busy ? busyLabel ?? label : label}
      </FixeoText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: interaction.actionHeight,
    borderRadius: radii.control,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: interaction.focusWidth,
    borderColor: semanticColors.interaction.transparent,
  },
  primary: {
    backgroundColor: semanticColors.background.focus,
  },
  secondary: {
    backgroundColor: semanticColors.background.surface,
    borderColor: semanticColors.border.strong,
  },
  ghost: {
    backgroundColor: semanticColors.interaction.transparent,
  },
  destructive: {
    backgroundColor: semanticColors.status.danger.text,
  },
  selected: {
    backgroundColor: semanticColors.interaction.selected,
    borderColor: semanticColors.interaction.selectedText,
  },
  disabled: {
    backgroundColor: semanticColors.interaction.disabled,
    borderColor: semanticColors.interaction.disabled,
  },
  label: {
    flexShrink: 1,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
