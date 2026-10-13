import { useState } from 'react';
import { Icon, type IconName } from './Icon';
import { PopupDialog } from './PopupDialog';
import { sampleDataSummary } from './sampleData';

const ESSENTIALS: { icon: IconName; title: string; description: string }[] = [
  {
    icon: 'plus',
    title: 'Start a workout from Home',
    description: 'Tap Start, or begin the suggested session on Home.',
  },
  {
    icon: 'check',
    title: 'Tick off each set',
    description: 'Enter the weight and reps, then tick the set. Your rest timer starts on its own.',
  },
  {
    icon: 'trend',
    title: 'See your progress',
    description: 'Saved workouts appear in History, and Progress charts each exercise over time.',
  },
];

type SampleChoice = 'undecided' | 'keep' | 'confirm' | 'removing' | 'removed';

/**
 * A new account's short first-run path: three essentials and a direct way to log the first
 * workout. The full tour stays optional, and is always available again from Settings.
 */
export function FirstRunWelcome({
  name,
  sampleWorkouts,
  sampleMeasurements,
  onRemoveSamples,
  onStartWorkout,
  onTakeTour,
  onClose,
}: {
  name?: string;
  sampleWorkouts: number;
  sampleMeasurements: number;
  onRemoveSamples: () => Promise<void>;
  onStartWorkout: () => void;
  onTakeTour: () => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<SampleChoice>('undecided');
  const [error, setError] = useState<string | null>(null);
  const hasSamples = sampleWorkouts + sampleMeasurements > 0;
  const removing = choice === 'removing';

  async function removeSamples() {
    setChoice('removing');
    setError(null);
    try {
      await onRemoveSamples();
      setChoice('removed');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove the sample data.');
      setChoice('confirm');
    }
  }

  return (
    <PopupDialog
      title={name ? `Welcome, ${name}` : 'Welcome to Gym Logger'}
      kicker="GET STARTED"
      className="first-run-welcome"
      onClose={() => {
        if (!removing) onClose();
      }}
    >
      <div className="first-run-body">
        <p className="first-run-intro">Three things to know before your first set:</p>
        <ol className="first-run-essentials">
          {ESSENTIALS.map((item) => (
            <li key={item.title}>
              <span className="first-run-glyph">
                <Icon name={item.icon} />
              </span>
              <span>
                <b>{item.title}</b>
                <small>{item.description}</small>
              </span>
            </li>
          ))}
        </ol>
        {(hasSamples || choice === 'removed') && (
          <section className="first-run-samples" aria-labelledby="first-run-samples-title">
            <h3 id="first-run-samples-title">
              <em className="sample-tag">Sample data</em> Explore, or start fresh?
            </h3>
            {choice === 'removed' ? (
              <p role="status">Sample data removed. Home now shows only your own training.</p>
            ) : choice === 'keep' ? (
              <p role="status">
                Keeping the sample week to explore. Home labels it until you remove it there.
              </p>
            ) : (
              <>
                <p>
                  Your account includes a sample week (
                  {sampleDataSummary(sampleWorkouts, sampleMeasurements)}) so Home, History and
                  Progress have something to show. It isn't your training.
                </p>
                {choice === 'undecided' ? (
                  <div className="first-run-sample-choices">
                    <button type="button" onClick={() => setChoice('keep')}>
                      Keep sample data to explore
                    </button>
                    <button type="button" onClick={() => setChoice('confirm')}>
                      Start with my own data
                    </button>
                  </div>
                ) : (
                  <div
                    className="first-run-sample-confirm"
                    role="group"
                    aria-label="Confirm sample data removal"
                  >
                    <p>Permanently delete the sample data? This cannot be undone.</p>
                    <div className="first-run-sample-choices">
                      <button
                        type="button"
                        className="sample-remove-confirm"
                        disabled={removing}
                        onClick={() => void removeSamples()}
                      >
                        {removing ? 'Removing…' : 'Remove sample data'}
                      </button>
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() => setChoice('undecided')}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {error && (
                  <p className="inline-error" role="alert">
                    {error}
                  </p>
                )}
              </>
            )}
          </section>
        )}
        <p className="first-run-note">Replay the full tour any time from Settings.</p>
      </div>
      <footer className="popup-dialog-actions">
        <button type="button" className="first-run-later" disabled={removing} onClick={onClose}>
          Not now
        </button>
        <button type="button" disabled={removing} onClick={onTakeTour}>
          Take the full tour
        </button>
        <button
          type="button"
          className="popup-primary-action"
          disabled={removing}
          onClick={onStartWorkout}
        >
          Start my first workout
        </button>
      </footer>
    </PopupDialog>
  );
}
