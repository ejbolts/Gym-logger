import { useEffect, useRef } from 'react';

/** How long the app must be in the background before returning refreshes its data. */
export const FOREGROUND_REFRESH_AFTER_MS = 30_000;

/**
 * Calls `refresh` when the app returns to the foreground after being hidden for a while, so
 * changes saved on another device appear. Pass `enabled` false while an unsaved edit is open:
 * its editor keeps the version it loaded, and saving checks that version on the server.
 */
export function useForegroundRefresh(
  enabled: boolean,
  refresh: () => void,
  minimumHiddenMs = FOREGROUND_REFRESH_AFTER_MS,
): void {
  const latest = useRef({ enabled, refresh });
  useEffect(() => {
    latest.current = { enabled, refresh };
  });
  useEffect(() => {
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt ??= Date.now();
        return;
      }
      const hiddenFor = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (hiddenFor >= minimumHiddenMs && latest.current.enabled) latest.current.refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [minimumHiddenMs]);
}
