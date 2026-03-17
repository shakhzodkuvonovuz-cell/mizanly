import { useRef, useCallback, useState, useEffect } from 'react';
import { AppState, Platform } from 'react-native';

interface PiPConfig {
  isPlaying: boolean;
  onPiPChange?: (active: boolean) => void;
}

interface PiPModule {
  enterPiPMode?: () => void;
}

interface NativeModulesWithPiP {
  PiPModule?: PiPModule;
}

export function usePiP({ isPlaying, onPiPChange }: PiPConfig) {
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [isPiPSupported] = useState(Platform.OS === 'android' || Platform.OS === 'ios');
  const onPiPChangeRef = useRef(onPiPChange);

  useEffect(() => {
    onPiPChangeRef.current = onPiPChange;
  }, [onPiPChange]);

  const enterPiP = useCallback(() => {
    if (!isPiPSupported || !isPlaying) return;
    try {
      // Android: Use native PiP mode via activity
      if (Platform.OS === 'android') {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { NativeModules } = require('react-native') as {
          NativeModules: NativeModulesWithPiP;
        };
        NativeModules.PiPModule?.enterPiPMode?.();
      }
      // iOS: handled via expo-av useNativeControls
      setIsPiPActive(true);
      onPiPChangeRef.current?.(true);
    } catch {
      // PiP not available on this device
    }
  }, [isPiPSupported, isPlaying]);

  const exitPiP = useCallback(() => {
    setIsPiPActive(false);
    onPiPChangeRef.current?.(false);
  }, []);

  // Auto-enter PiP when app goes to background while video is playing
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' && isPlaying && isPiPSupported) {
        enterPiP();
      } else if (state === 'active' && isPiPActive) {
        exitPiP();
      }
    });
    return () => subscription.remove();
  }, [isPlaying, isPiPActive, isPiPSupported, enterPiP, exitPiP]);

  return { isPiPActive, isPiPSupported, enterPiP, exitPiP };
}
