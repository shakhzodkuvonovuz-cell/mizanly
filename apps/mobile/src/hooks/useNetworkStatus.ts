import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { useStore } from '@/store';

export function useNetworkStatus() {
  const setIsOffline = useStore((s) => s.setIsOffline);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
    return unsubscribe;
  }, [setIsOffline]);
}