import { useEffect, useState } from 'react';
import { api } from './api';
import type { TrainingTime } from './types';
import { TrainingTimeStats } from './TrainingTimeStats';

/** Lifetime time logged on Profile: strength workouts, cardio sessions and both combined. */
export function ProfileTrainingTime({ active }: { active: boolean }) {
  const [time, setTime] = useState<TrainingTime | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Refreshed whenever Profile is shown, so workouts saved on other tabs are included.
    if (!active) return;
    let cancelled = false;
    api
      .trainingTime()
      .then((next) => {
        if (cancelled) return;
        setTime(next);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [active, attempt]);

  return (
    <section
      className="settings-panel panel profile-training-time"
      aria-labelledby="profile-training-time-title"
      aria-busy={!time && !failed}
    >
      <header>
        <div>
          <p className="section-kicker">ACTIVITY</p>
          <h2 id="profile-training-time-title">Time trained</h2>
        </div>
      </header>
      {failed && !time ? (
        <p className="inline-error" role="alert">
          Couldn't load your training time.{' '}
          <button type="button" className="text-link" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      ) : (
        <TrainingTimeStats time={time} />
      )}
    </section>
  );
}
