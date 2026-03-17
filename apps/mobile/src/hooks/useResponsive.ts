import { useState, useEffect } from 'react';
import { Dimensions, ScaledSize } from 'react-native';

const BREAKPOINT_TABLET = 768;
const BREAKPOINT_DESKTOP = 1024;

interface ResponsiveInfo {
  /** True when viewport width >= 1024px */
  isDesktop: boolean;
  /** True when viewport width >= 768px and < 1024px */
  isTablet: boolean;
  /** True when viewport width < 768px */
  isMobile: boolean;
  /** Current viewport width in px */
  width: number;
}

function getResponsiveInfo(width: number): ResponsiveInfo {
  return {
    isDesktop: width >= BREAKPOINT_DESKTOP,
    isTablet: width >= BREAKPOINT_TABLET && width < BREAKPOINT_DESKTOP,
    isMobile: width < BREAKPOINT_TABLET,
    width,
  };
}

/**
 * Returns responsive breakpoint info that updates on window resize.
 * Desktop: >= 1024px, Tablet: 768-1023px, Mobile: < 768px
 */
export function useResponsive(): ResponsiveInfo {
  const [info, setInfo] = useState<ResponsiveInfo>(() =>
    getResponsiveInfo(Dimensions.get('window').width),
  );

  useEffect(() => {
    const handler = ({ window }: { window: ScaledSize }) => {
      setInfo(getResponsiveInfo(window.width));
    };

    const subscription = Dimensions.addEventListener('change', handler);
    return () => subscription.remove();
  }, []);

  return info;
}
