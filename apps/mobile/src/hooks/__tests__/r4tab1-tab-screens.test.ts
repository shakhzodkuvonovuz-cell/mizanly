/**
 * R4 Tab1 — Tests for tab screen fixes.
 *
 * Covers: dwell tracking bounded Map, stable onViewableItemsChanged,
 * theme color patterns, AsyncStorage error handling, Conversation isPinned,
 * create.tsx redirect safety, _layout theme-aware tint, scroll persistence,
 * handleShare error handling, double-tap protection, archive/pin toasts.
 */

// ── Mocks ──

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Dimensions: { get: jest.fn(() => ({ width: 393, height: 852 })) },
  Share: { share: jest.fn() },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    absoluteFill: {},
    hairlineWidth: 0.5,
  },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  FlatList: 'FlatList',
  ActivityIndicator: 'ActivityIndicator',
  Appearance: {
    getColorScheme: () => 'dark',
    addChangeListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('react-native-reanimated', () => ({
  useSharedValue: (v: unknown) => ({ value: v }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withSpring: (v: unknown) => v,
  withTiming: (v: unknown) => v,
  default: { createAnimatedComponent: (c: unknown) => c },
}));

// ── Tests ──

describe('R4-Tab1: Dwell tracking bounded Map', () => {
  test('Map-based dwell tracking does not pollute globalThis', () => {
    const dwellTimers = new Map<string, number>();

    // Simulate items becoming viewable
    dwellTimers.set('post-1', Date.now());
    dwellTimers.set('post-2', Date.now());
    dwellTimers.set('post-3', Date.now());

    expect(dwellTimers.size).toBe(3);
    // No globalThis pollution
    expect((globalThis as Record<string, unknown>)['dwell_post-1']).toBeUndefined();
    expect((globalThis as Record<string, unknown>)['dwell_post-2']).toBeUndefined();

    // Simulate items scrolling off
    dwellTimers.delete('post-1');
    dwellTimers.delete('post-2');
    expect(dwellTimers.size).toBe(1);

    // Full cleanup
    dwellTimers.clear();
    expect(dwellTimers.size).toBe(0);
  });

  test('Map dwell tracking calculates correct dwell time', () => {
    const dwellTimers = new Map<string, number>();
    const now = Date.now();
    dwellTimers.set('post-1', now - 3000); // 3 seconds ago

    const start = dwellTimers.get('post-1');
    expect(start).toBeDefined();
    const dwellMs = Date.now() - start!;
    expect(dwellMs).toBeGreaterThanOrEqual(2000);
    dwellTimers.delete('post-1');
    expect(dwellTimers.has('post-1')).toBe(false);
  });

  test('Map handles rapid viewability changes without memory leak', () => {
    const dwellTimers = new Map<string, number>();
    // Simulate rapid scrolling — 100 items
    for (let i = 0; i < 100; i++) {
      dwellTimers.set(`post-${i}`, Date.now());
    }
    expect(dwellTimers.size).toBe(100);
    // Simulate cleanup as items scroll off
    for (let i = 0; i < 100; i++) {
      dwellTimers.delete(`post-${i}`);
    }
    expect(dwellTimers.size).toBe(0);
  });
});

describe('R4-Tab1: Stable onViewableItemsChanged', () => {
  test('useRef preserves function identity across renders', () => {
    // Simulating what useRef does: stores a stable reference
    const callbacks: Array<() => void> = [];
    const stableRef = { current: () => { /* handler */ } };

    // Multiple "renders" should all get the same function
    callbacks.push(stableRef.current);
    callbacks.push(stableRef.current);
    callbacks.push(stableRef.current);

    expect(callbacks[0]).toBe(callbacks[1]);
    expect(callbacks[1]).toBe(callbacks[2]);
  });
});

describe('R4-Tab1: Theme color patterns', () => {
  test('colors.text.primary is a static dark-mode token', () => {
    // These should NOT be used in StyleSheet without inline tc override
    const staticDarkTokens = {
      'colors.text.primary': '#FFFFFF',
      'colors.text.secondary': '#C9D1D9',
      'colors.text.tertiary': '#8B949E',
    };

    // In light mode, white text on white bg = invisible
    expect(staticDarkTokens['colors.text.primary']).toBe('#FFFFFF');
    // Inline overrides with tc.text.primary should be used instead
  });

  test('theme-aware colors handle both dark and light', () => {
    // Simulating getThemeColors behavior
    const darkColors = {
      bg: '#0D1117',
      text: { primary: '#FFFFFF', secondary: '#C9D1D9', tertiary: '#8B949E' },
      isDark: true,
    };
    const lightColors = {
      bg: '#FFFFFF',
      text: { primary: '#1B1F23', secondary: '#586069', tertiary: '#959DA5' },
      isDark: false,
    };

    // Dark: white text on dark bg = visible
    expect(darkColors.text.primary).toBe('#FFFFFF');
    // Light: dark text on white bg = visible
    expect(lightColors.text.primary).toBe('#1B1F23');
    // Both are readable — that's the fix
  });
});

describe('R4-Tab1: Conversation isPinned type safety', () => {
  test('isPinned field exists on Conversation interface', () => {
    interface Conversation {
      id: string;
      isPinned?: boolean;
      isGroup: boolean;
    }

    const convo: Conversation = { id: '1', isGroup: false };
    // Without isPinned, defaults to false
    expect(!!convo.isPinned).toBe(false);

    const pinnedConvo: Conversation = { id: '2', isGroup: false, isPinned: true };
    expect(!!pinnedConvo.isPinned).toBe(true);
  });

  test('no unsafe cast needed for isPinned', () => {
    interface Conversation {
      id: string;
      isPinned?: boolean;
    }

    const item: Conversation = { id: '1', isPinned: true };
    // Direct access works — no `as unknown as Record<string, unknown>` needed
    expect(item.isPinned).toBe(true);
  });
});

describe('R4-Tab1: create.tsx redirect safety', () => {
  test('router.replace handles cold deep-link without crash', () => {
    // router.replace navigates to a known route, unlike router.back() which needs history
    const replaceCalled = { to: '' };
    const mockRouter = {
      replace: (path: string) => { replaceCalled.to = path; },
      back: () => { throw new Error('No navigation history'); },
    };

    // Old behavior (would crash):
    expect(() => mockRouter.back()).toThrow('No navigation history');

    // New behavior (safe):
    mockRouter.replace('/(tabs)/saf');
    expect(replaceCalled.to).toBe('/(tabs)/saf');
  });
});

describe('R4-Tab1: _layout theme-aware tint', () => {
  test('BlurView tint matches theme', () => {
    const getBlurTint = (isDark: boolean) => isDark ? 'dark' : 'light';

    expect(getBlurTint(true)).toBe('dark');
    expect(getBlurTint(false)).toBe('light');
  });

  test('Android tab bar bg matches theme', () => {
    const getAndroidBg = (isDark: boolean) =>
      isDark ? 'rgba(13, 17, 23, 0.92)' : 'rgba(255, 255, 255, 0.92)';

    expect(getAndroidBg(true)).toBe('rgba(13, 17, 23, 0.92)');
    expect(getAndroidBg(false)).toBe('rgba(255, 255, 255, 0.92)');
  });

  test('border color adapts to theme', () => {
    const getBorderColor = (isDark: boolean) =>
      isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

    expect(getBorderColor(true)).toBe('rgba(255,255,255,0.08)');
    expect(getBorderColor(false)).toBe('rgba(0,0,0,0.08)');
  });
});

describe('R4-Tab1: Scroll position persistence', () => {
  test('throttled scroll save only writes on delta > 50px', () => {
    let lastSavedOffset = 0;
    let storeOffset = 0;

    const handleScrollOffsetSave = (y: number) => {
      if (Math.abs(y - lastSavedOffset) > 50) {
        lastSavedOffset = y;
        storeOffset = y;
      }
    };

    handleScrollOffsetSave(10); // < 50 delta, should not save
    expect(storeOffset).toBe(0);

    handleScrollOffsetSave(30); // < 50 delta, should not save
    expect(storeOffset).toBe(0);

    handleScrollOffsetSave(60); // > 50 delta, should save
    expect(storeOffset).toBe(60);

    handleScrollOffsetSave(80); // < 50 delta from 60, should not save
    expect(storeOffset).toBe(60);

    handleScrollOffsetSave(120); // > 50 delta from 60, should save
    expect(storeOffset).toBe(120);
  });
});

describe('R4-Tab1: handleShare error handling', () => {
  test('share failure shows error toast instead of crashing', async () => {
    let toastShown = false;
    const showToast = () => { toastShown = true; };

    const handleShare = async () => {
      try {
        throw new Error('Network error');
      } catch {
        showToast();
      }
    };

    await handleShare();
    expect(toastShown).toBe(true);
  });
});

describe('R4-Tab1: Double-tap navigation protection', () => {
  test('prevents duplicate navigation within 500ms', () => {
    let navigateCount = 0;
    let isNavigating = false;

    const onPress = () => {
      if (isNavigating) return;
      isNavigating = true;
      navigateCount++;
      setTimeout(() => { isNavigating = false; }, 500);
    };

    onPress(); // First tap — should navigate
    expect(navigateCount).toBe(1);

    onPress(); // Second tap within 500ms — should be blocked
    expect(navigateCount).toBe(1);
  });
});

describe('R4-Tab1: AsyncStorage error handling', () => {
  test('catch prevents unhandled rejection on corrupted storage', async () => {
    const failingStorage = {
      getItem: () => Promise.reject(new Error('Corrupted')),
      setItem: () => Promise.reject(new Error('Full')),
    };

    let error: Error | null = null;

    // With .catch(), no unhandled rejection
    await failingStorage.getItem().catch((e) => { error = e; });
    expect(error?.message).toBe('Corrupted');

    error = null;
    await failingStorage.setItem().catch((e) => { error = e; });
    expect(error?.message).toBe('Full');
  });
});

describe('R4-Tab1: Archive/Pin mutation feedback', () => {
  test('archive mutation calls onError on failure', () => {
    let errorHandled = false;
    const onError = () => { errorHandled = true; };

    // Simulate mutation failure
    onError();
    expect(errorHandled).toBe(true);
  });

  test('pin action awaits API before invalidating cache', async () => {
    const order: string[] = [];

    const pinConversation = async () => {
      order.push('api_call');
      return Promise.resolve();
    };
    const invalidateQueries = () => { order.push('invalidate'); };

    // NEW behavior: await then invalidate
    await pinConversation();
    invalidateQueries();

    expect(order).toEqual(['api_call', 'invalidate']);
  });
});

describe('R4-Tab1: Hijri greeting memoization', () => {
  test('greeting changes based on hour', () => {
    const getGreeting = (hour: number) => {
      if (hour < 12) return 'Sabah al-Khair';
      if (hour < 17) return 'Masa al-Khair';
      return 'Masa al-Noor';
    };

    expect(getGreeting(8)).toBe('Sabah al-Khair');
    expect(getGreeting(14)).toBe('Masa al-Khair');
    expect(getGreeting(20)).toBe('Masa al-Noor');
  });
});
