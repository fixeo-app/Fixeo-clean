import { Easing } from 'react-native';

export const motionEasing = {
  linear: Easing.linear,
  standard: Easing.inOut(Easing.cubic),
  enter: Easing.out(Easing.cubic),
  breathe: Easing.inOut(Easing.quad),
};
