/**
 * Returns flexDirection style for a row based on RTL setting.
 * @param isRTL Whether the layout is RTL (e.g., language is Arabic).
 * @returns `row` for LTR, `row-reverse` for RTL.
 */
export function rtlFlexRow(isRTL: boolean): 'row' | 'row-reverse' {
  return isRTL ? 'row-reverse' : 'row';
}

/**
 * Returns textAlign style based on RTL setting.
 * @param isRTL Whether the layout is RTL.
 * @returns `left` for LTR, `right` for RTL.
 */
export function rtlTextAlign(isRTL: boolean): 'left' | 'right' {
  return isRTL ? 'right' : 'left';
}

/**
 * Returns margin style using RTL-aware properties.
 * @param _isRTL Whether the layout is RTL (ignored — marginStart/End auto-flip).
 * @param start Margin value for start (left in LTR, right in RTL).
 * @param end Margin value for end (right in LTR, left in RTL).
 * @returns Object with marginStart/marginEnd properties.
 */
export function rtlMargin(
  _isRTL: boolean,
  start: number,
  end: number,
): { marginStart: number; marginEnd: number } {
  return { marginStart: start, marginEnd: end };
}

/**
 * Returns the correct directional border style using RTL-aware properties.
 * @param _isRTL Whether the layout is RTL (ignored — borderStartWidth/Color auto-flip).
 * @param width Border width.
 * @param color Border color.
 * @returns Object with borderStartWidth/Color.
 */
export function rtlBorderStart(
  _isRTL: boolean,
  width: number,
  color: string,
): { borderStartWidth: number; borderStartColor: string } {
  return { borderStartWidth: width, borderStartColor: color };
}

/**
 * Returns absolute positioning using RTL-aware 'start' property.
 * @param _isRTL Whether the layout is RTL (ignored — start auto-flips).
 * @param value Position value.
 * @returns Object with { start: value }.
 */
export function rtlAbsoluteStart(
  _isRTL: boolean,
  value: number,
): { start: number } {
  return { start: value };
}

/**
 * Returns absolute positioning using RTL-aware 'end' property.
 * @param _isRTL Whether the layout is RTL (ignored — end auto-flips).
 * @param value Position value.
 * @returns Object with { end: value }.
 */
export function rtlAbsoluteEnd(
  _isRTL: boolean,
  value: number,
): { end: number } {
  return { end: value };
}

/**
 * Returns the correct chevron/arrow icon name based on direction and RTL.
 * @param isRTL Whether the layout is RTL.
 * @param direction 'forward' or 'back'.
 * @returns Icon name string.
 */
export function rtlChevron(
  isRTL: boolean,
  direction: 'forward' | 'back',
): 'chevron-right' | 'chevron-left' {
  if (direction === 'forward') {
    return isRTL ? 'chevron-left' : 'chevron-right';
  }
  return isRTL ? 'chevron-right' : 'chevron-left';
}

/**
 * Returns the correct arrow icon name based on direction and RTL.
 * @param isRTL Whether the layout is RTL.
 * @param direction 'forward' or 'back'.
 * @returns Icon name string.
 */
export function rtlArrow(
  isRTL: boolean,
  direction: 'forward' | 'back',
): 'arrow-left' | 'arrow-right' {
  if (direction === 'back') {
    return isRTL ? 'arrow-right' : 'arrow-left';
  }
  return isRTL ? 'arrow-left' : 'arrow-right';
}