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
  const resolved: any = { ...rest };
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