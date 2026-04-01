import { Linking } from 'react-native';
import { navigate } from '@/utils/navigation';

type DeepLinkScreen =
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

type DeepLinkParams = Record<string, string>;

interface ParsedDeepLink {
  screen: DeepLinkScreen;
  params: DeepLinkParams;
}

const SCHEME = 'mizanly://';
const HOST = 'mizanly.com'; // Optional web fallback

/**
 * Parse a deep link URL into screen and parameters
 * Supports both custom scheme (mizanly://) and universal links (https://mizanly.com)
 */
function parseDeepLink(url: string): ParsedDeepLink | null {
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
      if (__DEV__) console.warn('Unsupported deep link URL:', url);
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
      if (__DEV__) console.warn(`Unknown deep link screen: ${screen}`);
      return { screen: 'post', params };
    }

    return { screen, params };
  } catch (error) {
    if (__DEV__) console.error('Error parsing deep link:', error, url);
    return null;
  }
}

/**
 * Navigate to a deep link URL using expo-router
 */
function navigateToDeepLink(url: string): boolean {
  const parsed = parseDeepLink(url);
  if (!parsed) return false;

  const { screen, params } = parsed;

  switch (screen) {
    case 'post':
      if (params.id) {
        navigate(`/(screens)/post/${params.id}`);
      } else {
        navigate('/(tabs)/saf');
      }
      break;

    case 'profile':
      if (params.username) {
        navigate(`/(screens)/profile/${params.username}`);
      } else if (params.id) {
        navigate(`/(screens)/profile/${params.id}`);
      } else {
        navigate('/(tabs)/saf');
      }
      break;

    case 'conversation':
      if (params.id) {
        navigate(`/(screens)/conversation/${params.id}`);
      } else {
        navigate('/(tabs)/risalah');
      }
      break;

    case 'live':
      if (params.id) {
        navigate(`/(screens)/live/${params.id}`);
      } else {
        navigate('/(tabs)/minbar');
      }
      break;

    case 'event':
      if (params.id) {
        navigate(`/(screens)/event-detail?id=${params.id}`);
      } else {
        navigate('/(tabs)/saf');
      }
      break;

    case 'prayer-times':
      navigate('/(screens)/prayer-times');
      break;

    case 'audio-room':
      if (params.id) {
        navigate(`/(screens)/audio-room?id=${params.id}`);
      } else {
        navigate('/(screens)/audio-rooms');
      }
      break;

    case 'thread':
      if (params.id) {
        navigate(`/(screens)/thread/${params.id}`);
      } else {
        navigate('/(tabs)/majlis');
      }
      break;

    case 'reel':
      if (params.id) {
        navigate(`/(screens)/reel/${params.id}`);
      } else {
        navigate('/(tabs)/bakra');
      }
      break;

    case 'video':
      if (params.id) {
        navigate(`/(screens)/video/${params.id}`);
      } else {
        navigate('/(tabs)/minbar');
      }
      break;

    case 'hashtag':
      if (params.tag) {
        navigate(`/(screens)/hashtag/${params.tag}`);
      } else {
        navigate('/(screens)/search');
      }
      break;

    case 'notifications':
      navigate('/(screens)/notifications');
      break;

    case 'settings':
      navigate('/(screens)/settings');
      break;

    case 'search':
      navigate('/(screens)/search');
      break;

    default:
      if (__DEV__) console.warn(`Unhandled deep link screen: ${screen}`);
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