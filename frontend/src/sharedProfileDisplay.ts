import { shortDate } from './trainingSummary';
import type { ProfileVisibility, SharedProfileSummary } from './types';

export const SHARED_WORKOUT_PAGE_SIZE = 10;

export const VISIBILITY_LABELS: Record<ProfileVisibility, string> = {
  private: 'Private',
  followers: 'Friends only',
  public: 'Public',
};

export function plural(count: number, word: string): string {
  return `${count.toLocaleString('en-GB')} ${word}${count === 1 ? '' : 's'}`;
}

export function followSinceLabel(label: string, since?: string | null): string {
  const date = since ? new Date(since) : null;
  return date && !Number.isNaN(date.getTime())
    ? `${label} since ${date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}`
    : label;
}

/** What a viewable profile shares: workouts and cardio always, then the optional parts chosen. */
export function sharedParts(profile: SharedProfileSummary): string[] {
  const shares = profile.shares;
  if (!shares) return [];
  return [
    'Workouts + cardio',
    ...(shares.machine_photos ? ['Machine photos'] : []),
    ...(shares.body_weight ? ['Body weight'] : []),
    ...(shares.goals ? ['Goals'] : []),
    ...(shares.notes ? ['Notes'] : []),
  ];
}

export function workoutActivitySummary(profile: SharedProfileSummary): string {
  if (!profile.can_view) {
    return profile.follow_status === 'pending'
      ? 'Follow request sent'
      : 'Shares with friends only. Follow to see their training.';
  }
  if (!profile.workout_count) return 'No workouts logged yet';
  return [
    plural(profile.workout_count, 'workout'),
    `${profile.recent_workout_count ?? 0} in the last 30 days`,
    profile.last_workout_date ? `last ${shortDate(profile.last_workout_date)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The button offered to someone who does not follow this profile yet. */
export function followActionLabel(profile: SharedProfileSummary): string | null {
  if (profile.is_you || profile.follow_status !== 'none') return null;
  return profile.visibility === 'public' ? 'Follow' : 'Request to follow';
}
