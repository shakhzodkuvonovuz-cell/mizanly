// Type declarations for Expo modules that may not be installed
declare module 'expo-location' {
  export function requestForegroundPermissionsAsync(): Promise<{ status: string }>;
  export function getCurrentPositionAsync(options?: { accuracy?: number }): Promise<{
    coords: { latitude: number; longitude: number; altitude: number | null; accuracy: number | null };
    timestamp: number;
  }>;
  export function reverseGeocodeAsync(location: { latitude: number; longitude: number }): Promise<Array<{
    city: string | null;
    country: string | null;
    district: string | null;
    name: string | null;
    postalCode: string | null;
    region: string | null;
    street: string | null;
  }>>;
  export function geocodeAsync(address: string): Promise<Array<{ latitude: number; longitude: number; altitude: number | null; accuracy: number | null }>>;
  export const Accuracy: { Balanced: number; High: number; Highest: number; Low: number; Lowest: number };
}

declare module 'expo-sensors' {
  export interface MagnetometerMeasurement {
    x: number;
    y: number;
    z: number;
    timestamp: number;
  }
  export const Magnetometer: {
    isAvailableAsync(): Promise<boolean>;
    addListener(listener: (data: MagnetometerMeasurement) => void): { remove(): void };
    setUpdateInterval(intervalMs: number): void;
  };
}

declare module 'expo-contacts' {
  export function requestPermissionsAsync(): Promise<{ status: string }>;
  export function getContactsAsync(options?: {
    fields?: string[];
    pageSize?: number;
    pageOffset?: number;
    sort?: string;
  }): Promise<{ data: Contact[]; hasNextPage: boolean; hasPreviousPage: boolean; total: number }>;
  export interface Contact {
    id: string;
    name: string;
    firstName?: string;
    lastName?: string;
    phoneNumbers?: Array<{ number: string; label?: string }>;
    emails?: Array<{ email: string; label?: string }>;
    imageAvailable?: boolean;
    image?: { uri: string };
  }
  export const Fields: Record<string, string>;
  export const SortTypes: Record<string, string>;
}
