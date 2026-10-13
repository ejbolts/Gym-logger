import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from './Icon';
import {
  StatusToastContext,
  statusToastDuration,
  type ShowToast,
  type StatusToastMessage,
} from './statusToastContext';
import './statusToast.css';

/** Holds the single current toast and renders it once, above the bottom tab bar. */
export function StatusToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<StatusToastMessage | null>(null);
  const nextIdRef = useRef(0);

  const showToast = useCallback<ShowToast>((text, options) => {
    if (!text) return;
    nextIdRef.current += 1;
    setToast({ id: nextIdRef.current, text, persist: options?.persist === true });
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToast((current) => (current?.id === id ? null : current));
  }, []);

  return (
    <StatusToastContext.Provider value={showToast}>
      {children}
      <StatusToast toast={toast} onDismiss={dismissToast} />
    </StatusToastContext.Provider>
  );
}

/**
 * The live region stays mounted while empty so assistive technology announces each new message.
 * The toast never takes focus; hovering or focusing it pauses the auto-dismiss timer.
 */
export function StatusToast({
  toast,
  onDismiss,
}: {
  toast: StatusToastMessage | null;
  onDismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  if (!toast && paused) setPaused(false);
  const duration = toast && !toast.persist ? statusToastDuration(toast.text) : null;
  const dismiss = useCallback(() => {
    if (toast) onDismiss(toast.id);
  }, [toast, onDismiss]);

  return (
    <div
      className={`status-toast${toast ? ' open' : ''}${paused ? ' paused' : ''}`}
      style={
        duration === null
          ? undefined
          : ({ '--status-toast-duration': `${duration}ms` } as CSSProperties)
      }
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className="status-toast-text" role="status" aria-live="polite" aria-atomic="true">
        {toast && <span key={toast.id}>{toast.text}</span>}
      </p>
      {toast && (
        <button
          type="button"
          className="status-toast-close"
          aria-label="Dismiss notification"
          onClick={dismiss}
        >
          <Icon name="close" />
        </button>
      )}
      {toast && duration !== null && (
        <StatusToastCountdown
          key={toast.id}
          duration={duration}
          paused={paused}
          onExpire={dismiss}
        />
      )}
    </div>
  );
}

/** Closes the toast after its duration, keeping the time left across pauses. */
function StatusToastCountdown({
  duration,
  paused,
  onExpire,
}: {
  duration: number;
  paused: boolean;
  onExpire: () => void;
}) {
  const remainingRef = useRef(duration);

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(onExpire, remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [paused, onExpire]);

  return <span className="status-toast-countdown" aria-hidden="true" />;
}
