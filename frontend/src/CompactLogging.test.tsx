// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
import {
  readActiveWorkoutDraft,
  writeActiveWorkoutDraft,
  type ActiveWorkoutDraft,
} from './workoutDraft';
import { createWorkoutSet } from './workoutSets';
import type { DashboardData, Exercise, TrackedWorkout } from './types';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    api: {
      ...original.api,
      dashboard: vi.fn(),
      listExercises: vi.fn(),
      listWorkouts: vi.fn(),
      listBodyMeasurements: vi.fn(),
      listPersonalRecords: vi.fn(),
      getWorkoutTypeColors: vi.fn().mockResolvedValue({}),
      listMachinePhotos: vi.fn().mockResolvedValue([]),
      lastUsedMachinePhotos: vi.fn().mockResolvedValue([]),
      createWorkout: vi.fn(),
      updateWorkout: vi.fn(),
    },
  };
});
vi.mock('./workoutCache', () => ({
  readDashboardCache: vi.fn().mockResolvedValue(null),
  writeDashboardCache: vi.fn().mockResolvedValue(undefined),
  readWorkoutCache: vi.fn().mockResolvedValue(null),
  writeWorkoutCache: vi.fn().mockResolvedValue(undefined),
}));

const COMPACT_KEY = 'gym-logger-compact-logging';

function exercise(id: string, name: string): Exercise {
  return {
    id,
    name,
    category: 'upper',
    kind: 'strength',
    muscle_group: 'Back',
    equipment: 'Cable',
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
  };
}

const exercises = [
  exercise('bench', 'Bench press'),
  exercise('row', 'Cable row'),
  exercise('squat', 'Goblet squat'),
  exercise('curl', 'Hammer curl'),
];

/** Bench is finished, the row is half done, and a squat/curl superset has not started. */
function storedDraft(): ActiveWorkoutDraft {
  const startedAt = Date.now() - 600_000;
  const sets = (id: string, completed: boolean[]) =>
    completed.map((done, index) => ({
      ...createWorkoutSet('strength'),
      key: `${id}-set-${index}`,
      reps: id === 'bench' ? 8 : 10,
      weight_kg: id === 'bench' ? 80 : 60,
      set_type: 'normal' as const,
      warmup: false,
      completed: done,
      fromPrevious: false,
    }));
  return {
    version: 1,
    startedAt,
    updatedAt: startedAt,
    lastActiveAt: startedAt,
    inactiveFinishAt: startedAt + 3 * 60 * 60 * 1000,
    name: 'Compact workout',
    workoutDate: '2026-10-13',
    category: 'upper',
    notes: '',
    movements: [
      ['bench', [true, true], null],
      ['row', [true, false, false], null],
      ['squat', [false, false], 'pair'],
      ['curl', [false, false], 'pair'],
    ].map(([id, completed, supersetKey]) => ({
      key: `m-${id}`,
      exerciseId: id as string,
      notes: '',
      machinePhotoIds: [],
      supersetKey: supersetKey as string | null,
      isComplete: false,
      sets: sets(id as string, completed as boolean[]),
    })),
  };
}

let root: Root;
let container: HTMLDivElement;

async function mount() {
  await act(async () => root.render(<App />));
}

function card(id: string) {
  return container.querySelector<HTMLElement>(`.movement-card[data-flip-key="m-${id}"]`)!;
}

function compactToggle() {
  return container.querySelector<HTMLButtonElement>('[aria-label="Compact logging"]')!;
}

function summaryLabels() {
  return [...container.querySelectorAll('.compact-movement-summary-button')].map((button) =>
    button.getAttribute('aria-label'),
  );
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  window.localStorage.clear();
  window.localStorage.setItem('gym-logger-reduce-motion', 'reduced');
  window.history.replaceState(null, '', '#log');
  vi.mocked(api.dashboard).mockResolvedValue({ recommendation: null } as unknown as DashboardData);
  vi.mocked(api.listExercises).mockResolvedValue(exercises);
  vi.mocked(api.listWorkouts).mockResolvedValue([]);
  vi.mocked(api.listBodyMeasurements).mockResolvedValue([]);
  vi.mocked(api.listPersonalRecords).mockResolvedValue([]);
  vi.mocked(api.listMachinePhotos).mockResolvedValue([]);
  vi.mocked(api.lastUsedMachinePhotos).mockResolvedValue([]);
  vi.mocked(api.getWorkoutTypeColors).mockResolvedValue({
    upper: '#8b5cf6',
    lower: '#f59e0b',
    push: '#ef476f',
    pull: '#3b82f6',
    full_body: '#14b8a6',
    cardio: '#22c55e',
    other: '#94a3b8',
  });
  vi.mocked(readDashboardCache).mockResolvedValue(null);
  vi.mocked(writeDashboardCache).mockResolvedValue(undefined);
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

describe('compact workout logging', () => {
  it('folds finished and upcoming exercises, keeps the current one open, and changes no data', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    await mount();

    expect(compactToggle().getAttribute('aria-pressed')).toBe('false');
    expect(summaryLabels()).toEqual([]);
    expect(container.querySelectorAll('[aria-label^="Rest after set"]')).toHaveLength(9);

    await click(compactToggle());

    expect(compactToggle().getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem(COMPACT_KEY)).toBe('enabled');
    expect(summaryLabels()).toEqual([
      'Bench press, 2 of 2 sets done, Best 80 kg × 8',
      'Goblet squat, superset, 2 sets planned',
      'Hammer curl, superset, 2 sets planned',
    ]);
    expect(card('bench').classList).toContain('is-collapsed');
    expect(card('row').classList).not.toContain('is-collapsed');
    expect(card('row').classList).toContain('is-current-movement');
    expect(card('row').getAttribute('aria-current')).toBe('step');
    expect(container.querySelectorAll('.is-current-movement')).toHaveLength(1);
    expect(card('row').querySelector('.is-next-set')?.getAttribute('data-set-key')).toBe(
      'row-set-1',
    );

    // Photos, rest times and notes wait behind More; set entry stays visible.
    const more = card('row').querySelector<HTMLButtonElement>('.compact-more-toggle')!;
    expect(card('row').classList).toContain('compact-extras-hidden');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(card('row').querySelector('[aria-label="Complete set 2"]')).not.toBeNull();
    await click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(card('row').classList).not.toContain('compact-extras-hidden');

    expect(readActiveWorkoutDraft()).toMatchObject({ movements: draft.movements });
  });

  it('remembers the choice, opens a superset as one unit, and restores the full layout', async () => {
    window.localStorage.setItem(COMPACT_KEY, 'enabled');
    writeActiveWorkoutDraft(storedDraft());
    await mount();
    expect(compactToggle().getAttribute('aria-pressed')).toBe('true');

    const squatRow = card('squat').querySelector<HTMLButtonElement>(
      '.compact-movement-summary-button',
    )!;
    expect(squatRow.getAttribute('aria-expanded')).toBe('false');
    squatRow.focus();
    await click(squatRow);

    expect(card('squat').classList).not.toContain('is-collapsed');
    expect(card('curl').classList).not.toContain('is-collapsed');
    expect(summaryLabels()).toEqual(['Bench press, 2 of 2 sets done, Best 80 kg × 8']);
    // Focus moves from the summary row to the card's collapse control.
    expect(document.activeElement).toBe(card('squat').querySelector('.movement-expand-toggle'));
    expect(document.activeElement?.getAttribute('aria-expanded')).toBe('true');

    await click(compactToggle());

    expect(window.localStorage.getItem(COMPACT_KEY)).toBe('disabled');
    expect(summaryLabels()).toEqual([]);
    expect(container.querySelectorAll('.movement-card.is-collapsed')).toHaveLength(0);
    expect(container.querySelectorAll('.compact-movement, .is-current-movement')).toHaveLength(0);
    expect(container.querySelectorAll('.compact-more-toggle')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-label^="Rest after set"]')).toHaveLength(9);
  });

  it('moves on to the superset after the last row set and keeps the rest timer running', async () => {
    window.localStorage.setItem(COMPACT_KEY, 'enabled');
    writeActiveWorkoutDraft(storedDraft());
    await mount();

    await click(card('row').querySelector<HTMLButtonElement>('[aria-label="Complete set 2"]')!);
    expect(container.querySelector('.workout-rest-timer')).not.toBeNull();
    expect(card('row').querySelector('.is-next-set')?.getAttribute('data-set-key')).toBe(
      'row-set-2',
    );

    await click(card('row').querySelector<HTMLButtonElement>('[aria-label="Complete set 3"]')!);

    expect(card('row').classList).toContain('is-collapsed');
    expect(summaryLabels()).toEqual([
      'Bench press, 2 of 2 sets done, Best 80 kg × 8',
      'Cable row, 3 of 3 sets done, Best 60 kg × 10',
    ]);
    expect(card('squat').classList).toContain('is-current-movement');
    expect(card('curl').classList).toContain('is-current-movement');
    expect(card('squat').querySelector('.is-next-set')?.getAttribute('data-set-key')).toBe(
      'squat-set-0',
    );
    expect(container.querySelector('.workout-rest-timer')).not.toBeNull();
    expect(readActiveWorkoutDraft()!.movements[1].sets.every((item) => item.completed)).toBe(true);
  });
});

describe('exercise tick applies to every set', () => {
  const rowDraft = () =>
    readActiveWorkoutDraft()!.movements.find((item) => item.exerciseId === 'row')!;
  const exerciseTick = () =>
    card('row').querySelector<HTMLButtonElement>('.exercise-complete-button')!;

  it.each([false, true])(
    'completes and clears all sets without changing values (compact=%s)',
    async (compact) => {
      if (compact) window.localStorage.setItem(COMPACT_KEY, 'enabled');
      const draft = storedDraft();
      const row = draft.movements[1];
      row.notes = 'Keep these exercise notes';
      row.sets = row.sets.map((set, index) => ({
        ...set,
        weight_kg: 45 + index * 15,
        reps: 12 - index * 2,
        rpe: 6 + index,
        rest_seconds: 120 + index * 30,
        notes: `Set note ${index}`,
        warmup: index === 0,
        set_type: index === 0 ? 'warmup' : 'normal',
        fromPrevious: !set.completed,
      }));
      writeActiveWorkoutDraft(draft);
      await mount();
      await click(exerciseTick());
      expect(rowDraft()).toMatchObject({
        isComplete: true,
        notes: row.notes,
        sets: row.sets.map((set) => ({ ...set, completed: true, fromPrevious: false })),
      });
      expect(
        readActiveWorkoutDraft()!.movements.filter((item) => item.exerciseId !== 'row'),
      ).toEqual(draft.movements.filter((item) => item.exerciseId !== 'row'));
      if (compact) {
        expect(
          card('row').querySelector('.compact-movement-summary-button')?.getAttribute('aria-label'),
        ).toContain('3 of 3 sets done');
        await click(
          card('row').querySelector<HTMLButtonElement>('.compact-movement-summary-button')!,
        );
      } else await click(card('row').querySelector<HTMLButtonElement>('.movement-expand-toggle')!);
      expect(
        card('row').querySelectorAll('.row-complete-button[aria-pressed="true"]'),
      ).toHaveLength(3);
      await click(exerciseTick());
      expect(rowDraft()).toMatchObject({
        isComplete: false,
        sets: row.sets.map((set) => ({ ...set, completed: false, fromPrevious: true })),
      });
      expect(
        card('row').querySelectorAll('.row-complete-button[aria-pressed="true"]'),
      ).toHaveLength(0);
      // Reload recovery preserves the user's explicit untick as planned sets.
      await act(async () => root.unmount());
      root = createRoot(container);
      await mount();
      expect(rowDraft().isComplete).toBe(false);
      expect(rowDraft().sets.every((set) => !set.completed && set.fromPrevious)).toBe(true);
    },
  );

  it('keeps explicitly unticked exercise sets incomplete during inactivity saving', async () => {
    const draft = storedDraft();
    draft.movements[1].isComplete = true;
    draft.movements[1].sets.forEach((set) => {
      set.completed = true;
    });
    writeActiveWorkoutDraft(draft);
    await mount();
    await click(exerciseTick());
    vi.mocked(api.createWorkout).mockReturnValueOnce(new Promise<TrackedWorkout>(() => {}));
    vi.spyOn(Date, 'now').mockReturnValue(readActiveWorkoutDraft()!.inactiveFinishAt! + 1000);
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(api.createWorkout).toHaveBeenCalledOnce();
    const savedRow = vi
      .mocked(api.createWorkout)
      .mock.calls[0][0].movements.find((item) => item.exercise_id === 'row')!;
    expect(savedRow.sets.map((set) => set.completed)).toEqual([false, false, false]);
    expect(savedRow.sets.map((set) => set.weight_kg)).toEqual([60, 60, 60]);
  });

  it('retains unusual-entry confirmation before completing the exercise', async () => {
    const draft = storedDraft();
    draft.movements[1].sets[2].weight_kg = 400;
    writeActiveWorkoutDraft(draft);
    await mount();
    await click(exerciseTick());
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'Is 400 kg intended?',
    );
    expect(rowDraft().sets.map((set) => set.completed)).toEqual([true, false, false]);
    const dialogButton = (text: string) =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find(
        (button) => button.textContent === text,
      )!;
    await click(dialogButton('Go back'));
    expect(rowDraft().isComplete).toBe(false);
    await click(exerciseTick());
    await click(dialogButton('Complete exercise'));
    expect(rowDraft().isComplete).toBe(true);
    expect(rowDraft().sets.map((set) => set.completed)).toEqual([true, true, true]);
    expect(rowDraft().sets.map((set) => set.weight_kg)).toEqual([60, 60, 400]);
  });

  it.each(['untick a set', 'add a set'])(
    'clears the finished exercise flag when you %s',
    async (action) => {
      writeActiveWorkoutDraft(storedDraft());
      await mount();
      await click(exerciseTick());
      await click(card('row').querySelector<HTMLButtonElement>('.movement-expand-toggle')!);
      if (action === 'untick a set') {
        await click(
          card('row').querySelector<HTMLButtonElement>('[aria-label="Mark set 1 incomplete"]')!,
        );
        expect(rowDraft().sets.filter((set) => set.completed)).toHaveLength(2);
      } else {
        await click(card('row').querySelector<HTMLButtonElement>('.add-set-button')!);
        expect(rowDraft().sets).toHaveLength(4);
        expect(rowDraft().sets[3].completed).toBe(false);
      }
      expect(rowDraft().isComplete).toBe(false);
      expect(exerciseTick().getAttribute('aria-pressed')).toBe('false');
    },
  );

  it('also completes and clears cardio sets while retaining their metrics', async () => {
    vi.mocked(api.listExercises).mockResolvedValue(
      exercises.map((item) =>
        item.id === 'row'
          ? { ...item, name: 'Treadmill', kind: 'cardio', equipment: 'Treadmill' }
          : item,
      ),
    );
    const draft = storedDraft();
    draft.movements[1].sets = [0, 1, 2].map((index) => ({
      ...createWorkoutSet('cardio'),
      key: `cardio-${index}`,
      duration_seconds: 600 + index * 120,
      distance_km: 1 + index,
      calories_kcal: 100 + index * 20,
      average_heart_rate_bpm: 130 + index * 5,
      speed_kph: 6,
      incline_percent: 3,
      notes: `Cardio note ${index}`,
      fromPrevious: true,
    }));
    writeActiveWorkoutDraft(draft);
    await mount();
    await click(exerciseTick());
    expect(rowDraft().sets).toEqual(
      draft.movements[1].sets.map((set) => ({ ...set, completed: true, fromPrevious: false })),
    );
    await click(exerciseTick());
    expect(rowDraft().sets).toEqual(
      draft.movements[1].sets.map((set) => ({ ...set, completed: false, fromPrevious: true })),
    );
  });
});
