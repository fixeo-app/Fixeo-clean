import { View, type ViewProps } from 'react-native';
import { depth, radii, semanticColors } from './tokens';

export type FixeoSurfaceProps = ViewProps & {
  tone?: keyof typeof semanticColors.background;
  rounding?: keyof typeof radii;
  elevation?: keyof typeof depth;
  border?: keyof typeof semanticColors.border;
};

/** Unbordered and flat by default. Focus surfaces are reserved for decisions. */
export function FixeoSurface({ tone = 'surface', rounding, elevation = 'flat', border, style, ...props }: FixeoSurfaceProps) {
  return (
    <View {...props} style={[
      { backgroundColor: semanticColors.background[tone] },
      rounding && { borderRadius: radii[rounding] },
      depth[elevation],
      border && { borderWidth: 1, borderColor: semanticColors.border[border] },
      style,
    ]} />
  );
}
