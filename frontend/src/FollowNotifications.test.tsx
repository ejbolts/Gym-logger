// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { FollowNotifications } from './FollowNotifications';

const person = {
  id: 'sample',
  display_name: 'Sam Preview',
  profile_photo_url: null,
  since: '2026-10-19T00:00:00Z',
};
let root: Root;
let host: HTMLDivElement;
const friends = vi.fn();
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
  friends.mockClear();
});
async function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === label || button.textContent === label,
  )!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
}

it('counts requests and new followers, approves requests and persists follower dismissals', async () => {
  const load = vi.spyOn(api.sharing, 'notifications').mockResolvedValue({
    requests: [person],
    followers: [{ ...person, id: 'other', display_name: 'Alex Preview' }],
  });
  const approve = vi.spyOn(api.sharing, 'approveFollower').mockResolvedValue(undefined);
  const dismiss = vi.spyOn(api.sharing, 'dismissNotification').mockResolvedValue(undefined);
  await act(async () => root.render(<FollowNotifications active onOpenFriends={friends} />));
  await click('Notifications, 2 unread');
  expect(document.querySelector('dialog')?.textContent).toContain('Requested to follow you');
  expect(document.querySelector('dialog')?.textContent).toContain('Started following you');
  load.mockResolvedValue({
    requests: [],
    followers: [{ ...person, id: 'other', display_name: 'Alex Preview' }],
  });
  await click('Approve Sam Preview');
  expect(approve).toHaveBeenCalledWith('sample');
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
  load.mockResolvedValue({ requests: [], followers: [] });
  await click('Dismiss notification from Alex Preview');
  expect(dismiss).toHaveBeenCalledWith('other', person.since);
  expect(document.querySelector('dialog')?.textContent).toContain("You're all caught up");
  await click('Find people and manage friends');
  expect(friends).toHaveBeenCalledOnce();
  expect(document.querySelector('dialog')).toBeNull();
});

it('keeps failed requests actionable and supports declining after retry', async () => {
  vi.spyOn(api.sharing, 'notifications').mockResolvedValue({ requests: [person], followers: [] });
  const decline = vi
    .spyOn(api.sharing, 'removeFollower')
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue(undefined);
  await act(async () => root.render(<FollowNotifications active onOpenFriends={friends} />));
  await click('Notifications, 1 unread');
  await click('Decline Sam Preview');
  expect(document.querySelector('[role="alert"]')).toBeTruthy();
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
  vi.mocked(api.sharing.notifications).mockResolvedValue({ requests: [], followers: [] });
  await click('Decline Sam Preview');
  expect(decline).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications');
});
