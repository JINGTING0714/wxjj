'use client';
import { useSyncExternalStore } from 'react';
import { MOBILE_MEDIA } from '@/lib/mobile-media';
const subscribe = (notify: () => void) => {
  const query = matchMedia(MOBILE_MEDIA);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
export function useMobile() {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(MOBILE_MEDIA).matches,
    () => false,
  );
}
