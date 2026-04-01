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
 * Returns margin style swapping left/right based on RTL.
 * @param isRTL Whether the layout is RTL.
 * @param start Margin value for start (left in LTR, right in RTL).
 * @param end Margin value for end (right in LTR, left in RTL).
 * @returns Object with marginLeft/marginRight properties.
 */
export function rtlMargin(
  isRTL: boolean,
  start: number,
  end: number,
): { marginLeft: number; marginRight: number } {
  return isRTL
    ? { marginLeft: end, marginRight: start }
    : { marginLeft: start, marginRight: end };
}

/**
 * Returns the correct directional border style for RTL (e.g., unread accent bars).
 * @param isRTL Whether the layout is RTL.
 * @param width Border width.
 * @param color Border color.
 * @returns Object with borderLeftWidth/Color or borderRightWidth/Color.
 */
export function rtlBorderStart(
  isRTL: boolean,
  width: number,
  color: string,
): Record<string, number | string> {
  return isRTL
    ? { borderRightWidth: width, borderRightColor: color }
    : { borderLeftWidth: width, borderLeftColor: color };
}

/**
 * Returns absolute positioning swapping left/right for RTL.
 * @param isRTL Whether the layout is RTL.
 * @param value Position value.
 * @returns Object with { left: value } for LTR, { right: value } for RTL.
 */
export function rtlAbsoluteStart(
  isRTL: boolean,
  value: number,
): { left?: number; right?: number } {
  return isRTL ? { right: value } : { left: value };
}

/**
 * Returns absolute positioning swapping right/left for RTL.
 * @param isRTL Whether the layout is RTL.
 * @param value Position value.
 * @returns Object with { right: value } for LTR, { left: value } for RTL.
 */
export function rtlAbsoluteEnd(
  isRTL: boolean,
  value: number,
): { left?: number; right?: number } {
  return isRTL ? { left: value } : { right: value };
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