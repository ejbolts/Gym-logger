import { useId, useState } from 'react';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import {
  readSampleBannerCollapsed,
  sampleDataSummary,
  writeSampleBannerCollapsed,
} from './sampleData';

export function RemoveSampleDataDialog({
  workoutCount,
  measurementCount,
  onRemove,
  onClose,
}: {
  workoutCount: number;
  measurementCount: number;
  onRemove: () => Promise<void>;
  onClose: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setRemoving(true);
    setError(null);
    try {
      await onRemove();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove the sample data.');
      setRemoving(false);
    }
  }

  return (
    <PopupDialog
      title="Remove sample data?"
      kicker="PLEASE CONFIRM"
      className="sample-remove-dialog"
      onClose={() => {
        if (!removing) onClose();
      }}
    >
      <div className="sample-remove-body">
        <p>
          This permanently deletes the {sampleDataSummary(workoutCount, measurementCount)}, along
          with the records, streaks and totals that came from them. Anything you logged or edited
          yourself stays. This cannot be undone.
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="popup-dialog-actions">
        <button type="button" disabled={removing} onClick={onClose}>
          Keep sample data
        </button>
        <button
          type="button"
          className="popup-primary-action sample-remove-confirm"
          disabled={removing}
          onClick={() => void remove()}
        >
          {removing ? 'Removing…' : 'Remove sample data'}
        </button>
      </footer>
    </PopupDialog>
  );
}

/**
 * Labels Home while the account still holds the seeded sample week, so its numbers never pass
 * for the user's own training. It can be collapsed, but only removing the samples hides it.
 */
export function SampleDataBanner({
  workoutCount,
  measurementCount,
  onRemove,
}: {
  workoutCount: number;
  measurementCount: number;
  onRemove: () => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(readSampleBannerCollapsed);
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();
  const detailsId = useId();

  function toggle() {
    writeSampleBannerCollapsed(!collapsed);
    setCollapsed(!collapsed);
  }

  return (
    <section
      className={`sample-data-banner pulse-card ${collapsed ? 'collapsed' : ''}`}
      aria-labelledby={titleId}
    >
      <div className="sample-data-banner-head">
        <em className="sample-tag">Sample data</em>
        <h2 id={titleId}>You're exploring sample data</h2>
        <button
          type="button"
          className="sample-data-banner-toggle"
          aria-expanded={!collapsed}
          aria-controls={detailsId}
          aria-label="Sample data details"
          onClick={toggle}
        >
          <Icon name="chevron-down" />
        </button>
      </div>
      <div id={detailsId} hidden={collapsed}>
        <p>
          Workouts, records, streaks and body weight on Home include a sample week (
          {sampleDataSummary(workoutCount, measurementCount)}). Remove it to see only your own
          training.
        </p>
        <button
          type="button"
          className="pulse-button secondary sample-data-remove"
          onClick={() => setConfirming(true)}
        >
          Remove sample data
        </button>
      </div>
      {confirming && (
        <RemoveSampleDataDialog
          workoutCount={workoutCount}
          measurementCount={measurementCount}
          onRemove={onRemove}
          onClose={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
