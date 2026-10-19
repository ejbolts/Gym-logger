import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * A count from the server, refreshed whenever `active` turns on or the app regains focus.
 * `load` must keep the same identity between renders, such as a module-level function.
 */
export function useRefreshedCount(
  load: () => Promise<number>,
  active: boolean,
  enabled: boolean,
): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active || !enabled) return;
    let cancelled = false;
    function refresh() {
      if (document.visibilityState === 'hidden') return;
      void load()
        .then((next) => {
          if (!cancelled) setCount(next);
        })
        .catch(() => undefined);
    }
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load, active, enabled]);
  return enabled ? count : 0;
}

const loadFollowRequestCount = () =>
  api.sharing
    .choices()
    .then((settings) => (settings.visibility === 'private' ? 0 : settings.pending_requests));

/** The profile button's label, including follow requests and feedback waiting for review. */
export function profileButtonLabel(
  name: string | undefined,
  followRequests: number,
  openFeedback: number,
): string {
  const waiting = [
    followRequests > 0 &&
      `${followRequests} follow ${followRequests === 1 ? 'request' : 'requests'}`,
    openFeedback > 0 &&
      `${openFeedback} feedback ${openFeedback === 1 ? 'message' : 'messages'} to review`,
  ].filter(Boolean);
  return [name ? `Profile: ${name}` : 'Profile', ...waiting].join(', ');
}

/** Follow requests waiting for approval, refreshed whenever `active` turns on. */
export function useFollowRequestCount(active: boolean, enabled: boolean): number {
  return useRefreshedCount(loadFollowRequestCount, active, enabled);
}

const loadOpenFeedbackCount = () => api.admin.feedbackSummary().then((summary) => summary.open);

/** App feedback an administrator has not resolved yet, refreshed whenever `active` turns on. */
export function useOpenFeedbackCount(active: boolean, isAdmin: boolean): number {
  return useRefreshedCount(loadOpenFeedbackCount, active, isAdmin);
}
