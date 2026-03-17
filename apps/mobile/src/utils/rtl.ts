import { I18nManager, StyleProp, ViewStyle, TextStyle } from 'react-native';

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
 * Returns padding style swapping left/right based on RTL.
 * @param isRTL Whether the layout is RTL.
 * @param start Padding value for start (left in LTR, right in RTL).
 * @param end Padding value for end (right in LTR, left in RTL).
 * @returns Object with paddingLeft/paddingRight properties.
 */
export function rtlPadding(
  isRTL: boolean,
  start: number,
  end: number,
): { paddingLeft: number; paddingRight: number } {
  return isRTL
    ? { paddingLeft: end, paddingRight: start }
    : { paddingLeft: start, paddingRight: end };
}

/**
 * Returns transform style for flipping directional icons horizontally.
 * @param isRTL Whether the layout is RTL.
 * @returns `transform: [{ scaleX: -1 }]` for RTL, empty object for LTR.
 */
export function rtlIcon(isRTL: boolean): { transform: { scaleX: number }[] } | {} {
  return isRTL ? { transform: [{ scaleX: -1 }] } : {};
}

/**
 * Returns writing direction based on RTL.
 * @param isRTL Whether the layout is RTL.
 * @returns `rtl` or `ltr`.
 */
export function rtlWritingDirection(isRTL: boolean): 'rtl' | 'ltr' {
  return isRTL ? 'rtl' : 'ltr';
}

/**
 * Forces RTL layout if needed (for Android/iOS system RTL support).
 * Call this early in app initialization if you want to enable RTL system-wide.
 */
export function forceRTLLayout(enableRTL: boolean) {
  I18nManager.forceRTL(enableRTL);
  I18nManager.allowRTL(enableRTL);
}

/**
 * Returns dynamic style that swaps left/right properties based on RTL.
 * Useful for complex styling where you need to swap start/end.
 * @param isRTL Whether the layout is RTL.
 * @param style Style object with optional `start` and `end` keys (or left/right).
 * @returns Style object with left/right resolved.
 */
export function rtlStyle<T extends ViewStyle | TextStyle>(
  isRTL: boolean,
  style: T & { start?: number; end?: number },
): T {
  const { start, end, ...rest } = style;
  const resolved: Record<string, unknown> = { ...rest };
  if (start !== undefined) {
    if (isRTL) {
      resolved.right = start;
    } else {
      resolved.left = start;
    }
  }
  if (end !== undefined) {
    if (isRTL) {
      resolved.left = end;
    } else {
      resolved.right = end;
    }
  }
  return resolved as T;
}

/**
 * Returns alignSelf for start-aligned items, flipping for RTL.
 * @param isRTL Whether the layout is RTL.
 * @returns `flex-start` for LTR, `flex-end` for RTL.
 */
export function rtlAlignSelf(isRTL: boolean): 'flex-start' | 'flex-end' {
  return isRTL ? 'flex-end' : 'flex-start';
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