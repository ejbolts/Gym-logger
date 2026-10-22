// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { FollowNotifications } from './FollowNotifications';
import {
  markNotificationSnapshotRead,
  unreadNotificationReferences,
} from './notificationReadState';
import type { SharingNotifications } from './types';
const person = {
  id: 'sample',
  display_name: 'Sam Preview',
  profile_photo_url: null,
  since: '2026-10-19T00:00:00Z',
};
const reaction = {
  ...person,
  id: 'alex',
  display_name: 'Alex Preview',
  workout_id: 'w1',
  workout_name: 'Leg day',
  reaction: 'love' as const,
};
let root: Root;
let host: HTMLDivElement;
let snapshot: SharingNotifications;
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
  snapshot = { requests: [], accepted: [], reactions: [] };
  vi.spyOn(api.sharing, 'notifications').mockImplementation(async () => snapshot);
  vi.spyOn(api.sharing, 'markNotificationsRead').mockImplementation(async (refs) => {
    snapshot = markNotificationSnapshotRead(snapshot, refs);
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  friends.mockClear();
});
async function click(label: string) {
  const b = [...document.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  );
  expect(b, label).toBeTruthy();
  await act(async () => b!.click());
}
async function render() {
  await act(async () => root.render(<FollowNotifications active onOpenFriends={friends} />));
}
it('reads requests, accepted requests and reactions on open without removing their contents or adding Dismiss buttons', async () => {
  snapshot = { requests: [person], accepted: [{ ...person, id: 'riley' }], reactions: [reaction] };
  const accept = vi.spyOn(api.sharing, 'acceptFriend').mockResolvedValue({ status: 'friends' });
  await render();
  await click('Notifications, 3 unread');
  expect(api.sharing.markNotificationsRead).toHaveBeenCalledWith([
    { kind: 'request', id: 'sample', since: person.since },
    { kind: 'accepted', id: 'riley', since: person.since },
    { kind: 'reaction', id: 'alex', since: person.since, workout_id: 'w1' },
  ]);
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications');
  expect(document.querySelector('dialog')?.textContent).toContain('Leg day');
  expect(document.querySelector('dialog')?.textContent).not.toContain('Dismiss');
  snapshot = { ...snapshot, requests: [] };
  await click('Accept Sam Preview');
  expect(accept).toHaveBeenCalledWith('sample');
  await click('Close Notifications');
  await click('Notifications');
  expect(document.querySelector('dialog')?.textContent).toContain('Leg day');
  expect(api.sharing.markNotificationsRead).toHaveBeenCalledTimes(1);
  await click('Manage friends');
  expect(friends).toHaveBeenCalledOnce();
});
it('keeps the unread badge when reading fails and retries without losing notices', async () => {
  snapshot = { requests: [], accepted: [], reactions: [reaction] };
  vi.mocked(api.sharing.markNotificationsRead).mockRejectedValueOnce(new Error('Offline'));
  await render();
  await click('Notifications, 1 unread');
  expect(document.querySelector('[role="alert"]')).toBeTruthy();
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
  await click('Try again');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications');
  expect(document.querySelector('dialog')?.textContent).toContain('Leg day');
});
it('keeps a read request actionable after a failed decline', async () => {
  snapshot = { requests: [person], accepted: [] };
  const decline = vi
    .spyOn(api.sharing, 'removeFriend')
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue(undefined);
  await render();
  await click('Notifications, 1 unread');
  await click('Decline Sam Preview');
  expect(document.querySelector('[role="alert"]')).toBeTruthy();
  snapshot = { requests: [], accepted: [] };
  await click('Decline Sam Preview');
  expect(decline).toHaveBeenCalledTimes(2);
  expect(document.querySelector('dialog')?.textContent).toContain("You're all caught up");
});
it('does not locally acknowledge a reaction that changed after the displayed snapshot', () => {
  const old = { requests: [], accepted: [], reactions: [reaction] };
  const newer = { ...old, reactions: [{ ...reaction, since: '2026-10-19T00:01:00Z' }] };
  expect(
    unreadNotificationReferences(
      markNotificationSnapshotRead(newer, unreadNotificationReferences(old)),
    ),
  ).toHaveLength(1);
});

it('sends the bulk read snapshot as JSON to the server', async () => {
  vi.mocked(api.sharing.markNotificationsRead).mockRestore();
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetch);
  const refs = unreadNotificationReferences({ requests: [], accepted: [], reactions: [reaction] });
  await api.sharing.markNotificationsRead(refs);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('/api/sharing/notifications/read');
  expect(new Headers(options.headers).get('Content-Type')).toBe('application/json');
  expect(JSON.parse(options.body)).toEqual({ items: refs });
});
