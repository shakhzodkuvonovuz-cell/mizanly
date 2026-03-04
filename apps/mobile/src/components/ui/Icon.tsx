import { colors, iconSize as iconSizes } from '@/theme';
import {
  Heart, MessageCircle, Bookmark, Send, Search, Home,
  Play, MoreHorizontal, Share2, CheckCircle, ArrowLeft,
  Plus, Camera, ImageIcon, Mic, Phone, Video, Settings,
  Bell, User, Users, Globe, Lock, Flag, Trash2, Pencil,
  X, ChevronRight, ChevronLeft, Repeat2, Eye, EyeOff,
  VolumeX, Mail, Hash, TrendingUp, MapPin, Link, Clock,
  Check, CheckCheck, Paperclip, Smile, AtSign, Filter,
  Layers, CirclePlus, Edit3, type LucideProps,
} from 'lucide-react-native';
import type { ComponentType } from 'react';

type IconName =
  | 'heart' | 'heart-filled' | 'message-circle' | 'bookmark' | 'bookmark-filled'
  | 'send' | 'search' | 'home' | 'play' | 'more-horizontal' | 'share'
  | 'check-circle' | 'arrow-left' | 'plus' | 'camera' | 'image' | 'mic'
  | 'phone' | 'video' | 'settings' | 'bell' | 'user' | 'users' | 'globe'
  | 'lock' | 'flag' | 'trash' | 'edit' | 'x' | 'chevron-right' | 'chevron-left'
  | 'repeat' | 'eye' | 'eye-off' | 'volume-x' | 'mail' | 'hash'
  | 'trending-up' | 'map-pin' | 'link' | 'clock' | 'check' | 'check-check'
  | 'paperclip' | 'smile' | 'at-sign' | 'filter' | 'layers' | 'circle-plus'
  | 'pencil';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface IconProps {
  name: IconName;
  size?: Size | number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
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
};

const filledIcons: Set<IconName> = new Set(['heart-filled', 'bookmark-filled']);

export function Icon({ name, size = 'md', color, strokeWidth = 1.75, fill }: IconProps) {
  const LucideIcon = iconMap[name];
  if (!LucideIcon) return null;

  const dim = typeof size === 'number' ? size : iconSizes[size];
  const isFilled = filledIcons.has(name);
  const iconColor = color ?? colors.text.primary;

  return (
    <LucideIcon
      size={dim}
      color={iconColor}
      strokeWidth={strokeWidth}
      fill={isFilled ? (fill ?? iconColor) : 'none'}
    />
  );
}
