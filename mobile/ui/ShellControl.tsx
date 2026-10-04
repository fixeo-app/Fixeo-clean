import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getInteractionStyle, resolveActionState } from './interactionContract';
import { useReducedMotion } from './useReducedMotion';
import { iconography, interaction, radii, semanticColors } from './tokens';

export function ShellIcon({ name, color = semanticColors.text.primary }: {
  name: ComponentProps<typeof Ionicons>['name']; color?: string;
}) {
  return <Ionicons name={name} size={iconography.sizes.action} color={color} allowFontScaling={false}
    accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

/** One target/focus/pressed contract for top bar, drawer and dock. */
export function ShellControl({ style, disabled, accessibilityState, onFocus, onBlur, onPress, ...props }: ComponentProps<typeof Pressable>) {
  const [focused, setFocused] = useState(false);
  const reduceMotion = useReducedMotion();
  const state = resolveActionState(disabled ?? false, false, undefined, accessibilityState);
  return <Pressable {...props} accessibilityRole="button" disabled={state.blocked}
    accessibilityState={state.accessibilityState}
    aria-busy={state.busy} aria-disabled={state.blocked} aria-selected={state.accessibilityState.selected}
    onFocus={event => { setFocused(true); onFocus?.(event); }}
    onBlur={event => { setFocused(false); onBlur?.(event); }}
    onPress={event => { if (!state.blocked) onPress?.(event); }}
    style={press => [styles.control, typeof style === 'function' ? style(press) : style,
      getInteractionStyle({ pressed: press.pressed, focused, disabled: state.blocked, reduceMotion }),
      { minWidth: interaction.minTarget, minHeight: interaction.minTarget }]} />;
}
const styles = StyleSheet.create({
  control: {
    borderWidth: interaction.focusWidth, borderColor: 'transparent', borderRadius: radii.control,
    alignItems: 'center', justifyContent: 'center',
  },
});
