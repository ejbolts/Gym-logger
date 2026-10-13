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
import { isStrengthPrEligible } from './workoutPr';
import { createWorkoutSet } from './workoutSets';
import type { DashboardData, Exercise, TrackedWorkout, WorkoutInput } from './types';

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
    },
  };
});
vi.mock('./workoutCache', () => ({
  readDashboardCache: vi.fn().mockResolvedValue(null),
  writeDashboardCache: vi.fn().mockResolvedValue(undefined),
  readWorkoutCache: vi.fn().mockResolvedValue(null),
  writeWorkoutCache: vi.fn().mockResolvedValue(undefined),
}));

const bench: Exercise = {
  id: 'bench',
  name: 'Bench press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const row: Exercise = { ...bench, id: 'row', name: 'Cable row', category: 'pull' };
let root: Root;
let container: HTMLDivElement;

function storedDraft(overrides: Partial<ActiveWorkoutDraft> = {}): ActiveWorkoutDraft {
  const startedAt = Date.now() - 600_000;
  return {
    version: 1,
    startedAt,
    updatedAt: startedAt,
    lastActiveAt: startedAt,
    inactiveFinishAt: startedAt + 3 * 60 * 60 * 1000,
    name: 'Recovery workout',
    workoutDate: '2026-10-13',
    category: 'upper',
    notes: 'Workout notes survive',
    movements: [bench, row].map((exercise, index) => ({
      key: `movement-${index}`,
      exerciseId: exercise.id,
      notes: `${exercise.name} notes survive`,
      machinePhotoIds: [`sample-photo-${index}`],
      supersetKey: 'sample-superset',
      isComplete: false,
      sets: [
        {
          ...createWorkoutSet('strength'),
          key: `set-${index}`,
          reps: 8,
          weight_kg: 80,
          set_type: 'normal',
          warmup: false,
          notes: 'Set notes survive',
          completed: true,
        },
      ],
    })),
    ...overrides,
  };
}

async function mount() {
  await act(async () => root.render(<App />));
}

function retry() {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent === 'Retry loading exercises',
  );
  expect(button).toBeDefined();
  button!.click();
}

function expectPreserved(draft: ActiveWorkoutDraft) {
  const recovered = readActiveWorkoutDraft();
  expect(recovered).toMatchObject({
    startedAt: draft.startedAt,
    name: draft.name,
    workoutDate: draft.workoutDate,
    category: draft.category,
    notes: draft.notes,
    movements: draft.movements,
  });
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
  vi.mocked(api.listExercises).mockResolvedValue([bench, row]);
  vi.mocked(api.listWorkouts).mockResolvedValue([]);
  vi.mocked(api.listBodyMeasurements).mockResolvedValue([]);
  vi.mocked(api.listPersonalRecords).mockResolvedValue([]);
  vi.mocked(api.getWorkoutTypeColors).mockResolvedValue({
    upper: '#8b5cf6',
    lower: '#f59e0b',
    push: '#ef476f',
    pull: '#3b82f6',
    full_body: '#14b8a6',
    cardio: '#22c55e',
    other: '#94a3b8',
  });
  vi.mocked(api.listMachinePhotos).mockResolvedValue([]);
  vi.mocked(api.lastUsedMachinePhotos).mockResolvedValue([]);
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

describe('active workout recovery at startup', () => {
  it('restores every movement, set and note before the first draft write on a normal reload', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    await mount();
    expect(container.textContent).toContain('Bench press');
    expect(container.textContent).toContain('Cable row');
    expectPreserved(draft);
  });

  it('keeps the original draft while the catalogue request is delayed, then restores it', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    let resolveCatalogue!: (exercises: Exercise[]) => void;
    vi.mocked(api.listExercises).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCatalogue = resolve;
      }),
    );
    await mount();
    expect(container.querySelector('.workout-movements')).toBeNull();
    expect(readActiveWorkoutDraft()).toEqual(draft);
    await act(async () => resolveCatalogue([bench, row]));
    expect(container.textContent).toContain('Cable row');
    expectPreserved(draft);
  });

  it('preserves a failed startup draft and restores it through the retry control', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    vi.mocked(api.listExercises).mockRejectedValueOnce(new Error('Catalogue unavailable'));
    await mount();
    expect(container.textContent).toContain('Your saved workout is safe on this device');
    expect(container.textContent).toContain('Catalogue unavailable');
    expect(readActiveWorkoutDraft()).toEqual(draft);
    await act(async () => retry());
    expect(container.textContent).toContain('Bench press');
    expect(container.textContent).toContain('Cable row');
    expectPreserved(draft);
  });

  it('never writes a partial workout when one saved exercise is missing from the catalogue', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    vi.mocked(api.listExercises).mockResolvedValueOnce([bench]);
    await mount();
    expect(container.textContent).toContain(
      'Some exercises in your saved workout are not available',
    );
    expect(readActiveWorkoutDraft()).toEqual(draft);
    await act(async () => retry());
    expect(container.textContent).toContain('Cable row');
    expectPreserved(draft);
  });
});

describe('inactive workout suggestions', () => {
  function expiredSuggestions(completedFirst: boolean) {
    const draft = storedDraft();
    draft.startedAt = Date.now() - 3 * 60 * 60 * 1000 - 1000;
    draft.lastActiveAt = draft.startedAt;
    draft.updatedAt = draft.startedAt;
    draft.inactiveFinishAt = Date.now() - 1000;
    draft.movements = [
      {
        ...draft.movements[0],
        sets: [0, 1, 2].map((index) => ({
          ...draft.movements[0].sets[0],
          key: `set-${index}`,
          weight_kg: index === 0 ? 80 : 160,
          completed: completedFirst && index === 0,
          fromPrevious: !(completedFirst && index === 0),
        })),
      },
    ];
    return draft;
  }

  it('does not create a timed-out workout from untouched suggestions', async () => {
    const draft = expiredSuggestions(false);
    writeActiveWorkoutDraft(draft);
    await mount();
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(api.createWorkout).not.toHaveBeenCalled();
    expect(readActiveWorkoutDraft()?.movements).toEqual(draft.movements);
    expect(container.textContent).toContain('Sets0Reps0Vol kg0');
    expect(container.querySelectorAll('.pr-badge')).toHaveLength(0);
  });

  it('does not turn planned sets into performed sets when rest is edited', async () => {
    const draft = expiredSuggestions(false);
    writeActiveWorkoutDraft(draft);
    await mount();
    const rest = container.querySelector<HTMLSelectElement>('[aria-label="Rest after set 1"]')!;
    await act(async () => {
      rest.value = '120';
      rest.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const set = readActiveWorkoutDraft()!.movements[0].sets[0];
    expect(set.rest_seconds).toBe(120);
    expect(set.fromPrevious).toBe(true);
    expect(set.completed).toBe(false);
    expect(api.createWorkout).not.toHaveBeenCalled();
  });

  it('saves exactly one completed set alongside untouched suggestions at timeout', async () => {
    const draft = expiredSuggestions(true);
    writeActiveWorkoutDraft(draft);
    // Keep the response pending so the assertion observes the actual autosave payload.
    vi.mocked(api.createWorkout).mockReturnValueOnce(new Promise<TrackedWorkout>(() => {}));
    await mount();
    expect(api.createWorkout).toHaveBeenCalledOnce();
    const payload = vi.mocked(api.createWorkout).mock.calls[0][0] as WorkoutInput;
    const sets = payload.movements.flatMap((movement) => movement.sets);
    expect(sets.map((set) => set.completed)).toEqual([true, false, false]);
    const completed = sets.filter((set) => set.completed);
    expect(completed).toHaveLength(1);
    expect(completed.reduce((volume, set) => volume + set.reps! * set.weight_kg!, 0)).toBe(640);
    expect(sets.filter(isStrengthPrEligible)).toHaveLength(1);
    expect(sets[1].weight_kg).toBe(160);
    expect(sets[2].weight_kg).toBe(160);
  });
});
