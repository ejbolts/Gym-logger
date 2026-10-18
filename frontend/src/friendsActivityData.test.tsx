// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import {
  loadFriendWorkouts,
  useFollowRequestCount,
  profileButtonLabel,
  useOpenFeedbackCount,
} from './friendsActivityData';
import type { SharedProfileSummary } from './types';

const friend: SharedProfileSummary = {
  id: 'friend',
  display_name: 'Sample Friend',
  profile_photo_url: null,
  member_since: '2026-09-01T10:00:00Z',
  visibility: 'public',
  is_you: false,
  follow_status: 'accepted',
  follows_you: false,
  can_view: true,
  workout_count: 2,
  recent_workout_count: 2,
  last_workout_date: '2026-10-17',
  shares: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Today friends activity', () => {
  it('loads only viewable followed members, most recent first, with a five-friend limit', async () => {
    const workouts = vi.spyOn(api.sharing, 'workouts').mockResolvedValue({
      workouts: [],
      total: 0,
      personal_records: [],
    });
    const profiles = [
      { ...friend, id: 'self', is_you: true },
      { ...friend, id: 'pending', follow_status: 'pending' as const },
      { ...friend, id: 'unfollowed', follow_status: 'none' as const },
      { ...friend, id: 'hidden', can_view: false },
      { ...friend, id: 'no-workouts', last_workout_date: null },
      ...Array.from({ length: 6 }, (_, index) => ({
        ...friend,
        id: `friend-${index}`,
        last_workout_date: `2026-10-${10 + index}`,
      })),
    ];
    const result = await loadFriendWorkouts(profiles);
    expect(result.map(({ friend }) => friend.id)).toEqual([
      'friend-5',
      'friend-4',
      'friend-3',
      'friend-2',
      'friend-1',
    ]);
    expect(workouts).toHaveBeenCalledTimes(5);
    expect(workouts).toHaveBeenNthCalledWith(1, 'friend-5', 0, 1);
    expect(profiles[5].id).toBe('friend-0');
  });

  it('keeps other friends available when one latest-workout request fails', async () => {
    vi.spyOn(api.sharing, 'workouts')
      .mockRejectedValueOnce(new Error('Connection interrupted'))
      .mockResolvedValueOnce({ workouts: [], total: 0, personal_records: [] });
    const result = await loadFriendWorkouts([friend, { ...friend, id: 'second' }]);
    expect(result).toEqual([
      { friend, workout: null },
      { friend: { ...friend, id: 'second' }, workout: null },
    ]);
  });

  it('refreshes request counts on return to Today and window focus, and clears private counts', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const choices = vi.spyOn(api.sharing, 'choices').mockResolvedValue({
      visibility: 'followers',
      pending_requests: 2,
      share_notes: false,
      share_cardio: false,
      share_body_weight: false,
      share_goals: false,
      share_machine_photos: false,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    function Badge({ active }: { active: boolean }) {
      return <span>{useFollowRequestCount(active, true)}</span>;
    }
    try {
      await act(async () => root.render(<Badge active />));
      expect(container.textContent).toBe('2');
      await act(async () => root.render(<Badge active={false} />));
      const settings = await api.sharing.choices();
      choices.mockResolvedValue({ ...settings, pending_requests: 0 });
      await act(async () => root.render(<Badge active />));
      expect(container.textContent).toBe('0');
      choices.mockResolvedValue({ ...settings, pending_requests: 3 });
      await act(async () => window.dispatchEvent(new Event('focus')));
      expect(container.textContent).toBe('3');
      choices.mockResolvedValue({ ...settings, visibility: 'private', pending_requests: 3 });
      await act(async () => window.dispatchEvent(new Event('focus')));
      expect(container.textContent).toBe('0');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
    const calls = choices.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    expect(choices).toHaveBeenCalledTimes(calls);
  });

  it('counts open feedback for administrators only', async () => {
    const summary = vi.spyOn(api.admin, 'feedbackSummary').mockResolvedValue({ open: 4 });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    function Badge({ isAdmin }: { isAdmin: boolean }) {
      return <span>{useOpenFeedbackCount(true, isAdmin)}</span>;
    }
    try {
      await act(async () => root.render(<Badge isAdmin={false} />));
      expect(container.textContent).toBe('0');
      expect(summary).not.toHaveBeenCalled();
      await act(async () => root.render(<Badge isAdmin />));
      expect(container.textContent).toBe('4');
      summary.mockResolvedValue({ open: 1 });
      await act(async () => window.dispatchEvent(new Event('focus')));
      expect(container.textContent).toBe('1');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      summary.mockRestore();
    }
  });

  it('describes waiting requests and feedback on the profile button', () => {
    expect(profileButtonLabel('Ethan', 0, 0)).toBe('Profile: Ethan');
    expect(profileButtonLabel('Ethan', 1, 0)).toBe('Profile: Ethan, 1 follow request');
    expect(profileButtonLabel(undefined, 2, 1)).toBe(
      'Profile, 2 follow requests, 1 feedback message to review',
    );
    expect(profileButtonLabel('Ethan', 0, 3)).toBe('Profile: Ethan, 3 feedback messages to review');
  });
});
