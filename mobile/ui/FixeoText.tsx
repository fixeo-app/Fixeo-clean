import { Text, type TextProps } from 'react-native';
import { semanticColors, typography, type TypographyRole } from './tokens';

export type FixeoTextProps = TextProps & {
  variant?: TypographyRole;
  tone?: keyof typeof semanticColors.text;
};

/** No default truncation or font-size cap: essential copy can grow and wrap. */
export function FixeoText({ variant = 'body', tone = 'primary', style, ...props }: FixeoTextProps) {
  return <Text {...props} style={[typography[variant], { color: semanticColors.text[tone] }, style]} />;
}
