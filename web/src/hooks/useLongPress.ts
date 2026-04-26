import { useCallback, useRef } from 'react';
import type React from 'react';

/**
 * Touch-only long-press handler. Returns event handlers to spread onto an
 * element plus `didLongPress()` so the consumer's onClick can suppress the
 * navigation/click that would otherwise fire on touchend.
 */
export function useLongPress(cb: () => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const start = useCallback(() => {
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      cb();
    }, ms);
  }, [cb, ms]);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const didLongPress = useCallback(() => fired.current, []);

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onTouchCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    didLongPress,
  };
}
