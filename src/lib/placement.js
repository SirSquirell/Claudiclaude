/**
 * US-161 — which side a floating menu hangs from, measured rather than assumed.
 *
 * The overflow menu has shipped off-screen twice, in opposite directions:
 * 0.60.2 fixed it running off the *right* by anchoring it `right: 0` below the
 * rail breakpoint, on the assumption that its trigger sits at the right end of
 * a wrapped row; US-151's full-width Upgrade button then pushed the trigger to
 * the left end of a row of its own, and the same rule sent the menu off the
 * *left*. With `body.plus` (Upgrade hidden) the trigger is back on the right.
 * A stylesheet cannot see where its trigger landed; this function is given the
 * measurements and answers.
 *
 * Pure. `'left'` means the menu's left edge aligns with the trigger's and it
 * grows rightward; `'right'` means the right edges align and it grows leftward.
 * Left is preferred when both fit (it is the reading direction); when neither
 * fits the side with more room wins, so at worst one edge overflows, never the
 * side the reader is on.
 *
 * @param {{ triggerLeft: number, triggerRight: number, menuWidth: number, viewportWidth: number, margin?: number }} m
 * @returns {'left'|'right'}
 */
export function menuAnchor({ triggerLeft, triggerRight, menuWidth, viewportWidth, margin = 8 }) {
  const fitsLeft = triggerLeft + menuWidth <= viewportWidth - margin;
  const fitsRight = triggerRight - menuWidth >= margin;
  if (fitsLeft) return 'left';
  if (fitsRight) return 'right';
  return viewportWidth - triggerLeft >= triggerRight ? 'left' : 'right';
}
