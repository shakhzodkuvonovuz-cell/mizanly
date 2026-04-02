declare module 'expo-sensors' {
  export interface MagnetometerMeasurement {
    x: number;
    y: number;
    z: number;
    timestamp: number;
  }

  interface SensorData {
    x: number;
    y: number;
    z: number;
    timestamp: number;
  }

  interface Subscription {
    remove(): void;
  }

  export const Magnetometer: {
    isAvailableAsync(): Promise<boolean>;
    addListener(callback: (data: SensorData) => void): Subscription;
    removeAllListeners(): void;
    setUpdateInterval(interval: number): void;
  };

  export const Accelerometer: {
    isAvailableAsync(): Promise<boolean>;
    addListener(callback: (data: SensorData) => void): Subscription;
    removeAllListeners(): void;
    setUpdateInterval(interval: number): void;
  };

  export const DeviceMotion: {
    isAvailableAsync(): Promise<boolean>;
    addListener(callback: (data: Record<string, unknown>) => void): Subscription;
    removeAllListeners(): void;
    setUpdateInterval(interval: number): void;
  };
}
