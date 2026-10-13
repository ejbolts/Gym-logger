import { useEffect, useState } from 'react';
import releaseMetadata from '../release.json';
import {
  fetchRelease,
  hasSeenRelease,
  rememberRelease,
  watchReleases,
} from './releaseAnnouncements';
import { parseRelease } from './releaseMetadata';

const bundledRelease = parseRelease(releaseMetadata)!;

/**
 * Opens unseen release notes once per account and version. A brand-new account's first
 * session (`firstRun`) has nothing to catch up on, so every release it meets is recorded
 * as seen instead of interrupting the welcome.
 */
export function useReleaseAnnouncement(userId: string | null, { firstRun = false } = {}) {
  const [state, setState] = useState({ release: bundledRelease, open: false, checked: false });

  useEffect(() => {
    if (!userId) return;
    if (firstRun) rememberRelease(userId, bundledRelease.version);
    // A failed first check still counts, so popups queued behind this one are not held forever.
    const checkedWithoutRelease = () => setState((current) => ({ ...current, checked: true }));
    return watchReleases(
      (release) => {
        if (firstRun) rememberRelease(userId, release.version);
        setState((current) => ({
          release,
          checked: true,
          open:
            (current.open && current.release.version === release.version) ||
            !hasSeenRelease(userId, release.version),
        }));
      },
      () =>
        fetchRelease().then(
          (release) => {
            if (!release) checkedWithoutRelease();
            return release;
          },
          (reason: unknown) => {
            checkedWithoutRelease();
            throw reason;
          },
        ),
    );
  }, [userId, firstRun]);

  return {
    release: state.release,
    open: userId !== null && state.open,
    checked: state.checked,
    show: () => setState((current) => ({ ...current, open: true })),
    dismiss: () => {
      if (userId) rememberRelease(userId, state.release.version);
      setState((current) => ({ ...current, open: false }));
    },
  };
}
