import type { TrainingTime } from './types';
import { formatMinutesDuration } from './utils';

/** The same lifetime totals and counting explanation on your own and shared profiles. */
export function TrainingTimeStats({ time }: { time: TrainingTime | null }) {
  const stats = [
    {
      label: 'Workouts',
      minutes: time?.workout_minutes,
      detail:
        time &&
        `${time.workout_count.toLocaleString('en-GB')} ${time.workout_count === 1 ? 'workout' : 'workouts'}`,
    },
    {
      label: 'Cardio',
      minutes: time?.cardio_minutes,
      detail:
        time &&
        `${time.cardio_count.toLocaleString('en-GB')} ${time.cardio_count === 1 ? 'session' : 'sessions'}`,
    },
    { label: 'Combined', minutes: time?.total_minutes, detail: time && 'All exercise' },
  ];
  return (
    <>
      <dl className="shared-stat-row">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd className="num">
              {stat.minutes === undefined ? '–' : formatMinutesDuration(stat.minutes)}
            </dd>
            {stat.detail && <small>{stat.detail}</small>}
          </div>
        ))}
      </dl>
      <p>
        Totals use each workout's logged duration and every cardio session. Cardio done during a
        workout counts once in Combined.
      </p>
    </>
  );
}
