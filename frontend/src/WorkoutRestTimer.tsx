import { Icon } from './Icon';
import { restTimerProgress } from './restTimer';
import { formatSeconds } from './utils';

export function WorkoutHeaderMeta({
  durationLabel,
  restSeconds,
  onSkipRest,
  onShowRest,
}: {
  durationLabel: string;
  restSeconds: number | null;
  onSkipRest: () => void;
  onShowRest?: () => void;
}) {
  return (
    <span className="workout-header-meta">
      <span className="workout-header-duration">{durationLabel}</span>
      {restSeconds !== null && restSeconds > 0 && (
        <>
          <span className="workout-header-separator" aria-hidden="true">
            •
          </span>
          <WorkoutRestTimer seconds={restSeconds} onSkip={onSkipRest} onShow={onShowRest} />
        </>
      )}
    </span>
  );
}

export function WorkoutRestTimer({
  seconds,
  onSkip,
  onShow,
}: {
  seconds: number;
  onSkip: () => void;
  /** Reopens the rest popup after it was dismissed. */
  onShow?: () => void;
}) {
  const formattedTime = formatSeconds(seconds);

  return (
    <span className="workout-rest-timer" role="timer" aria-label={`Rest timer ${formattedTime}`}>
      {onShow ? (
        <button
          type="button"
          className="workout-rest-timer-show"
          aria-label={`Show rest timer, ${formattedTime} left`}
          onClick={onShow}
        >
          <strong>{formattedTime}</strong>
        </button>
      ) : (
        <strong>{formattedTime}</strong>
      )}
      <button type="button" aria-label="Skip rest timer" onClick={onSkip}>
        ×
      </button>
    </span>
  );
}

/**
 * The rest countdown as a popup. Dismissing it keeps the timer running beside the live workout
 * time; cancelling stops the rest timer.
 */
export function RestTimerToast({
  seconds,
  totalSeconds,
  onDismiss,
  onCancel,
}: {
  seconds: number;
  totalSeconds: number;
  onDismiss: () => void;
  onCancel: () => void;
}) {
  const formattedTime = formatSeconds(seconds);
  return (
    <div
      className="undo-toast rest-timer-toast"
      role="timer"
      aria-label={`Rest timer ${formattedTime}`}
    >
      <span className="rest-timer-toast-icon" aria-hidden="true">
        <Icon name="timer" />
      </span>
      <span className="rest-timer-toast-copy">
        <small>Rest</small>
        <strong>{formattedTime}</strong>
      </span>
      <button
        className="undo-toast-action"
        type="button"
        aria-label="Cancel rest timer"
        onClick={onCancel}
      >
        Cancel
      </button>
      <button
        className="undo-toast-close"
        type="button"
        aria-label="Dismiss rest timer popup and show it beside the live time"
        onClick={onDismiss}
      >
        <Icon name="close" />
      </button>
      <span className="rest-timer-toast-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${restTimerProgress(seconds, totalSeconds)})` }} />
      </span>
    </div>
  );
}
