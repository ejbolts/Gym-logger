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

/** How much each popup button takes off or adds to the rest. */
export const REST_ADJUST_SECONDS = 30;

/**
 * The rest countdown as a popup, centred between buttons that take off or add 30 seconds.
 * Dismissing it keeps the timer running beside the live workout time; cancelling stops the
 * rest timer.
 */
export function RestTimerToast({
  seconds,
  totalSeconds,
  onDismiss,
  onCancel,
  onAdjust,
}: {
  seconds: number;
  totalSeconds: number;
  onDismiss: () => void;
  onCancel: () => void;
  /** Adds (positive) or takes off (negative) seconds; taking off all the rest left ends it. */
  onAdjust: (seconds: number) => void;
}) {
  const formattedTime = formatSeconds(seconds);
  return (
    <div
      className="undo-toast rest-timer-toast"
      role="timer"
      aria-label={`Rest timer ${formattedTime}`}
    >
      <button
        className="undo-toast-action rest-timer-toast-cancel"
        type="button"
        aria-label="Cancel rest timer"
        onClick={onCancel}
      >
        Cancel
      </button>
      <button
        className="rest-timer-toast-adjust"
        type="button"
        aria-label={`Take ${REST_ADJUST_SECONDS} seconds off the rest`}
        onClick={() => onAdjust(-REST_ADJUST_SECONDS)}
      >
        −{REST_ADJUST_SECONDS}s
      </button>
      <span className="rest-timer-toast-copy">
        <small>
          <Icon name="timer" />
          Rest
        </small>
        <strong>{formattedTime}</strong>
      </span>
      <button
        className="rest-timer-toast-adjust"
        type="button"
        aria-label={`Add ${REST_ADJUST_SECONDS} seconds to the rest`}
        onClick={() => onAdjust(REST_ADJUST_SECONDS)}
      >
        +{REST_ADJUST_SECONDS}s
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
