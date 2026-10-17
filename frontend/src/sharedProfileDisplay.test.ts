import { describe, expect, it } from 'vitest';
import {
  followActionLabel,
  followSinceLabel,
  sharedParts,
  workoutActivitySummary,
} from './sharedProfileDisplay';
import type { SharedProfileSummary } from './types';

const nothingExtra = {
  notes: false,
  cardio: false,
  body_weight: false,
  goals: false,
  machine_photos: false,
};

const profile: SharedProfileSummary = {
  id: 'member',
  display_name: 'Sam',
  profile_photo_url: null,
  member_since: '2026-09-01T10:00:00Z',
  visibility: 'public',
  is_you: false,
  follow_status: 'none',
  follows_you: false,
  can_view: true,
  workout_count: 42,
  recent_workout_count: 6,
  last_workout_date: '2026-10-06',
  shares: nothingExtra,
};

const friendsOnly: SharedProfileSummary = {
  ...profile,
  visibility: 'followers',
  can_view: false,
  workout_count: null,
  recent_workout_count: null,
  last_workout_date: null,
  shares: null,
};

describe('shared profile display', () => {
  it('labels relationship start dates independently of signup and missing dates', () => {
    expect(followSinceLabel('Following', '2026-10-06T12:00:00Z')).toBe(
      'Following since 6 Oct 2026',
    );
    expect(followSinceLabel('Follows you', '2026-10-09T12:00:00Z')).toBe(
      'Follows you since 9 Oct 2026',
    );
    expect(followSinceLabel('Following', null)).toBe('Following');
    expect(followSinceLabel('Following', 'invalid')).toBe('Following');
  });
  it('always lists workouts, then only the parts the owner chose to share', () => {
    expect(sharedParts(profile)).toEqual(['Workouts']);
    expect(
      sharedParts({
        ...profile,
        shares: { notes: true, cardio: true, body_weight: true, goals: true, machine_photos: true },
      }),
    ).toEqual(['Workouts', 'Machine photos', 'Body weight', 'Goals', 'Cardio', 'Notes']);
    expect(sharedParts(friendsOnly)).toEqual([]);
  });

  it('summarises workout activity, or why a friends-only profile is hidden', () => {
    expect(workoutActivitySummary(profile)).toBe(
      '42 workouts · 6 in the last 30 days · last Tue 6 Oct',
    );
    expect(workoutActivitySummary({ ...profile, workout_count: 1, recent_workout_count: 1 })).toBe(
      '1 workout · 1 in the last 30 days · last Tue 6 Oct',
    );
    expect(workoutActivitySummary({ ...profile, workout_count: 0, last_workout_date: null })).toBe(
      'No workouts logged yet',
    );
    expect(workoutActivitySummary(friendsOnly)).toBe(
      'Shares with friends only. Follow to see their training.',
    );
    expect(workoutActivitySummary({ ...friendsOnly, follow_status: 'pending' })).toBe(
      'Follow request sent',
    );
  });

  it('offers to follow public profiles and to request friends-only ones', () => {
    expect(followActionLabel(profile)).toBe('Follow');
    expect(followActionLabel(friendsOnly)).toBe('Request to follow');
    expect(followActionLabel({ ...friendsOnly, follow_status: 'pending' })).toBeNull();
    expect(followActionLabel({ ...profile, is_you: true })).toBeNull();
  });
});
