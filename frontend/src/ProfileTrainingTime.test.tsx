// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { ProfileTrainingTime } from './ProfileTrainingTime';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function values() {
  return [...container.querySelectorAll('dl > div')].map((item) => item.textContent);
}

it('shows workout, cardio and combined time when Profile is shown', async () => {
  const load = vi.spyOn(api, 'trainingTime').mockResolvedValue({
    workout_minutes: 1_530,
    workout_count: 24,
    cardio_minutes: 45,
    cardio_count: 1,
    total_minutes: 1_560,
  });

  await act(async () => root.render(<ProfileTrainingTime active={false} />));
  expect(load).not.toHaveBeenCalled();
  expect(values()).toEqual(['Workouts–', 'Cardio–', 'Combined–']);

  await act(async () => root.render(<ProfileTrainingTime active />));
  expect(values()).toEqual([
    'Workouts25h 30min24 workouts',
    'Cardio45min1 session',
    'Combined26hAll exercise',
  ]);
});

it('offers a retry when the totals cannot load', async () => {
  const load = vi
    .spyOn(api, 'trainingTime')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({
      workout_minutes: 0,
      workout_count: 0,
      cardio_minutes: 0,
      cardio_count: 0,
      total_minutes: 0,
    });

  await act(async () => root.render(<ProfileTrainingTime active />));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Couldn't load your training time.",
  );

  await act(async () => container.querySelector<HTMLButtonElement>('.text-link')!.click());
  expect(load).toHaveBeenCalledTimes(2);
  expect(values()).toEqual([
    'Workouts0min0 workouts',
    'Cardio0min0 sessions',
    'Combined0minAll exercise',
  ]);
});
