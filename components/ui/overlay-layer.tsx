'use client';
import {
  useLayoutEffect,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
let nextLayer = 1000;
/** Portals mount when opened. A shared order works for both dialogs and drawers,
 * including a drawer launched from a dialog and a dialog launched from a drawer. */
export function OverlayLayer({
  children,
}: {
  children: (style: CSSProperties) => ReactNode;
}) {
  const [layer, setLayer] = useState(1000);
  useLayoutEffect(() => {
    const value = (nextLayer += 2);
    setLayer(value);
    document.documentElement.style.setProperty(
      '--prism-modal-top',
      String(value),
    );
  }, []);
  return children({ '--prism-overlay-layer': layer } as CSSProperties);
}
