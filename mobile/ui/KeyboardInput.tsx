import { forwardRef, useRef, type Ref } from 'react';
import { TextInput, View, type TextInputProps, type StyleProp, type ViewStyle } from 'react-native';
import { useKeyboardField } from './RafiScrollView';

/** Bounded native input. Native TextInput scrolls its caret internally; every
 * selection/layout/content change also reveals the measured input in its parent.
 * Android resize remains the owner of the IME inset (no keyboard-height padding).
 */
export const KeyboardInput = forwardRef<TextInput, TextInputProps & { containerStyle?: StyleProp<ViewStyle> }>(function KeyboardInput({ containerStyle, ...props }, forwarded) {
  const field = useRef<View>(null);
  const keyboard = useKeyboardField();
  const assign = (value: TextInput | null) => {
    if (typeof forwarded === 'function') forwarded(value);
    else if (forwarded) forwarded.current = value;
  };
  return <View ref={field} style={containerStyle} collapsable={false} onLayout={() => keyboard?.reveal()}>
    <TextInput {...props} ref={assign as Ref<TextInput>}
      onFocus={event => { keyboard?.focus(field); props.onFocus?.(event); }}
      onBlur={event => { keyboard?.blur(field); props.onBlur?.(event); }}
      onSelectionChange={event => { keyboard?.reveal(); props.onSelectionChange?.(event); }}
      onContentSizeChange={event => { keyboard?.reveal(); props.onContentSizeChange?.(event); }}
      onLayout={event => { keyboard?.reveal(); props.onLayout?.(event); }}
      style={[props.style, props.multiline && { minHeight: 56, maxHeight: 144, textAlignVertical: 'top' }]}
    />
  </View>;
});
