import type { AuthSlice } from './slices/authSlice';
import type { UiSlice } from './slices/uiSlice';
import type { FeedSlice } from './slices/feedSlice';
import type { MediaSlice } from './slices/mediaSlice';
import type { ChatSlice } from './slices/chatSlice';
import type { SettingsSlice } from './slices/settingsSlice';
import type { NetworkSlice } from './slices/networkSlice';
import type { CallSlice } from './slices/callSlice';

export type StoreState =
  & AuthSlice
  & UiSlice
  & FeedSlice
  & MediaSlice
  & ChatSlice
  & SettingsSlice
  & NetworkSlice
  & CallSlice;
