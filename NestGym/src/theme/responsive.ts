import { Dimensions, ScaledSize, StyleSheet, ViewStyle } from 'react-native';
import { useState, useEffect } from 'react';

/** Standard iPad breakpoint: width or height >= 768 */
const IPAD_MIN_WIDTH = 768;

export function checkIsTablet(
  dim: ScaledSize = Dimensions.get('window'),
): boolean {
  return dim.width >= IPAD_MIN_WIDTH || dim.height >= 1024;
}

/**
 * Hook that listens to window dimension changes (supporting orientation shifts on iPad)
 * and returns tablet responsive layout helpers.
 */
export function useResponsive() {
  const [dim, setDim] = useState(() => Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: { window: ScaledSize }) => {
      setDim(window);
    });
    return () => sub?.remove();
  }, []);

  const isTablet = dim.width >= IPAD_MIN_WIDTH;
  const isLandscape = dim.width > dim.height;

  // Adaptive content max width: keeps iPad screens from looking stretched like an oversized phone
  const maxContentWidth = isTablet ? (isLandscape ? 1040 : 860) : undefined;

  // Grid columns calculator for lists/tiles
  const getGridColumns = (minItemWidth = 160, gap = 12) => {
    if (!isTablet) return 2;
    const available = Math.min(dim.width, maxContentWidth || dim.width) - 32;
    return Math.max(2, Math.floor((available + gap) / (minItemWidth + gap)));
  };

  return {
    width: dim.width,
    height: dim.height,
    isTablet,
    isLandscape,
    maxContentWidth,
    getGridColumns,
  };
}

/**
 * Shared container style that centers content with a comfortable max width on iPad / tablet
 * so views don't look awkwardly stretched across wide screens.
 */
export const tabletContainerStyleBase: ViewStyle = {
  width: '100%',
  maxWidth: 1040,
  alignSelf: 'center',
};

export function tabletContainerStyle(
  isTablet?: boolean,
): ViewStyle | undefined {
  return isTablet ? tabletContainerStyleBase : undefined;
}
