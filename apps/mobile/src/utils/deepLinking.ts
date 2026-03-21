import { Linking } from 'react-native';
import { router } from 'expo-router';

export type DeepLinkScreen =
  | 'post'
  | 'profile'
  | 'conversation'
  | 'live'
  | 'event'
  | 'prayer-times'
  | 'audio-room'
  | 'thread'
  | 'reel'
  | 'video'
  | 'notifications'
  | 'settings'
  | 'search'
  | 'hashtag';

export type DeepLinkParams = Record<string, string>;

export interface ParsedDeepLink {
  screen: DeepLinkScreen;
  params: DeepLinkParams;
}

const SCHEME = 'mizanly://';
const HOST = 'mizanly.com'; // Optional web fallback

/**
 * Parse a deep link URL into screen and parameters
 * Supports both custom scheme (mizanly://) and universal links (https://mizanly.com)
 */
export function parseDeepLink(url: string): ParsedDeepLink | null {
  try {
    let path = '';
    let queryParams: DeepLinkParams = {};

    // Handle custom scheme
    if (url.startsWith(SCHEME)) {
      path = url.substring(SCHEME.length);
    }
    // Handle universal links (optional)
    else if (url.includes(HOST)) {
      const parsed = new URL(url);
      path = parsed.pathname + parsed.search;
    } else {
      console.warn('Unsupported deep link URL:', url);
      return null;
    }

    // Remove leading slash
    if (path.startsWith('/')) {
      path = path.substring(1);
    }

    // Split query parameters
    const [pathPart, query] = path.split('?');
    if (query) {
      query.split('&').forEach((pair) => {
        const [key, value] = pair.split('=');
        if (key && value) {
          queryParams[decodeURIComponent(key)] = decodeURIComponent(value);
        }
      });
    }

    // Split path segments
    const segments = pathPart.split('/').filter(Boolean);
    if (segments.length === 0) {
      // Root link - maybe open home
      return { screen: 'post', params: {} };
    }

    const screen = segments[0] as DeepLinkScreen;
    const params: DeepLinkParams = { ...queryParams };

    // Extract ID from path (e.g., post/:id → id param)
    if (segments.length >= 2) {
      const id = segments[1];
      if (screen === 'profile') {
        params.username = id;
      } else if (screen === 'hashtag') {
        params.tag = id;
      } else {
        params.id = id;
      }
    }

    // Additional segment parsing for nested routes (e.g., post/123/comment/456)
    if (segments.length >= 4) {
      const subResource = segments[2];
      const subId = segments[3];
      params[subResource] = subId;
    }

    // Validate screen
    const validScreens: DeepLinkScreen[] = [
      'post',
      'profile',
      'conversation',
      'live',
      'event',
      'prayer-times',
      'audio-room',
      'thread',
      'reel',
      'video',
      'notifications',
      'settings',
      'search',
      'hashtag',
    ];
    if (!validScreens.includes(screen)) {
      console.warn(`Unknown deep link screen: ${screen}`);
      return { screen: 'post', params };
    }

    return { screen, params };
  } catch (error) {
    console.error('Error parsing deep link:', error, url);
    return null;
  }
}

/**
 * Generate a deep link URL for a given screen and parameters
 */
export function getDeepLinkUrl(screen: DeepLinkScreen, params: DeepLinkParams = {}): string {
  const base = `${SCHEME}${screen}`;

  // Handle special cases for ID/username
  let path = '';
  if (params.id && screen !== 'profile' && screen !== 'hashtag') {
    path = `/${params.id}`;
    const { id, ...rest } = params;
    params = rest;
  } else if (params.username && screen === 'profile') {
    path = `/${params.username}`;
    const { username, ...rest } = params;
    params = rest;
  } else if (params.tag && screen === 'hashtag') {
    path = `/${params.tag}`;
    const { tag, ...rest } = params;
    params = rest;
  }

  // Add query parameters
  const queryString = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  const url = `${base}${path}${queryString ? '?' + queryString : ''}`;
  return url;
}

/**
 * Navigate to a deep link URL using expo-router
 */
export function navigateToDeepLink(url: string): boolean {
  const parsed = parseDeepLink(url);
  if (!parsed) return false;

  const { screen, params } = parsed;

  switch (screen) {
    case 'post':
      if (params.id) {
        router.push(`/(screens)/post/${params.id}` as never);
      } else {
        router.push('/(tabs)/saf' as never);
      }
      break;

    case 'profile':
      if (params.username) {
        router.push(`/(screens)/profile/${params.username}` as never);
      } else if (params.id) {
        router.push(`/(screens)/profile/${params.id}` as never);
      } else {
        router.push('/(tabs)/saf' as never);
      }
      break;

    case 'conversation':
      if (params.id) {
        router.push(`/(screens)/conversation/${params.id}` as never);
      } else {
        router.push('/(tabs)/risalah' as never);
      }
      break;

    case 'live':
      if (params.id) {
        router.push(`/(screens)/live/${params.id}` as never);
      } else {
        router.push('/(tabs)/minbar' as never);
      }
      break;

    case 'event':
      if (params.id) {
        router.push(`/(screens)/event-detail?id=${params.id}` as never);
      } else {
        router.push('/(tabs)/saf' as never);
      }
      break;

    case 'prayer-times':
      router.push('/(screens)/prayer-times' as never);
      break;

    case 'audio-room':
      if (params.id) {
        router.push(`/(screens)/audio-room?id=${params.id}` as never);
      } else {
        router.push('/(screens)/audio-rooms' as never);
      }
      break;

    case 'thread':
      if (params.id) {
        router.push(`/(screens)/thread/${params.id}` as never);
      } else {
        router.push('/(tabs)/majlis' as never);
      }
      break;

    case 'reel':
      if (params.id) {
        router.push(`/(screens)/reel/${params.id}` as never);
      } else {
        router.push('/(tabs)/bakra' as never);
      }
      break;

    case 'video':
      if (params.id) {
        router.push(`/(screens)/video/${params.id}` as never);
      } else {
        router.push('/(tabs)/minbar' as never);
      }
      break;

    case 'hashtag':
      if (params.tag) {
        router.push(`/(screens)/hashtag/${params.tag}` as never);
      } else {
        router.push('/(screens)/search' as never);
      }
      break;

    case 'notifications':
      router.push('/(screens)/notifications' as never);
      break;

    case 'settings':
      router.push('/(screens)/settings' as never);
      break;

    case 'search':
      router.push('/(screens)/search' as never);
      break;

    default:
      console.warn(`Unhandled deep link screen: ${screen}`);
      return false;
  }

  return true;
}

/**
 * Initialize deep link listeners for cold starts and background
 */
export function setupDeepLinkListeners() {
  const handleUrl = (url: string | null) => {
    if (url) {
      navigateToDeepLink(url);
    }
  };

  // Get initial URL if app was launched from a deep link
  Linking.getInitialURL().then(handleUrl);

  // Listen for incoming deep links while app is running
  const subscription = Linking.addEventListener('url', (event) => {
    handleUrl(event.url);
  });

  return () => subscription.remove();
}