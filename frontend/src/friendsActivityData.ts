import { useEffect, useState } from 'react';
import { api } from './api';
import type { SharedProfileSummary, TrackedWorkout } from './types';

const FRIENDS_SHOWN = 5;

export interface FriendWorkout {
  friend: SharedProfileSummary;
  workout: TrackedWorkout | null;
}

/** Friends you follow and can see, most recently active first, each with their latest workout. */
export async function loadFriendWorkouts(
  profiles: SharedProfileSummary[],
): Promise<FriendWorkout[]> {
  const friends = profiles
    .filter(
      (profile) =>
        !profile.is_you &&
        profile.follow_status === 'accepted' &&
        profile.can_view &&
        profile.last_workout_date !== null,
    )
    .sort((left, right) => right.last_workout_date!.localeCompare(left.last_workout_date!))
    .slice(0, FRIENDS_SHOWN);
  return Promise.all(
    friends.map(async (friend) => {
      try {
        const page = await api.sharing.workouts(friend.id, 0, 1);
        return { friend, workout: page.workouts[0] ?? null };
      } catch {
        return { friend, workout: null };
      }
    }),
  );
}

/** A friend's Workouts, Cardio and PRs totals, matching the stats on your own Today profile. */
export function friendActivityTotals(friend: SharedProfileSummary) {
  return [
    {
      key: 'workouts',
      icon: 'calendar',
      value: friend.workout_count,
      label: ['workout', 'workouts'],
    },
    {
      key: 'cardio',
      icon: 'heart',
      value: friend.cardio_count,
      label: ['cardio session', 'cardio sessions'],
    },
    { key: 'records', icon: 'trophy', value: friend.record_count, label: ['PR', 'PRs'] },
  ] as const;
}

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
