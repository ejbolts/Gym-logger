// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { SocialScreen } from './SocialScreen';

let root: Root;
let host: HTMLDivElement;
const openProfile = vi.fn();
const chooseSharing = vi.fn();
const person = {
  id: 'jamie',
  display_name: 'Jamie Sample',
  profile_photo_url: null,
  since: '2026-10-21T10:00:00Z',
};
const profile = {
  ...person,
  member_since: person.since,
  visibility: 'public',
  is_you: false,
  follow_status: 'none',
  follows_you: false,
  can_view: true,
  workout_count: 1,
  recent_workout_count: 1,
  last_workout_date: '2026-10-21',
  shares: { notes: false, body_weight: false, goals: false, machine_photos: false },
} as const;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  openProfile.mockClear();
  chooseSharing.mockClear();
  vi.spyOn(api.sharing, 'feed').mockResolvedValue({ items: [], following: 0 });
  vi.spyOn(api.sharing, 'notifications').mockResolvedValue({
    requests: [],
    followers: [],
    blocked: [],
    reactions: [],
  });
  vi.spyOn(api.sharing, 'profiles').mockResolvedValue([profile]);
  vi.spyOn(api.sharing, 'connections').mockResolvedValue({
    requests: [person],
    followers: [],
    blocked: [],
  });
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

async function render(active = true) {
  await act(async () =>
    root.render(
      <SocialScreen
        active={active}
        onOpenProfile={openProfile}
        onChooseSharing={chooseSharing}
        onOpenSettings={vi.fn()}
      />,
    ),
  );
}

async function tab(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (item) => item.textContent === label,
  )!;
  await act(async () => button.click());
}

it('reuses friend requests and people search, retaining the search field between sections', async () => {
  await render();
  expect(api.sharing.profiles).not.toHaveBeenCalled();
  await tab('Friends');
  expect(host.textContent).toContain('Follow requests');
  expect(host.textContent).toContain('Search people');
  const approve = vi.spyOn(api.sharing, 'approveFollower').mockResolvedValue();
  vi.mocked(api.sharing.connections).mockResolvedValue({
    requests: [],
    followers: [person],
    blocked: [],
  });
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Approve Jamie Sample"]')!.click(),
  );
  expect(approve).toHaveBeenCalledWith('jamie');
  const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Jamie');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await tab('Following');
  await tab('Friends');
  expect(host.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('Jamie');
});

it('keeps private profiles private and routes sharing choices to Profile', async () => {
  vi.mocked(api.sharing.feed).mockRejectedValue(
    new ApiError('Choose sharing first.', 'sharing_required', 403),
  );
  vi.mocked(api.sharing.profiles).mockRejectedValue(
    new ApiError('Choose sharing first.', 'sharing_required', 403),
  );
  const updateSharing = vi.spyOn(api.sharing, 'updateChoices');
  await render();
  await act(async () =>
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Share')!
      .click(),
  );
  expect(chooseSharing).toHaveBeenCalledOnce();
  await tab('Friends');
  await act(async () =>
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Profile sharing')!
      .click(),
  );
  expect(chooseSharing).toHaveBeenCalledTimes(2);
  expect(updateSharing).not.toHaveBeenCalled();
});

it('does not poll the activity feed while Social is hidden', async () => {
  await render(false);
  expect(api.sharing.feed).not.toHaveBeenCalled();
  await render(true);
  expect(api.sharing.feed).toHaveBeenCalledOnce();
  await tab('Friends');
  const calls = vi.mocked(api.sharing.feed).mock.calls.length;
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(api.sharing.feed).toHaveBeenCalledTimes(calls);
});
