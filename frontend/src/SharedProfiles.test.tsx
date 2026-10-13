// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { SharedProfilesScreen } from './SharedProfiles';
import type { SharedProfileSummary } from './types';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  api: { sharing: { connections: vi.fn(), profiles: vi.fn() } },
}));

const member: SharedProfileSummary = {
  id: 'member-2',
  display_name: 'Sam Lifter',
  profile_photo_url: null,
  member_since: '2026-01-05',
  visibility: 'public',
  is_you: false,
  follow_status: 'none',
  follows_you: false,
  can_view: true,
  workout_count: 4,
  recent_workout_count: 1,
  last_workout_date: '2026-10-10',
  shares: null,
};

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(api.sharing.connections).mockReset();
  vi.mocked(api.sharing.profiles).mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function show(active = true) {
  await act(async () => {
    root.render(
      <SharedProfilesScreen active={active} onOpenProfile={vi.fn()} onChooseSharing={vi.fn()} />,
    );
  });
}

function tryAgainButtons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter(
    (button) => button.textContent === 'Try again',
  );
}

describe('SharedProfilesScreen load errors', () => {
  it('shows an error and Try again instead of empty copy when followers fail, then recovers', async () => {
    vi.mocked(api.sharing.profiles).mockResolvedValue([member]);
    vi.mocked(api.sharing.connections)
      .mockRejectedValueOnce(new Error('The connection dropped.'))
      .mockResolvedValueOnce({ requests: [], followers: [] });

    await show();

    expect(container.textContent).toContain('The connection dropped.');
    expect(container.textContent).toContain('Follow requests');
    expect(container.textContent).toContain('Your followers');
    expect(container.textContent).not.toContain('Nobody follows you yet.');
    expect(container.textContent).not.toContain('waiting for you');
    // The requests and followers sections both report the failed fetch.
    expect(tryAgainButtons()).toHaveLength(2);

    await act(async () => tryAgainButtons()[0].click());

    expect(api.sharing.connections).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain('The connection dropped.');
    expect(container.textContent).toContain('Nobody follows you yet.');
    expect(tryAgainButtons()).toHaveLength(0);
  });

  it('reports a failed refresh of shared profiles beside the list it could not update', async () => {
    vi.mocked(api.sharing.connections).mockResolvedValue({ requests: [], followers: [] });
    vi.mocked(api.sharing.profiles)
      .mockResolvedValueOnce([member])
      .mockRejectedValueOnce(new Error('The profiles refresh failed.'))
      .mockResolvedValueOnce([member]);

    await show(true);
    expect(container.textContent).toContain('Sam Lifter');
    await show(false);
    await show(true);

    expect(container.textContent).toContain('The profiles refresh failed.');
    expect(container.textContent).toContain('Sam Lifter');

    await act(async () => tryAgainButtons()[0].click());

    expect(container.textContent).not.toContain('The profiles refresh failed.');
    expect(container.textContent).toContain('Sam Lifter');
  });
});
