import { View, I18nManager } from 'react-native';
import { colors, iconSize as iconSizes } from '@/theme';
import {
  Heart, MessageCircle, Bookmark, Send, Search, Home,
  Play, MoreHorizontal, Share2, CheckCircle, ArrowLeft, ArrowRight,
  Plus, Camera, ImageIcon, Mic, Phone, Video, Settings,
  Bell, User, Users, UserPlus, Globe, Lock, Flag, Trash2, Pencil,
  X, ChevronRight, ChevronLeft, ChevronDown, Repeat2, Eye, EyeOff,
  VolumeX, Mail, Hash, TrendingUp, TrendingDown, MapPin, Link, Clock,
  Check, CheckCheck, Paperclip, Smile, AtSign, Filter,
  Layers, CirclePlus, Edit3, Slash, LogOut, BarChart2, Loader,
  Maximize, Pause, Rewind, FastForward, Volume1, Volume2, Music,
  Sun, Circle, Droplet, SlidersHorizontal, Minus, Square,
  Moon, Star, Gift, BookOpen, Calculator, Calendar,
  Scissors, Type, LayoutGrid, Archive, Briefcase, CreditCard,
  Radio, Info, FileText, Shield, Download, ThumbsDown, AlertCircle,
  type LucideProps,
} from 'lucide-react-native';
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type IconName =
  | 'heart' | 'heart-filled' | 'message-circle' | 'bookmark' | 'bookmark-filled'
  | 'send' | 'search' | 'home' | 'play' | 'pause' | 'rewind' | 'fast-forward' | 'more-horizontal' | 'share'
  | 'check-circle' | 'arrow-left' | 'plus' | 'camera' | 'image' | 'mic'
  | 'phone' | 'video' | 'settings' | 'bell' | 'user' | 'users' | 'globe'
  | 'lock' | 'flag' | 'trash' | 'edit' | 'x' | 'chevron-right' | 'chevron-left'
  | 'repeat' | 'eye' | 'eye-off' | 'volume-x' | 'volume-1' | 'volume-2' | 'mail' | 'hash'
  | 'trending-up' | 'map-pin' | 'link' | 'clock' | 'check' | 'check-check'
  | 'paperclip' | 'smile' | 'at-sign' | 'filter' | 'layers' | 'circle-plus'
  | 'pencil' | 'slash' | 'log-out' | 'bar-chart-2' | 'chevron-down' | 'loader'
  | 'maximize' | 'music'
  | 'sun' | 'circle' | 'droplet' | 'sliders'
  | 'moon' | 'star' | 'gift' | 'book-open' | 'calculator' | 'calendar'
  | 'scissors' | 'type' | 'layout'
  | 'arrow-right' | 'user-plus' | 'radio' | 'info' | 'file-text' | 'shield' | 'download' | 'thumbs-down'
  | 'trending-down' | 'minus' | 'square' | 'archive' | 'briefcase' | 'credit-card' | 'alert-circle';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface IconProps {
  name: IconName;
  size?: Size | number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  style?: StyleProp<ViewStyle>;
}

const iconMap: Record<IconName, ComponentType<LucideProps>> = {
  'heart': Heart,
  'heart-filled': Heart,
  'message-circle': MessageCircle,
  'bookmark': Bookmark,
  'bookmark-filled': Bookmark,
  'send': Send,
  'search': Search,
  'home': Home,
  'play': Play,
  'more-horizontal': MoreHorizontal,
  'share': Share2,
  'check-circle': CheckCircle,
  'arrow-left': ArrowLeft,
  'plus': Plus,
  'camera': Camera,
  'image': ImageIcon,
  'mic': Mic,
  'phone': Phone,
  'video': Video,
  'settings': Settings,
  'bell': Bell,
  'user': User,
  'users': Users,
  'globe': Globe,
  'lock': Lock,
  'flag': Flag,
  'trash': Trash2,
  'edit': Edit3,
  'x': X,
  'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft,
  'repeat': Repeat2,
  'eye': Eye,
  'eye-off': EyeOff,
  'volume-x': VolumeX,
  'mail': Mail,
  'hash': Hash,
  'trending-up': TrendingUp,
  'map-pin': MapPin,
  'link': Link,
  'clock': Clock,
  'check': Check,
  'check-check': CheckCheck,
  'paperclip': Paperclip,
  'smile': Smile,
  'at-sign': AtSign,
  'filter': Filter,
  'layers': Layers,
  'circle-plus': CirclePlus,
  'pencil': Pencil,
  'slash': Slash,
  'log-out': LogOut,
  'bar-chart-2': BarChart2,
  'chevron-down': ChevronDown,
  'loader': Loader,
  'maximize': Maximize,
  'pause': Pause,
  'rewind': Rewind,
  'fast-forward': FastForward,
  'volume-1': Volume1,
  'volume-2': Volume2,
  'music': Music,
  'sun': Sun,
  'circle': Circle,
  'droplet': Droplet,
  'sliders': SlidersHorizontal,
  'moon': Moon,
  'star': Star,
  'gift': Gift,
  'book-open': BookOpen,
  'calculator': Calculator,
  'calendar': Calendar,
  'scissors': Scissors,
  'type': Type,
  'layout': LayoutGrid,
  'arrow-right': ArrowRight,
  'user-plus': UserPlus,
  'radio': Radio,
  'info': Info,
  'file-text': FileText,
  'shield': Shield,
  'download': Download,
  'thumbs-down': ThumbsDown,
  'trending-down': TrendingDown,
  'minus': Minus,
  'square': Square,
  'archive': Archive,
  'briefcase': Briefcase,
  'credit-card': CreditCard,
  'alert-circle': AlertCircle,
};

const filledIcons: Set<IconName> = new Set(['heart-filled', 'bookmark-filled']);

const MIRROR_IN_RTL: Set<IconName> = new Set(['arrow-left', 'chevron-left', 'chevron-right']);

export function Icon({ name, size = 'md', color, strokeWidth = 1.75, fill, style }: IconProps) {
  const LucideIcon = iconMap[name];
  if (!LucideIcon) return null;

  const dim = typeof size === 'number' ? size : iconSizes[size];
  const isFilled = filledIcons.has(name);
  const iconColor = color ?? colors.text.primary;
  const shouldMirror = I18nManager.isRTL && MIRROR_IN_RTL.has(name);

  const icon = (
    <LucideIcon
      size={dim}
      color={iconColor}
      strokeWidth={strokeWidth}
      fill={isFilled ? (fill ?? iconColor) : 'none'}
      style={style as LucideProps['style']}
    />
  );

  if (shouldMirror) {
    return (
      <View style={[{ transform: [{ scaleX: -1 }] }, style]}>
        {icon}
      </View>
    );
  }

  return icon;
}
