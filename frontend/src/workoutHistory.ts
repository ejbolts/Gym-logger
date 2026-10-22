import { addDays, weekStartFor } from './trainingSummary';

export function workoutPageForId(
  workouts: ReadonlyArray<{ id: string }>,
  workoutId: string | null,
  pageSize: number,
): number | null {
  if (workoutId === null) return null;
  const index = workouts.findIndex((workout) => workout.id === workoutId);
  return index < 0 ? null : Math.floor(index / pageSize) + 1;
}

export function upsertWorkoutByRecency<
  T extends { id: string; workout_date: string; created_at: string },
>(workouts: ReadonlyArray<T>, saved: T): T[] {
  return [saved, ...workouts.filter((workout) => workout.id !== saved.id)].sort(
    (left, right) =>
      right.workout_date.localeCompare(left.workout_date) ||
      right.created_at.localeCompare(left.created_at),
  );
}
/** Show the latest workout's calendar week and the two preceding weeks, in full. */
export function initialHistoryVisibleCount(
  workouts: ReadonlyArray<{ workout_date: string }>,
  weekStartDay: number,
): number {
  if (!workouts.length) return 0;
  const start = addDays(weekStartFor(workouts[0].workout_date, weekStartDay), -14);
  return workouts.filter((workout) => workout.workout_date >= start).length;
}
