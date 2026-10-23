// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProgressScreen } from './App';
import { api } from './api';
import type { Exercise, ExerciseProgress } from './types';

const pec: Exercise = {
  id: 'pec',
  name: 'Pec Deck',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Machine',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const row = { ...pec, id: 'row', name: 'Cable Row', muscle_group: 'Back' };
const empty = { ...pec, id: 'empty', name: 'Untrained Press' };
const catalogue = [pec, row, empty];
function progress(exercise: Exercise, value = 100): ExerciseProgress {
  return {
    exercise,
    personal_best_weight_kg: value,
    personal_best_estimated_1rm: value,
    points: [
      {
        workout_id: 'old',
        workout_date: '2026-07-01',
        estimated_1rm: value - 20,
        best_weight_kg: value - 30,
        best_reps: 6,
        volume_kg: 1000,
        best_rpe: null,
      },
      {
        workout_id: 'last',
        workout_date: '2026-10-21',
        estimated_1rm: value,
        best_weight_kg: value - 10,
        best_reps: 8,
        volume_kg: 1200,
        best_rpe: null,
      },
    ],
  };
}
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.spyOn(api, 'exerciseProgress').mockImplementation(async (id) =>
    progress(catalogue.find((e) => e.id === id)!),
  );
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
async function render() {
  await act(async () =>
    root.render(
      <ProgressScreen
        exercises={catalogue}
        measurements={[]}
        personalRecords={[]}
        onOpenWorkout={vi.fn()}
        embedded
        browseFirst
        defaultExerciseId="pec"
      />,
    ),
  );
}
async function click(selector: string) {
  const target = host.querySelector<HTMLButtonElement>(selector);
  expect(target, selector).not.toBeNull();
  await act(async () => target!.click());
}
async function search(value: string) {
  await act(async () => {
    const input = host.querySelector<HTMLInputElement>('.is-browsing input')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('keeps the library, query, scroll position and range when opening full progress and returning', async () => {
  await render();
  await search('Pec');
  const library = host.querySelector<HTMLElement>('[aria-label="Exercise library"]')!;
  library.scrollTop = 120;
  await click('.is-browsing [role="option"]');
  expect(host.querySelector<HTMLInputElement>('.is-browsing input')?.value).toBe('Pec');
  expect(library.scrollTop).toBe(120);
  expect(
    host.querySelector('.exercise-progress-preview .progress-hero .range-chips'),
  ).not.toBeNull();
  await click('[aria-label="1 year"]');
  await click('.exercise-open-progress');
  expect(host.querySelector('.exercise-library-panel')?.hasAttribute('hidden')).toBe(true);
  expect(host.querySelector('[aria-label="Personal bests"]')?.closest('[hidden]')).toBeNull();
  await click('.training-back');
  expect(host.querySelector<HTMLInputElement>('.is-browsing input')?.value).toBe('Pec');
  expect(host.querySelector<HTMLElement>('[aria-label="Exercise library"]')?.scrollTop).toBe(120);
  expect(host.querySelector('[aria-label="1 year"]')?.getAttribute('aria-selected')).toBe('true');
  expect(api.exerciseProgress).toHaveBeenCalledTimes(1);
});

it('clears the old preview and ignores stale responses when switching exercises quickly', async () => {
  let finishRow!: (value: ExerciseProgress) => void;
  let finishPec!: (value: ExerciseProgress) => void;
  await render();
  vi.mocked(api.exerciseProgress).mockImplementation(
    (id) =>
      new Promise((resolve) => {
        if (id === 'row') finishRow = resolve;
        else finishPec = resolve;
      }),
  );
  await search('Cable');
  await click('.is-browsing [role="option"]');
  expect(host.querySelector('.exercise-preview-header h2')?.textContent).toBe('Cable Row');
  expect(host.querySelector('.progress-hero-value')).toBeNull();
  await search('Pec');
  await click('.is-browsing [role="option"]');
  await act(async () => finishRow(progress(row, 200)));
  expect(host.querySelector('.exercise-preview-header h2')?.textContent).toBe('Pec Deck');
  expect(host.querySelector('.progress-hero-value')?.textContent).not.toContain('200');
  await act(async () => finishPec(progress(pec, 110)));
  expect(host.querySelector('.progress-hero-value')?.textContent).toContain('110');
});

it('keeps search usable after no matches and shows an empty preview for untrained lifts', async () => {
  vi.mocked(api.exerciseProgress).mockImplementation(async (exerciseId) => ({
    ...progress(catalogue.find((e) => e.id === exerciseId)!),
    points: [],
  }));
  await render();
  await search('nothing matches');
  expect(host.querySelector('[role="status"]')?.textContent).toContain('No exercises match');
  await search('Untrained');
  await click('.is-browsing [role="option"]');
  expect(host.querySelector('.exercise-preview-header h2')?.textContent).toBe('Untrained Press');
  expect(host.querySelector('.exercise-progress-preview')?.textContent).toContain('No data yet');
});

it('offers retry after a failed preview request', async () => {
  vi.mocked(api.exerciseProgress).mockRejectedValueOnce(new Error('Offline'));
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'Could not load exercise progress',
  );
  await click('.exercise-progress-error button');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector('.progress-hero-value')?.textContent).toContain('100');
});

it('refreshes the selected exercise after remote training changes without losing the search', async () => {
  await render();
  await search('Pec');
  vi.mocked(api.exerciseProgress).mockResolvedValue(progress(pec, 130));
  await act(async () =>
    root.render(
      <ProgressScreen
        exercises={catalogue}
        measurements={[]}
        personalRecords={[]}
        onOpenWorkout={vi.fn()}
        embedded
        browseFirst
        defaultExerciseId="pec"
        dataRevision="remote-change"
      />,
    ),
  );
  expect(host.querySelector<HTMLInputElement>('.is-browsing input')?.value).toBe('Pec');
  expect(host.querySelector('.progress-hero-value')?.textContent).toContain('130');
});
