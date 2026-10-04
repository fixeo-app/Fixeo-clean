import type { AccessibilityState, ViewStyle } from 'react-native';
import { interaction, semanticColors } from './tokens';

export function resolveActionState(disabled = false, busy = false, selected?: boolean, supplied: AccessibilityState = {}) {
  const isBusy = busy || supplied.busy === true;
  const blocked = disabled || isBusy || supplied.disabled === true;
  return { blocked, busy: isBusy, accessibilityState: { ...supplied, disabled: blocked, busy: isBusy, selected: selected ?? supplied.selected } };
}

export function getInteractionStyle({ pressed, focused, disabled, reduceMotion }: {
  pressed: boolean; focused: boolean; disabled: boolean; reduceMotion: boolean;
}): ViewStyle {
  return {
    ...(pressed && !disabled ? { opacity: interaction.pressedOpacity, ...(!reduceMotion && { transform: [{ scale: interaction.pressedScale }] }) } : {}),
    ...(focused ? { borderColor: semanticColors.border.focus, borderWidth: interaction.focusWidth } : {}),
    ...(disabled ? { opacity: interaction.disabledOpacity } : {}),
  };
}
