import { describe, expect, it } from 'vitest';
import { cachedWorkoutsForRevision, type CachedWorkoutSnapshot } from './workoutCache';
import type { TrackedWorkout } from './types';

describe('workout cache revision matching', () => {
  const cached = { revision: 'revision-one', workouts: [] } satisfies CachedWorkoutSnapshot;

  it('reuses workouts only while the server revision matches', () => {
    expect(cachedWorkoutsForRevision(cached, 'revision-one')).toEqual([]);
    expect(cachedWorkoutsForRevision(cached, 'revision-two')).toBeNull();
    expect(cachedWorkoutsForRevision(null, 'revision-one')).toBeNull();
  });

  it('serves a window only from a cache reaching back that far', () => {
    const workouts = [
      { id: 'recent', workout_date: '2026-06-01' },
      { id: 'older', workout_date: '2025-12-01' },
    ] as TrackedWorkout[];
    const windowed = { revision: 'one', workouts, since: '2025-11-01' };

    expect(
      cachedWorkoutsForRevision(windowed, 'one', '2026-05-01')?.map((item) => item.id),
    ).toEqual(['recent']);
    expect(cachedWorkoutsForRevision(windowed, 'one', '2025-11-01')).toHaveLength(2);
    expect(cachedWorkoutsForRevision(windowed, 'one', '2025-05-01')).toBeNull();
    // A whole-history cache from an earlier release covers any window, but not the reverse.
    expect(
      cachedWorkoutsForRevision({ revision: 'one', workouts }, 'one', '2026-05-01'),
    ).toHaveLength(1);
    expect(cachedWorkoutsForRevision(windowed, 'one')).toBeNull();
  });
});
