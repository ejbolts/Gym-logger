// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardQuickBodyweight } from './TodayScreen';

let root: Root;
let container: HTMLDivElement;
const undo = vi.fn<() => Promise<void>>();
const save = vi.fn<(weight: number) => Promise<() => Promise<void>>>();

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  undo.mockReset().mockResolvedValue(undefined);
  save.mockReset().mockResolvedValue(undo);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render(today: number | null = null) {
  await act(async () =>
    root.render(
      <DashboardQuickBodyweight latestBodyweight={84.2} todayBodyweight={today} onSave={save} />,
    ),
  );
}

async function submit() {
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

function toast() {
  return document.querySelector('.bodyweight-undo-toast');
}

async function clickUndo() {
  await act(async () =>
    (toast()!.querySelector('.undo-toast-action') as HTMLButtonElement).click(),
  );
}

describe('daily bodyweight check-in', () => {
  it('switches between weight, fat and combined, remembers the choice, and saves weight without fat', async () => {
    const saveFat = vi.fn().mockResolvedValue(undo);
    const view = (
      <DashboardQuickBodyweight
        latestBodyweight={84.2}
        todayBodyweight={84.2}
        latestBodyFat={18}
        onSave={save}
        onSaveBodyFat={saveFat}
      />
    );
    await act(async () => root.render(view));
    const choose = async (label: string) =>
      act(async () => {
        [...container.querySelectorAll<HTMLButtonElement>('.quick-check-in-modes button')]
          .find((button) => button.textContent === label)!
          .click();
      });
    await choose('Body weight');
    expect(container.querySelector('.body-fat-check-in')).toBeNull();
    await submit();
    expect(save).toHaveBeenCalledExactlyOnceWith(84.2);
    expect(saveFat).not.toHaveBeenCalled();
    await choose('Body fat');
    expect(container.querySelector('[aria-label="Body weight check-in"]')).toBeNull();
    await submit();
    expect(saveFat).toHaveBeenCalledExactlyOnceWith(18);
    await act(async () => root.render(null));
    await act(async () => root.render(view));
    expect(container.querySelector('[aria-label="Body weight check-in"]')).toBeNull();
    expect(container.querySelector('.body-fat-check-in')).not.toBeNull();
    await choose('Combined');
    expect(container.querySelectorAll('form')).toHaveLength(2);
  });

  it('logs and undoes fat independently with both rows blocked while saving', async () => {
    let finish!: (value: () => Promise<void>) => void;
    const fatUndo = vi.fn().mockResolvedValue(undefined);
    const saveFat = vi.fn(
      () =>
        new Promise<() => Promise<void>>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () =>
      root.render(
        <DashboardQuickBodyweight
          latestBodyweight={84.2}
          todayBodyweight={84.2}
          latestBodyFat={18}
          onSave={save}
          onSaveBodyFat={saveFat}
        />,
      ),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Increase body fat by 0.1%"]')!
        .click(),
    );
    await act(async () =>
      container
        .querySelectorAll('form')[1]
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(saveFat).toHaveBeenCalledExactlyOnceWith(18.1);
    expect(save).not.toHaveBeenCalled();
    expect([...container.querySelectorAll('input')].every((input) => input.disabled)).toBe(true);
    await act(async () => finish(fatUndo));
    expect(toast()?.textContent).toContain('Body fat saved');
    await clickUndo();
    expect(fatUndo).toHaveBeenCalledOnce();
    expect(undo).not.toHaveBeenCalled();
  });

  it('requires today’s weight before body fat can be logged', async () => {
    const saveFat = vi.fn();
    await act(async () =>
      root.render(
        <DashboardQuickBodyweight
          latestBodyweight={84.2}
          todayBodyweight={null}
          latestBodyFat={18}
          onSave={save}
          onSaveBodyFat={saveFat}
        />,
      ),
    );
    const row = container.querySelector('.body-fat-check-in')!;
    expect(row.textContent).toContain('Log today’s body weight first.');
    expect(row.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
    await act(async () =>
      row
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(saveFat).not.toHaveBeenCalled();
  });
  it('shows one saved-today summary and a temporary five-second undo popup after save', async () => {
    await render();
    expect(toast()).toBeNull();
    await submit();
    expect(save).toHaveBeenCalledExactlyOnceWith(84.2);
    await render(84.2);
    expect(container.textContent).toContain('Saved today · 84.2 kg');
    expect(container.textContent!.match(/saved today/gi)).toHaveLength(1);
    expect(container.querySelector('.quick-bodyweight-message')).toBeNull();
    expect(toast()!.getAttribute('style')).toContain('5000ms');
    await act(async () => vi.advanceTimersByTime(4999));
    expect(toast()).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    expect(toast()).toBeNull();
    expect(undo).not.toHaveBeenCalled();
  });

  it('undoes the save and removes the popup and timer', async () => {
    await render();
    await submit();
    await clickUndo();
    expect(undo).toHaveBeenCalledOnce();
    expect(toast()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts the countdown on repeated saves and undoes only the latest save', async () => {
    const latestUndo = vi.fn().mockResolvedValue(undefined);
    await render();
    await submit();
    await act(async () => vi.advanceTimersByTime(4000));
    save.mockResolvedValueOnce(latestUndo);
    await submit();
    await act(async () => vi.advanceTimersByTime(4000));
    expect(toast()).not.toBeNull();
    await clickUndo();
    expect(latestUndo).toHaveBeenCalledOnce();
    expect(undo).not.toHaveBeenCalled();
  });

  it('keeps a failed undo available for retry and prevents overlapping edits', async () => {
    let rejectUndo!: (reason: Error) => void;
    undo.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectUndo = reject;
        }),
    );
    await render();
    await submit();
    await clickUndo();
    expect(container.querySelector('input')!.disabled).toBe(true);
    expect((toast()!.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => vi.advanceTimersByTime(6000));
    expect(toast()).not.toBeNull();
    await act(async () => rejectUndo(new Error('Could not undo. Try again.')));
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Could not undo');
    await act(async () => vi.advanceTimersByTime(4999));
    expect(toast()).not.toBeNull();
    await clickUndo();
    expect(undo).toHaveBeenCalledTimes(2);
    expect(toast()).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows a failed save without an undo popup', async () => {
    save.mockRejectedValueOnce(new Error('Could not save.'));
    await render();
    await submit();
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('Could not save.');
    expect(toast()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('dismisses without undoing and cleans up on unmount', async () => {
    await render();
    await submit();
    await act(async () =>
      (toast()!.querySelector('.undo-toast-close') as HTMLButtonElement).click(),
    );
    expect(toast()).toBeNull();
    expect(undo).not.toHaveBeenCalled();
    await submit();
    await act(async () => root.render(null));
    expect(toast()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
