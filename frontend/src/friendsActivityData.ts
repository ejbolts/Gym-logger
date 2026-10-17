import { useEffect, useState } from 'react';
import { api } from './api';
import { plural } from './sharedProfileDisplay';
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

export function friendWorkoutSummary(workout: TrackedWorkout): string {
  const sets = workout.movements.reduce(
    (total, movement) => total + movement.sets.filter((item) => item.completed).length,
    0,
  );
  return [plural(workout.movements.length, 'exercise'), plural(sets, 'set')].join(' · ');
}

/** Follow requests waiting for approval, refreshed whenever `active` turns on. */
export function useFollowRequestCount(active: boolean, enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active || !enabled) return;
    let cancelled = false;
    function refresh() {
      if (document.visibilityState === 'hidden') return;
      void api.sharing
        .choices()
        .then((settings) => {
          if (!cancelled)
            setCount(settings.visibility === 'private' ? 0 : settings.pending_requests);
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
  }, [active, enabled]);
  return enabled ? count : 0;
}
