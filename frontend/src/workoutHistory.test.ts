import { describe, expect, it } from 'vitest';
import {
  initialHistoryVisibleCount,
  upsertWorkoutByRecency,
  workoutPageForId,
} from './workoutHistory';

describe('initial History visibility', () => {
  it('includes every workout in the latest three calendar weeks, rather than a fixed count', () => {
    const workouts = [
      ...Array.from({ length: 20 }, () => ({ workout_date: '2026-10-21' })),
      { workout_date: '2026-10-05' },
      { workout_date: '2026-10-04' },
    ];
    expect(initialHistoryVisibleCount(workouts, 1)).toBe(21);
    expect(initialHistoryVisibleCount(workouts, 0)).toBe(22);
  });

  it('anchors to the latest workout and counts empty weeks across a year boundary', () => {
    expect(
      initialHistoryVisibleCount(
        ['2026-01-06', '2025-12-22', '2025-12-21'].map((workout_date) => ({ workout_date })),
        1,
      ),
    ).toBe(2);
    expect(initialHistoryVisibleCount([], 1)).toBe(0);
  });
});

describe('workout history navigation', () => {
  const workouts = Array.from({ length: 17 }, (_, index) => ({ id: `workout-${index}` }));

  it('finds the matching page in displayed workout order, including page boundaries', () => {
    expect(workoutPageForId(workouts, 'workout-0', 8)).toBe(1);
    expect(workoutPageForId(workouts, 'workout-7', 8)).toBe(1);
    expect(workoutPageForId(workouts, 'workout-8', 8)).toBe(2);
    expect(workoutPageForId(workouts, 'workout-16', 8)).toBe(3);
  });

  it('targets the exact workout ID even when workouts share a date', () => {
    const sameDayWorkouts = [
      { id: 'evening', workout_date: '2026-08-27' },
      { id: 'morning', workout_date: '2026-08-27' },
    ];
    expect(workoutPageForId(sameDayWorkouts, 'morning', 1)).toBe(2);
    expect(workoutPageForId(sameDayWorkouts, 'evening', 1)).toBe(1);
  });

  it('does not navigate to an unrelated workout when the target is missing', () => {
    expect(workoutPageForId(workouts, 'deleted', 8)).toBeNull();
    expect(workoutPageForId(workouts, null, 8)).toBeNull();
    expect(workoutPageForId([], 'workout-0', 8)).toBeNull();
  });
});

describe('optimistic workout history updates', () => {
  const older = {
    id: 'older',
    workout_date: '2026-08-30',
    created_at: '2026-08-30T08:00:00Z',
  };
  const newer = {
    id: 'newer',
    workout_date: '2026-08-31',
    created_at: '2026-08-31T08:00:00Z',
  };

  it('inserts a saved workout in display order', () => {
    expect(upsertWorkoutByRecency([older], newer)).toEqual([newer, older]);
  });

  it('replaces an edited workout without duplicating it', () => {
    const edited = { ...older, workout_date: '2026-09-01' };

    expect(upsertWorkoutByRecency([newer, older], edited)).toEqual([edited, newer]);
  });
});
