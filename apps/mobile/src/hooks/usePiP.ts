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

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const enterPiP = useCallback(() => {
    if (!isPiPSupported || !isPlayingRef.current) return;
    try {
      // Android: Use native PiP mode via activity
      if (Platform.OS === 'android') {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { NativeModules } = require('react-native') as {
          NativeModules: NativeModulesWithPiP;
        };
        NativeModules.PiPModule?.enterPiPMode?.();
      }
      // iOS: expo-av handles PiP natively via useNativeControls prop on the Video component.
      // This state update is for tracking only — the actual PiP window is managed by AVPlayerViewController.
      setIsPiPActive(true);
      onPiPChangeRef.current?.(true);
    } catch {
      // PiP not available on this device
    }
  }, [isPiPSupported]);

  const exitPiP = useCallback(() => {
    setIsPiPActive(false);
    onPiPChangeRef.current?.(false);
  }, []);

  // Auto-enter PiP when app goes to background while video is playing
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // No need to check isPlaying/isPiPSupported here — enterPiP already guards both
      if (state === 'background') {
        enterPiP();
      } else if (state === 'active' && isPiPActive) {
        exitPiP();
      }
    });
    return () => subscription.remove();
  }, [isPiPActive, enterPiP, exitPiP]);

  return { isPiPActive, isPiPSupported, enterPiP, exitPiP };
}
