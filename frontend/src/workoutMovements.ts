import type { Exercise, WorkoutSetInput } from './types';
import type { StoredDraftMovement } from './workoutDraft';

export type WorkoutDraftSet = WorkoutSetInput & {
  key: string;
  fromPrevious?: boolean;
};

export type WorkoutDraftMovement = {
  key: string;
  exercise: Exercise;
  notes: string;
  machinePhotoIds: string[];
  machinePhotosInitialized: boolean;
  supersetKey: string | null;
  isComplete: boolean;
  sets: WorkoutDraftSet[];
};

/** The exercise tick explicitly completes or clears all of its sets without changing values. */
export function setMovementCompletion(
  movement: WorkoutDraftMovement,
  isComplete: boolean,
): WorkoutDraftMovement {
  return {
    ...movement,
    isComplete,
    // An explicit untick makes these planned sets again, including for inactivity saving.
    sets: movement.sets.map((set) => ({
      ...set,
      completed: isComplete,
      fromPrevious: !isComplete,
    })),
  };
}

/** Restore a draft only when every exercise is available; never return a partial workout. */
export function restoreWorkoutDraftMovements(
  stored: StoredDraftMovement[],
  exercises: Exercise[],
): WorkoutDraftMovement[] | null {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  if (stored.some((movement) => !exerciseById.has(movement.exerciseId))) return null;
  return stored.map((movement) => ({
    key: movement.key,
    exercise: exerciseById.get(movement.exerciseId)!,
    notes: movement.notes,
    machinePhotoIds: movement.machinePhotoIds,
    machinePhotosInitialized: true,
    supersetKey: movement.supersetKey,
    isComplete: movement.isComplete ?? false,
    sets: movement.sets,
  }));
}

export function replaceMovementExercise(
  movements: WorkoutDraftMovement[],
  movementKey: string,
  exercise: Exercise,
): WorkoutDraftMovement[] {
  return movements.map((movement) =>
    movement.key === movementKey
      ? {
          ...movement,
          exercise,
          machinePhotoIds: [],
          machinePhotosInitialized: false,
          isComplete: false,
        }
      : movement,
  );
}
