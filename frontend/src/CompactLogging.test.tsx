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
import type { DashboardData, Exercise } from './types';

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
