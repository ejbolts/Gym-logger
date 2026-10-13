import { api, WorkoutConflictError } from './api';
import type { TrackedWorkout, WorkoutInput } from './types';

/** How the person resolves a save refused because the workout changed on another device. */
export type WorkoutConflictChoice = 'keep-mine' | 'load-latest' | 'cancel';

export type WorkoutSaveOutcome =
  | { status: 'saved'; workout: TrackedWorkout }
  /** The person discarded their changes in favour of this latest saved version. */
  | { status: 'discarded'; workout: TrackedWorkout };

export const WORKOUT_CONFLICT_UNRESOLVED =
  'Not saved: this workout was changed on another device. Your changes are still here.';

/**
 * Saves a new workout (`workoutId` null) or changes to a saved one. If another device saved the
 * workout after this editor loaded it, the person chooses which version to keep: theirs is then
 * saved over the latest revision, or the latest is kept and their changes are discarded.
 */
export async function saveWorkoutResolvingConflicts(
  payload: WorkoutInput,
  workoutId: string | null,
  chooseVersion: (latest: TrackedWorkout) => Promise<WorkoutConflictChoice>,
  track: <T>(operation: () => Promise<T>) => Promise<T> = (operation) => operation(),
): Promise<WorkoutSaveOutcome> {
  let save = () => (workoutId ? api.updateWorkout(workoutId, payload) : api.createWorkout(payload));
  for (;;) {
    try {
      return { status: 'saved', workout: await track(save) };
    } catch (error) {
      if (!(error instanceof WorkoutConflictError)) throw error;
      const latest = await track(() => api.getWorkout(error.workoutId));
      const choice = await chooseVersion(latest);
      if (choice === 'load-latest') return { status: 'discarded', workout: latest };
      if (choice === 'cancel') throw new Error(WORKOUT_CONFLICT_UNRESOLVED);
      save = () => api.updateWorkout(latest.id, { ...payload, base_revision: latest.revision });
    }
  }
}
