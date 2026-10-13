import { useCallback, useState, type ReactNode } from 'react';
import type { TrackedWorkout } from './types';
import { WorkoutConflictDialog } from './WorkoutConflictDialog';
import type { WorkoutConflictChoice } from './workoutSave';

/** Asks which version to keep after a save conflict; render `dialog` while one is pending. */
export function useWorkoutConflictPrompt(): {
  chooseVersion: (latest: TrackedWorkout) => Promise<WorkoutConflictChoice>;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<{
    latest: TrackedWorkout;
    resolve: (choice: WorkoutConflictChoice) => void;
  } | null>(null);
  const chooseVersion = useCallback(
    (latest: TrackedWorkout) =>
      new Promise<WorkoutConflictChoice>((resolve) => setPending({ latest, resolve })),
    [],
  );
  const dialog = pending ? (
    <WorkoutConflictDialog
      latest={pending.latest}
      onChoose={(choice) => {
        setPending(null);
        pending.resolve(choice);
      }}
    />
  ) : null;
  return { chooseVersion, dialog };
}
