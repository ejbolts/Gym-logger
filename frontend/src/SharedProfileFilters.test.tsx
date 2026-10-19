// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { SharedProfileScreen } from './SharedProfiles';
import type { SharedProfile, SharedWorkoutPage, TrackedWorkout } from './types';

const profile: SharedProfile = {
  id: 'friend',
  display_name: 'Sample Friend',
  profile_photo_url: null,
  member_since: '2026-10-01T12:00:00Z',
  visibility: 'public',
  is_you: false,
  follow_status: 'accepted',
  following_since: '2026-10-06T12:00:00Z',
  follows_you: true,
  can_view: true,
  workout_count: 2,
  recent_workout_count: 2,
  last_workout_date: '2026-10-17',
  shares: null,
  body_weight: null,
  goals: null,
  cardio_sessions: null,
  training_time: {
    workout_minutes: 213,
    workout_count: 4,
    cardio_minutes: 80,
    cardio_count: 3,
    total_minutes: 273,
  },
};
const workout: TrackedWorkout = {
  id: 'first',
  name: 'First workout',
  workout_date: '2026-10-17',
  category: 'lower',
  notes: null,
  duration_minutes: null,
  start_time: null,
  end_time: null,
  is_sample: false,
  created_at: '2026-10-17T12:00:00Z',
  updated_at: '2026-10-17T12:00:00Z',
  movements: [],
};
let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(api.sharing, 'profile').mockResolvedValue(profile);
  vi.spyOn(api.sharing, 'workoutFilters').mockResolvedValue({
    exercises: [{ id: 'squat', name: 'Squat' }],
    machines: [],
  });
  vi.spyOn(api.sharing, 'workouts').mockImplementation(async (_id, _offset, _limit, filters) => ({
    total: filters?.category === 'push' ? 0 : 2,
    workouts: filters?.category === 'push' ? [] : [workout],
    personal_records: [],
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <SharedProfileScreen
        profileId="friend"
        onChooseSharing={() => {}}
        renderWorkouts={({ workouts, renderWorkoutAction }) => (
          <ul>
            {workouts.map((item) => (
              <li key={item.id}>
                {item.name}
                {renderWorkoutAction?.(item)}
              </li>
            ))}
          </ul>
        )}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function chooseType(value: string) {
  const select = container.querySelector<HTMLSelectElement>('select')!;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function button(prefix: string) {
  return [...container.querySelectorAll('button')].find((item) =>
    item.textContent?.startsWith(prefix),
  )!;
}

describe('shared profile follow control', () => {
  it('shows Following with a menu holding the start month and Unfollow', async () => {
    expect(container.textContent).not.toContain('Public');
    expect(container.querySelector('.profile-joined')?.textContent).toBe(
      'Joined October 2026Follows you',
    );
    const following = button('Following');
    expect(following.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await act(async () => following.click());
    expect(following.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[role="menu"]')?.textContent).toBe('Since Oct 2026Unfollow');
    vi.spyOn(api.sharing, 'unfollow').mockResolvedValue(undefined);
    await act(async () => button('Unfollow').click());
    expect(api.sharing.unfollow).toHaveBeenCalledWith('friend');
  });
});

describe('shared history filtering', () => {
  it('requests matching server results and resets to the first unfiltered page', async () => {
    await chooseType('push');
    expect(api.sharing.workouts).toHaveBeenLastCalledWith(
      'friend',
      0,
      10,
      expect.objectContaining({ category: 'push' }),
    );
    expect(container.textContent).toContain('No workouts match these filters.');
    await act(async () => button('Reset filters').click());
    expect(api.sharing.workouts).toHaveBeenLastCalledWith(
      'friend',
      0,
      10,
      expect.objectContaining({ category: '' }),
    );
    expect(container.textContent).toContain('First workout');
  });

  it('retains applied filters when loading another page', async () => {
    await chooseType('lower');
    vi.mocked(api.sharing.workouts).mockResolvedValueOnce({
      total: 2,
      workouts: [{ ...workout, id: 'older', name: 'Older workout' }],
      personal_records: [],
    });
    await act(async () => button('Show more').click());
    expect(api.sharing.workouts).toHaveBeenLastCalledWith(
      'friend',
      1,
      10,
      expect.objectContaining({ category: 'lower' }),
    );
    expect(container.textContent).toContain('Older workout');
  });

  it('ignores an older page response after the filter changes', async () => {
    let finish!: (page: SharedWorkoutPage) => void;
    vi.mocked(api.sharing.workouts).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => button('Show more').click());
    await chooseType('push');
    await act(async () =>
      finish({
        total: 2,
        workouts: [{ ...workout, id: 'late', name: 'Late old result' }],
        personal_records: [],
      }),
    );
    expect(container.textContent).toContain('No workouts match these filters.');
    expect(container.textContent).not.toContain('Late old result');
  });
});

it('shows lifetime time separately from history filters and reacts on a shared workout', async () => {
  expect(container.querySelector('.profile-training-time')?.textContent).toContain('3h 33min');
  expect(container.querySelector('.profile-training-time')?.textContent).toContain('1h 20min');
  expect(container.querySelector('.profile-training-time')?.textContent).toContain('4h 33min');
  const react = vi
    .spyOn(api.sharing, 'react')
    .mockResolvedValue({ counts: [{ reaction: 'love', count: 1 }], yours: 'love' });
  const remove = vi
    .spyOn(api.sharing, 'removeReaction')
    .mockResolvedValue({ counts: [], yours: null });
  await act(async () =>
    container.querySelector<HTMLButtonElement>('.friend-react-button')!.click(),
  );
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>('.friend-react-picker button')]
      .find((b) => b.getAttribute('aria-label') === 'Love')!
      .click(),
  );
  expect(react).toHaveBeenCalledWith('first', 'love');
  expect(container.querySelector('.friend-react-button')?.textContent).toContain('Love');
  await act(async () =>
    container.querySelector<HTMLButtonElement>('.friend-react-button')!.click(),
  );
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>('.friend-react-picker button')]
      .find((b) => b.getAttribute('aria-label') === 'Love')!
      .click(),
  );
  expect(remove).toHaveBeenCalledWith('first');
  await chooseType('push');
  expect(container.querySelector('.profile-training-time')?.textContent).toContain('4h 33min');
  expect(container.querySelector('.friend-react-button')).toBeNull();
});
