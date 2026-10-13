// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusToastProvider } from './StatusToast';
import {
  STATUS_TOAST_MS,
  statusToastDuration,
  useShowToast,
  type ShowToast,
} from './statusToastContext';

let root: Root;
let container: HTMLDivElement;
let showToast: ShowToast;

function CaptureShowToast() {
  showToast = useShowToast();
  return <input aria-label="Workout name" />;
}

function status() {
  return container.querySelector<HTMLElement>('[role="status"]')!;
}

function dismissButton() {
  return container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss notification"]');
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <StatusToastProvider>
        <CaptureShowToast />
      </StatusToastProvider>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('status toast', () => {
  it('keeps an empty polite live region mounted before any message', () => {
    expect(status()).not.toBeNull();
    expect(status().getAttribute('aria-live')).toBe('polite');
    expect(status().textContent).toBe('');
    expect(dismissButton()).toBeNull();
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('announces the message as status text without opening a dialog', async () => {
    await act(async () => showToast('Workout CSV exported.'));
    expect(status().textContent).toBe('Workout CSV exported.');
    expect(container.querySelector('.status-toast.open')).not.toBeNull();
    expect(container.querySelector('dialog')).toBeNull();
    expect(container.querySelector('[aria-modal]')).toBeNull();
  });

  it('treats message content as text, not markup', async () => {
    await act(async () => showToast('Imported <script>.'));
    expect(status().textContent).toBe('Imported <script>.');
    expect(container.querySelector('script')).toBeNull();
  });

  it('dismisses a routine success automatically', async () => {
    await act(async () => showToast('Body measurement deleted.'));
    await act(async () => vi.advanceTimersByTime(STATUS_TOAST_MS - 100));
    expect(status().textContent).toBe('Body measurement deleted.');
    await act(async () => vi.advanceTimersByTime(100));
    expect(status().textContent).toBe('');
    expect(dismissButton()).toBeNull();
    expect(container.querySelector('.status-toast.open')).toBeNull();
  });

  it('closes from the dismiss button', async () => {
    await act(async () => showToast('Workout CSV exported.'));
    await act(async () => dismissButton()!.click());
    expect(status().textContent).toBe('');
    expect(dismissButton()).toBeNull();
  });

  it('keeps a persistent notice until it is dismissed', async () => {
    await act(async () =>
      showToast('Your inactive workout passed its time limit and was auto-saved.', {
        persist: true,
      }),
    );
    expect(container.querySelector('.status-toast-countdown')).toBeNull();
    await act(async () => vi.advanceTimersByTime(10 * 60 * 1000));
    expect(status().textContent).toBe(
      'Your inactive workout passed its time limit and was auto-saved.',
    );
    await act(async () => dismissButton()!.click());
    expect(status().textContent).toBe('');
  });

  it('never moves focus when it appears or closes on its own', async () => {
    const input = container.querySelector('input')!;
    input.focus();
    await act(async () => showToast('Sample workouts removed. They will not be seeded again.'));
    expect(document.activeElement).toBe(input);
    await act(async () => vi.advanceTimersByTime(statusToastDuration('x'.repeat(60))));
    expect(document.activeElement).toBe(input);
  });

  it('replaces the current message and restarts the timer', async () => {
    await act(async () => showToast('Workout CSV exported.'));
    await act(async () => vi.advanceTimersByTime(STATUS_TOAST_MS - 500));
    await act(async () => showToast('Body measurement deleted.'));
    expect(status().textContent).toBe('Body measurement deleted.');
    await act(async () => vi.advanceTimersByTime(STATUS_TOAST_MS - 100));
    expect(status().textContent).toBe('Body measurement deleted.');
    await act(async () => vi.advanceTimersByTime(100));
    expect(status().textContent).toBe('');
  });

  it('pauses the timer while the toast is focused and resumes with the time left', async () => {
    await act(async () => showToast('Workout CSV exported.'));
    await act(async () => vi.advanceTimersByTime(STATUS_TOAST_MS - 1000));
    await act(async () => dismissButton()!.focus());
    expect(container.querySelector('.status-toast.paused')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(status().textContent).toBe('Workout CSV exported.');
    await act(async () => dismissButton()!.blur());
    await act(async () => vi.advanceTimersByTime(900));
    expect(status().textContent).toBe('Workout CSV exported.');
    await act(async () => vi.advanceTimersByTime(100));
    expect(status().textContent).toBe('');
  });

  it('gives longer summaries more reading time, within a limit', () => {
    expect(statusToastDuration('Workout CSV exported.')).toBe(STATUS_TOAST_MS);
    expect(statusToastDuration('x'.repeat(120))).toBe(7200);
    expect(statusToastDuration('x'.repeat(1000))).toBe(10_000);
  });
});
