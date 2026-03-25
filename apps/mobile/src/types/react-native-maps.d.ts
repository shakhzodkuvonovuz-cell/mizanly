// Fix react-native-maps JSX component type incompatibility with React 18+
// The library's types use class component patterns that conflict with newer React types
declare module 'react-native-maps' {
  import { Component } from 'react';
  import { ViewProps } from 'react-native';

  export interface MapViewProps extends ViewProps {
    provider?: string;
    initialRegion?: {
      latitude: number;
      longitude: number;
      latitudeDelta: number;
      longitudeDelta: number;
    };
    region?: {
      latitude: number;
      longitude: number;
      latitudeDelta: number;
      longitudeDelta: number;
    };
    showsUserLocation?: boolean;
    showsMyLocationButton?: boolean;
    mapType?: 'standard' | 'satellite' | 'hybrid' | 'terrain';
    style?: unknown;
    onRegionChangeComplete?: (region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) => void;
    children?: React.ReactNode;
  }

  export interface MarkerProps {
    coordinate: { latitude: number; longitude: number };
    title?: string;
    description?: string;
    pinColor?: string;
    key?: string;
    children?: React.ReactNode;
    onPress?: () => void;
  }

  export const PROVIDER_GOOGLE: string;

  export default class MapView extends Component<MapViewProps> {}
  export class Marker extends Component<MarkerProps> {}
}
