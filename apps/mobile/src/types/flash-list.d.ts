declare module '@shopify/flash-list' {
  import type { ComponentType, RefObject, Ref } from 'react';
  import type { ViewStyle, StyleProp } from 'react-native';

  export interface FlashListRef<T> {
    scrollToIndex: (params: { index: number; animated?: boolean; viewPosition?: number }) => void;
    scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
    scrollToEnd: (params?: { animated?: boolean }) => void;
    prepareForLayoutAnimationRender: () => void;
    recordInteraction: () => void;
  }

  export interface ListRenderItemInfo<T> {
    item: T;
    index: number;
    target: string;
  }

  export type ListRenderItem<T> = (info: ListRenderItemInfo<T>) => React.ReactElement | null;

  export interface FlashListProps<T> {
    data: T[] | readonly T[] | null | undefined;
    renderItem: ListRenderItem<T> | null | undefined;
    keyExtractor?: (item: T, index: number) => string;
    estimatedItemSize?: number;
    ItemSeparatorComponent?: ComponentType | null;
    ListEmptyComponent?: ComponentType | React.ReactElement | null;
    ListFooterComponent?: ComponentType | React.ReactElement | null;
    ListHeaderComponent?: ComponentType | React.ReactElement | null;
    onEndReached?: ((info: { distanceFromEnd: number }) => void) | null;
    onEndReachedThreshold?: number | null;
    onViewableItemsChanged?: ((info: { viewableItems: Array<{ item: T; index: number | null }>; changed: Array<{ item: T; index: number | null }> }) => void) | null;
    viewabilityConfig?: { viewAreaCoveragePercentThreshold?: number; itemVisiblePercentThreshold?: number; minimumViewTime?: number };
    refreshControl?: React.ReactElement;
    refreshing?: boolean;
    onRefresh?: (() => void) | null;
    numColumns?: number;
    contentContainerStyle?: StyleProp<ViewStyle>;
    horizontal?: boolean;
    inverted?: boolean;
    showsVerticalScrollIndicator?: boolean;
    showsHorizontalScrollIndicator?: boolean;
    snapToInterval?: number;
    snapToAlignment?: 'start' | 'center' | 'end';
    decelerationRate?: 'fast' | 'normal' | number;
    pagingEnabled?: boolean;
    initialScrollIndex?: number;
    ref?: Ref<FlashListRef<T>>;
    children?: React.ReactNode;
    [key: string]: unknown;
  }

  export const FlashList: <T>(props: FlashListProps<T> & { ref?: Ref<FlashListRef<T>> }) => React.ReactElement | null;
}
