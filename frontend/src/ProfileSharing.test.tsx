// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { ProfileSharingPanel } from './ProfileSharing';
import type { SharingChoices, SharingSettings } from './types';

let root: Root;
let container: HTMLDivElement;

const friendsOnly: SharingSettings = {
  visibility: 'followers',
  share_notes: false,
  share_cardio: false,
  share_body_weight: false,
  share_goals: false,
  share_machine_photos: false,
  pending_requests: 0,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(api.sharing, 'choices').mockResolvedValue(friendsOnly);
  vi.spyOn(api.sharing, 'updateChoices').mockImplementation(async (choices: SharingChoices) => ({
    ...choices,
    pending_requests: 0,
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => root.render(<ProfileSharingPanel onOpenSharedProfiles={vi.fn()} />));
}

function radio(value: string) {
  return container.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
}

function button(text: string) {
  return [...container.querySelectorAll('button')].find((item) => item.textContent === text);
}

describe('profile sharing visibility', () => {
  it('waits for the confirm button before changing who can see a shared profile', async () => {
    await render();
    await act(async () => radio('public').click());

    expect(api.sharing.updateChoices).not.toHaveBeenCalled();
    expect(radio('public').checked).toBe(true);

    await act(async () => button('Make my profile public')!.click());
    expect(api.sharing.updateChoices).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ visibility: 'public' }),
    );
    expect(button('Make my profile public')).toBeUndefined();
  });

  it('asks before making a shared profile private, and reselecting cancels the change', async () => {
    await render();
    await act(async () => radio('private').click());
    expect(button('Make my profile private')).toBeDefined();

    await act(async () => radio('followers').click());
    expect(button('Make my profile private')).toBeUndefined();
    expect(api.sharing.updateChoices).not.toHaveBeenCalled();
  });

  it('shows the saved message as a five-second popup', async () => {
    await render();
    await act(async () => radio('public').click());
    await act(async () => button('Make my profile public')!.click());

    const toast = document.querySelector('.top-toast');
    expect(toast?.textContent).toContain('Your profile is public to every member who shares.');
    await act(async () => vi.advanceTimersByTime(5000));
    expect(document.querySelector('.top-toast')).toBeNull();
  });
});
