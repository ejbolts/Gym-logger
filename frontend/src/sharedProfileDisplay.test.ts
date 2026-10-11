import { describe, expect, it } from 'vitest';
import { sharedParts, workoutActivitySummary } from './sharedProfileDisplay';
import type { SharedProfileSummary } from './types';

const profile: SharedProfileSummary = {
  id: 'member',
  display_name: 'Sam',
  profile_photo_url: null,
  member_since: '2026-09-01T10:00:00Z',
  is_you: false,
  workout_count: 42,
  recent_workout_count: 6,
  last_workout_date: '2026-10-06',
  shares: { notes: false, cardio: false, body_weight: false, goals: false },
};

describe('shared profile display', () => {
  it('always lists workouts, then only the parts the owner chose to share', () => {
    expect(sharedParts(profile)).toEqual(['Workouts']);
    expect(
      sharedParts({
        ...profile,
        shares: { notes: true, cardio: true, body_weight: true, goals: true },
      }),
    ).toEqual(['Workouts', 'Body weight', 'Goals', 'Cardio', 'Notes']);
  });

  it('summarises workout activity', () => {
    expect(workoutActivitySummary(profile)).toBe(
      '42 workouts · 6 in the last 30 days · last Tue 6 Oct',
    );
    expect(workoutActivitySummary({ ...profile, workout_count: 1, recent_workout_count: 1 })).toBe(
      '1 workout · 1 in the last 30 days · last Tue 6 Oct',
    );
    expect(workoutActivitySummary({ ...profile, workout_count: 0, last_workout_date: null })).toBe(
      'No workouts logged yet',
    );
  });
});
