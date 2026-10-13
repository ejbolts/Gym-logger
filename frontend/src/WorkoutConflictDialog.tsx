import { useState } from 'react';
import { PopupDialog } from './PopupDialog';
import type { TrackedWorkout } from './types';
import type { WorkoutConflictChoice } from './workoutSave';
import './workoutConflict.css';

/** Shown when a save is refused because the workout was saved on another device meanwhile. */
export function WorkoutConflictDialog({
  latest,
  onChoose,
}: {
  latest: TrackedWorkout;
  onChoose: (choice: WorkoutConflictChoice) => void;
}) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  return (
    <PopupDialog
      title="This workout was changed on another device"
      kicker="NOT SAVED YET"
      className="workout-conflict-dialog"
      onClose={() => onChoose('cancel')}
    >
      {confirmingDiscard ? (
        <>
          <div className="workout-conflict-body">
            <p>
              Discard the changes you made on this device and load the latest saved version of “
              {latest.name}”?
            </p>
          </div>
          <footer className="popup-dialog-actions">
            <button type="button" autoFocus onClick={() => setConfirmingDiscard(false)}>
              Back
            </button>
            <button
              type="button"
              className="popup-primary-action"
              onClick={() => onChoose('load-latest')}
            >
              Discard my changes
            </button>
          </footer>
        </>
      ) : (
        <>
          <div className="workout-conflict-body">
            <p>
              “{latest.name}” was saved on another device after you opened it here. Your changes are
              still on this device. Keeping your version replaces the other device’s changes.
            </p>
          </div>
          <footer className="popup-dialog-actions">
            <button type="button" onClick={() => setConfirmingDiscard(true)}>
              Load latest version
            </button>
            <button
              type="button"
              className="popup-primary-action"
              autoFocus
              onClick={() => onChoose('keep-mine')}
            >
              Keep my version
            </button>
          </footer>
        </>
      )}
    </PopupDialog>
  );
}
