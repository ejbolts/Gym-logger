import { useState } from 'react';
import releaseHistory from '../release-history.json';
import releaseMetadata from '../release.json';
import { hasSeenRelease, rememberRelease } from './releaseAnnouncements';
import { parseRelease, parseReleaseHistory } from './releaseMetadata';

const bundledRelease = parseRelease(releaseMetadata)!;
const bundledHistory = parseReleaseHistory(releaseHistory, bundledRelease.version)!;

/** Announce the release actually running, once per account and browser. */
export function useReleaseAnnouncement(userId: string | null) {
  const [state, setState] = useState(() => ({
    userId,
    open: userId !== null && !hasSeenRelease(userId, bundledRelease.version),
  }));
  return {
    release: bundledRelease,
    history: bundledHistory,
    open:
      userId !== null &&
      (state.userId === userId ? state.open : !hasSeenRelease(userId, bundledRelease.version)),
    checked: true,
    show: () => setState({ userId, open: true }),
    dismiss: () => {
      if (userId) rememberRelease(userId, bundledRelease.version);
      setState({ userId, open: false });
    },
  };
}
