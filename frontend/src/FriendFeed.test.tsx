// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { FollowNotifications } from './FollowNotifications';
import { FriendFeedCard } from './FriendFeed';
import { feedWorkoutSummary, nextReaction } from './friendFeedData';
import type { FriendFeedItem, TrackedWorkout } from './types';

const workout = {
  id: 'w1',
  name: 'Push day',
  workout_date: '2026-10-18',
  duration_minutes: 62,
  movements: [
    { id: 'm1', sets: [{ completed: true }, { completed: true }, { completed: false }] },
    { id: 'm2', sets: [{ completed: true }] },
  ],
} as unknown as TrackedWorkout;
const item: FriendFeedItem = {
  friend: { id: 'friend', display_name: 'Sample Friend', profile_photo_url: null },
  workout,
  reactions: { counts: [{ reaction: 'fire', count: 2 }], yours: null },
};

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const found = [...document.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === label || item.textContent === label,
  );
  expect(found, label).toBeTruthy();
  return found!;
}

it('summarises exercises, completed sets and duration', () => {
  expect(feedWorkoutSummary(workout)).toBe('2 exercises · 3 sets · 1h 2min');
  expect(feedWorkoutSummary({ ...workout, duration_minutes: null, movements: [] })).toBe(
    '0 exercises · 0 sets',
  );
  expect(nextReaction(null, 'fire')).toBe('fire');
  expect(nextReaction('fire', 'clap')).toBe('clap');
  expect(nextReaction('fire', 'fire')).toBeNull();
});

it('reacts to a friend workout, switches reaction and removes it', async () => {
  vi.spyOn(api.sharing, 'feed').mockResolvedValue([item]);
  const react = vi
    .spyOn(api.sharing, 'react')
    .mockResolvedValue({ counts: [{ reaction: 'fire', count: 3 }], yours: 'fire' });
  const remove = vi
    .spyOn(api.sharing, 'removeReaction')
    .mockResolvedValue({ counts: [{ reaction: 'fire', count: 2 }], yours: null });
  const openFriend = vi.fn();
  await act(async () =>
    root.render(<FriendFeedCard active onOpenFriend={openFriend} onOpenFriends={vi.fn()} />),
  );

  expect(host.textContent).toContain('Sample Friend · Push day');
  expect(button('Fire, 2').getAttribute('aria-pressed')).toBe('false');
  await act(async () => button('Fire, 2').click());
  expect(react).toHaveBeenCalledWith('w1', 'fire');
  expect(button('Fire, 3').getAttribute('aria-pressed')).toBe('true');

  await act(async () => button('Fire, 3').click());
  expect(remove).toHaveBeenCalledWith('w1');
  expect(button('Fire, 2').getAttribute('aria-pressed')).toBe('false');

  await act(async () => host.querySelector<HTMLButtonElement>('.friend-feed-workout')!.click());
  expect(openFriend).toHaveBeenCalledWith(item.friend);
});

it('explains how to see the feed when your profile is private or nobody is followed', async () => {
  const feed = vi
    .spyOn(api.sharing, 'feed')
    .mockRejectedValueOnce(new ApiError('Share first.', 'sharing_required', 403));
  await act(async () =>
    root.render(<FriendFeedCard active onOpenFriend={vi.fn()} onOpenFriends={vi.fn()} />),
  );
  expect(host.textContent).toContain('Share your profile to follow friends');

  feed.mockResolvedValue([]);
  await act(async () =>
    root.render(<FriendFeedCard active={false} onOpenFriend={vi.fn()} onOpenFriends={vi.fn()} />),
  );
  await act(async () =>
    root.render(<FriendFeedCard active onOpenFriend={vi.fn()} onOpenFriends={vi.fn()} />),
  );
  expect(host.textContent).toContain('Workouts from people you follow will appear here');
});

it('lists reactions to your workouts in notifications and dismisses them', async () => {
  const notice = {
    id: 'friend',
    display_name: 'Sample Friend',
    profile_photo_url: null,
    since: '2026-10-19T08:00:00Z',
    workout_id: 'w9',
    workout_name: 'Leg day',
    reaction: 'strong' as const,
  };
  const load = vi
    .spyOn(api.sharing, 'notifications')
    .mockResolvedValue({ requests: [], followers: [], reactions: [notice] });
  const dismiss = vi.spyOn(api.sharing, 'dismissReaction').mockResolvedValue(undefined);
  await act(async () => root.render(<FollowNotifications active onOpenFriends={vi.fn()} />));
  await act(async () => button('Notifications, 1 unread').click());
  expect(document.querySelector('dialog')?.textContent).toContain('Reacted 💪 to Leg day');

  load.mockResolvedValue({ requests: [], followers: [], reactions: [] });
  await act(async () => button("Dismiss Sample Friend's reaction to Leg day").click());
  expect(dismiss).toHaveBeenCalledWith('w9', 'friend', notice.since);
  expect(button('Notifications').getAttribute('aria-label')).toBe('Notifications');
});
