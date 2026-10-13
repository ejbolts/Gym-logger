import { Icon } from './Icon';
import { compactExtrasLabel, compactMovementSummary } from './compactWorkout';
import { useWeightUnit } from './trainingPreferencesContext';
import type { WorkoutDraftMovement } from './workoutMovements';
import './compactLogging.css';

/** The live workout's compact-mode switch, beside a short exercise progress count. */
export function CompactLoggingToolbar({
  enabled,
  progress,
  onChange,
}: {
  enabled: boolean;
  progress: string;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="compact-logging-toolbar">
      <span className="compact-logging-progress">{progress}</span>
      <button
        type="button"
        className="compact-logging-toggle"
        aria-pressed={enabled}
        aria-label="Compact logging"
        title="Fold finished and upcoming exercises"
        onClick={() => onChange(!enabled)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 4.5 12 9l5-4.5M7 19.5 12 15l5 4.5M4 12h16" />
        </svg>
        Compact
      </button>
    </div>
  );
}

/** A folded exercise in compact mode: one tappable row with its name, progress and best set. */
export function CompactMovementSummary({
  movement,
  number,
  onExpand,
}: {
  movement: WorkoutDraftMovement;
  number: number;
  onExpand: () => void;
}) {
  const weightUnit = useWeightUnit();
  const summary = compactMovementSummary(movement, weightUnit);
  return (
    <header className="compact-movement-summary">
      <button
        type="button"
        className="compact-movement-summary-button"
        data-status={summary.status}
        aria-expanded={false}
        aria-label={summary.label}
        onClick={onExpand}
      >
        <span className="compact-movement-badge" aria-hidden="true">
          {summary.status === 'done' ? <Icon name="check" /> : number}
        </span>
        <span className="compact-movement-copy">
          <strong>{movement.exercise.name}</strong>
          <small>
            {movement.supersetKey && <b className="compact-movement-superset">Superset</b>}
            <span>{summary.progress}</span>
            {summary.detail && <span>{summary.detail}</span>}
          </small>
        </span>
        <Icon name="chevron-down" />
      </button>
    </header>
  );
}

/** Reveals the optional parts of an open compact card: machine photos, rest times and notes. */
export function CompactMoreToggle({
  movement,
  open,
  onToggle,
}: {
  movement: WorkoutDraftMovement;
  open: boolean;
  onToggle: () => void;
}) {
  const extras = compactExtrasLabel({
    kind: movement.exercise.kind,
    photoCount: movement.machinePhotoIds.length,
    hasNote: movement.notes.trim() !== '',
  });
  return (
    <button
      type="button"
      className="compact-more-toggle"
      aria-expanded={open}
      aria-label={`More for ${movement.exercise.name}: ${extras}`}
      onClick={onToggle}
    >
      <span>More</span>
      <small>{extras}</small>
      <Icon name="chevron-down" />
    </button>
  );
}
