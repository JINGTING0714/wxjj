'use client';

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/sw.js`)
        .then(async () => {
          const registration = await navigator.serviceWorker.ready;
          const urls = performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((value) => {
              const url = new URL(value, location.href);
              return (
                url.origin === location.origin &&
                /\.(?:js|mjs|css|woff2?|svg|png)(?:$|\?)/i.test(url.pathname)
              );
            });
          registration.active?.postMessage({ type: 'PRISM_CACHE_SHELL', urls });
        })
        .catch(() => {
          // The app remains fully usable online if the browser blocks installation.
        });
    }
  }, []);

  return null;
}
