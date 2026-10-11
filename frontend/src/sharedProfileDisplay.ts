import { shortDate } from './trainingSummary';
import type { SharedProfileSummary } from './types';

export const SHARED_WORKOUT_PAGE_SIZE = 10;

export function plural(count: number, word: string): string {
  return `${count.toLocaleString('en-GB')} ${word}${count === 1 ? '' : 's'}`;
}

/** What a profile shares: workouts always, then the optional parts its owner chose. */
export function sharedParts(profile: SharedProfileSummary): string[] {
  return [
    'Workouts',
    ...(profile.shares.body_weight ? ['Body weight'] : []),
    ...(profile.shares.goals ? ['Goals'] : []),
    ...(profile.shares.cardio ? ['Cardio'] : []),
    ...(profile.shares.notes ? ['Notes'] : []),
  ];
}

export function workoutActivitySummary(profile: SharedProfileSummary): string {
  if (!profile.workout_count) return 'No workouts logged yet';
  return [
    plural(profile.workout_count, 'workout'),
    `${profile.recent_workout_count} in the last 30 days`,
    profile.last_workout_date ? `last ${shortDate(profile.last_workout_date)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
