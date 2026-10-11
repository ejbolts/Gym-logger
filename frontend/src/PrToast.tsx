import { useEffect } from 'react';
import './prToast.css';

export interface PrToastEntry {
  exercise: string;
  labels: string[];
  reps: number;
  weightKg: number;
}

export const PR_TOAST_MS = 3500;

export function PrToast({ entries, onClose }: { entries: PrToastEntry[]; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, PR_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [entries, onClose]);

  return (
    <aside className="pr-toast" role="status" aria-live="polite" aria-atomic="true">
      <span className="pr-toast-icon" aria-hidden="true">
        🏆
      </span>
      <div>
        {entries.map((entry, index) => (
          <div key={index}>
            <strong>{entry.labels.join(' + ')}</strong>
            <span>{entry.exercise}</span>
            <small>
              {entry.reps} reps at {entry.weightKg} kg
            </small>
          </div>
        ))}
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss personal record popup">
        ×
      </button>
    </aside>
  );
}
