// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { SharedProfileScreen } from './SharedProfiles';
import type { SharedProfile, SharedWorkoutPage, TrackedWorkout } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

const profile: SharedProfile = {
  id: 'friend',
  display_name: 'Sample Friend',
  profile_photo_url: null,
  member_since: '2026-10-01T12:00:00Z',
  visibility: 'public',
  is_you: false,
  friend_status: 'friends',
  friends_since: '2026-10-06T12:00:00Z',
  can_view: true,
  workout_count: 2,
  recent_workout_count: 2,
  last_workout_date: '2026-10-17',
  shares: null,
  body_weight: null,
  goals: null,
  cardio_sessions: null,
  consistency: {
    current_streak: 2,
    training_days: 23,
    workout_types: DEFAULT_WORKOUT_TYPES.map((type) =>
      type.id === 'push' ? { ...type, color: '#abcdef' } : type,
    ),
    heatmap: [
      {
        workout_date: '2026-10-17',
        categories: ['push'],
        workout_count: 2,
        set_count: 8,
        workouts: [],
      },
    ],
  },
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
function renderProfile(profileId = 'friend') {
  return act(async () =>
    root.render(
      <SharedProfileScreen
        profileId={profileId}
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
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  Element.prototype.scrollIntoView = vi.fn();
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
  await renderProfile();
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

describe('shared profile friend control', () => {
  it('shows Friends with a menu holding the start month, Remove friend and Block', async () => {
    expect(container.textContent).not.toContain('Public');
    expect(container.querySelector('.profile-joined')?.textContent).toBe('Joined October 2026');
    const friends = button('Friends');
    expect(friends.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await act(async () => friends.click());
    expect(friends.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[role="menu"]')?.textContent).toBe(
      'Since Oct 2026Remove friendBlock',
    );
    vi.spyOn(api.sharing, 'removeFriend').mockResolvedValue(undefined);
    await act(async () => button('Remove friend').click());
    expect(api.sharing.removeFriend).toHaveBeenCalledWith('friend');
  });

  it('asks before blocking, then explains where to unblock', async () => {
    const block = vi.spyOn(api.sharing, 'blockMember').mockResolvedValue(undefined);
    await act(async () => button('Friends').click());
    await act(async () => button('Block').click());
    const dialog = document.querySelector('dialog[open]');
    expect(dialog?.textContent).toContain('Block Sample Friend?');
    expect(dialog?.textContent).toContain('unblock them in Social, under Find');
    expect(block).not.toHaveBeenCalled();
    await act(async () => dialog!.querySelector<HTMLButtonElement>('.profile-danger')!.click());
    expect(block).toHaveBeenCalledWith('friend');
    expect(container.textContent).toContain('You blocked Sample Friend');
  });

  it('accepts or declines a friend request from a friends-only profile', async () => {
    vi.mocked(api.sharing.profile).mockResolvedValue({
      ...profile,
      id: 'asker',
      visibility: 'followers',
      friend_status: 'incoming',
      friends_since: null,
      can_view: false,
    });
    await renderProfile('asker');
    expect(container.textContent).toContain('Sample Friend sent you a friend request');
    expect(container.querySelector('[aria-label="More options for Sample Friend"]')).not.toBeNull();
    const accept = vi.spyOn(api.sharing, 'acceptFriend').mockResolvedValue({ status: 'friends' });
    vi.mocked(api.sharing.profile).mockResolvedValue(profile);
    await act(async () => button('Accept').click());
    expect(accept).toHaveBeenCalledWith('asker');
    expect(button('Friends')).toBeTruthy();
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
  expect(container.querySelector('.friend-react-button')?.textContent).toBe('❤️');
  expect(container.querySelector('.friend-react-button')?.getAttribute('aria-label')).toContain(
    'Love',
  );
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

it('shows the viewed account calendar, toggles its legend and selects a day without truncating stats', async () => {
  const card = container.querySelector('.calendar-panel')!;
  expect(card.textContent).toContain('Consistency');
  expect(card.querySelector('.consistency-stats')?.textContent).toContain('2 days');
  expect(card.querySelector('.consistency-stats')?.textContent).toContain('23');
  expect(card.querySelector('.consistency-stats')?.textContent).toContain('1.9');
  const legend = card.querySelector<HTMLButtonElement>('.category-legend button')!;
  expect(legend.textContent).toContain('Push');
  expect(legend.querySelector('i')?.style.background).toBe('rgb(171, 205, 239)');
  await act(async () => legend.click());
  expect(legend.getAttribute('aria-pressed')).toBe('false');
  expect(card.querySelector('.calendar-day.trained')?.className).toContain('filtered-out');
  await act(async () => legend.click());
  expect(legend.getAttribute('aria-pressed')).toBe('true');
  expect(
    card.querySelectorAll('.calendar-day:not(.trained):not(.empty):not(:disabled)'),
  ).toHaveLength(0);
  await act(async () => card.querySelector<HTMLButtonElement>('.calendar-day.trained')!.click());
  expect(api.sharing.workouts).toHaveBeenLastCalledWith(
    'friend',
    0,
    10,
    expect.objectContaining({ start_date: '2026-10-17', end_date: '2026-10-17' }),
  );
  expect(card.querySelector('.consistency-stats')?.textContent).toContain('23');
  await chooseType('push');
  expect(card.querySelectorAll('.calendar-day.trained')).toHaveLength(1);
  expect(card.querySelector('.consistency-stats')?.textContent).toContain('23');
});
