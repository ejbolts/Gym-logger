// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { FriendsPanel } from './SharedProfiles';
import type { SharedProfileSummary, SharingConnections } from './types';

let root: Root;
let host: HTMLDivElement;
const person = {
  id: 'alex',
  display_name: 'Alex Sample',
  profile_photo_url: null,
  since: '2026-10-19T10:00:00Z',
};
const friend: SharedProfileSummary = {
  id: 'alex',
  display_name: 'Alex Sample',
  profile_photo_url: null,
  member_since: '2026-10-01T00:00:00Z',
  visibility: 'public',
  is_you: false,
  follow_status: 'accepted',
  follows_you: true,
  can_view: true,
  workout_count: 2,
  recent_workout_count: 2,
  last_workout_date: '2026-10-19',
  cardio_count: 0,
  record_count: 0,
  shares: { notes: false, body_weight: false, goals: false, machine_photos: false },
};
let connections: SharingConnections;
let profiles: SharedProfileSummary[];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  connections = { requests: [], followers: [person], blocked: [] };
  profiles = [friend];
  vi.spyOn(api.sharing, 'connections').mockImplementation(async () => connections);
  vi.spyOn(api.sharing, 'profiles').mockImplementation(async () => profiles);
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

async function click(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  await act(async () => button!.click());
}
async function render() {
  await act(async () =>
    root.render(<FriendsPanel active refreshKey={0} onOpenProfile={vi.fn()} />),
  );
}

it('explains blocking and moves a blocked follower out of Following/Followers into Blocked, with Unblock', async () => {
  const block = vi.spyOn(api.sharing, 'blockMember').mockImplementation(async () => {
    connections = { requests: [], followers: [], blocked: [person] };
    profiles = [];
  });
  const unblock = vi.spyOn(api.sharing, 'unblockMember').mockImplementation(async () => {
    connections = { requests: [], followers: [], blocked: [] };
    profiles = [{ ...friend, follow_status: 'none', follows_you: false }];
  });
  await render();
  expect(
    document.querySelector('[aria-label="Remove Alex Sample from your followers"]'),
  ).toBeNull();
  await click('About blocking Alex Sample');
  const dialog = document.querySelector('dialog[open]');
  expect(dialog?.textContent).toContain('profile, data and recent activity');
  await click('Close About blocking');
  await click('Block Alex Sample');
  expect(block).toHaveBeenCalledWith('alex');
  expect(document.querySelector('[aria-label="Block Alex Sample"]')).toBeNull();
  expect(host.querySelectorAll('.friend-group')[0].textContent).toContain('not following anyone');
  expect(document.querySelector('[aria-label="Unblock Alex Sample"]')).not.toBeNull();
  await click('Unblock Alex Sample');
  expect(unblock).toHaveBeenCalledWith('alex');
  expect(document.querySelector('[aria-label="Unblock Alex Sample"]')).toBeNull();
});

it('keeps the follower visible and explains an unsuccessful block', async () => {
  vi.spyOn(api.sharing, 'blockMember').mockRejectedValue(new Error('Connection failed'));
  await render();
  await click('Block Alex Sample');
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Connection failed');
  expect(
    document.querySelector<HTMLButtonElement>('[aria-label="Block Alex Sample"]')?.disabled,
  ).toBe(false);
  expect(document.querySelector('[aria-label="Unblock Alex Sample"]')).toBeNull();
});
