/** Native window coordinates; Android resize may have removed all overlap already. */
export function keyboardGeometry(top: number, height: number, keyboardTop: number | null) {
  const bottom = keyboardTop == null ? top + height : Math.min(top + height, keyboardTop);
  return { top, bottom, overlap: Math.max(0, top + height - bottom) };
}

/** Move only when necessary, keeping a small breathing space around the field. */
export function focusedScrollDelta(fieldTop: number, fieldHeight: number, top: number, bottom: number, margin = 24) {
  const room = bottom - top - margin * 2;
  if (room <= 0) return 0;
  if (fieldHeight > room) return fieldTop < top + margin || fieldTop >= bottom - margin ? fieldTop - top - margin : 0;
  if (fieldTop + fieldHeight > bottom - margin) return fieldTop + fieldHeight - bottom + margin;
  if (fieldTop < top + margin) return fieldTop - top - margin;
  return 0;
}
