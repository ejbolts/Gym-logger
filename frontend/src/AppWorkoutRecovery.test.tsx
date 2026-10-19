// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { BEFORE_APP_REFRESH_EVENT } from './appUpdates';
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
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('rest time controls', () => {
  function restControl() {
    return (
      container
        .querySelector('.movement-card')
        ?.querySelector<HTMLSelectElement>('[aria-label="Rest after set 1"]') ?? null
    );
  }

  async function click(label: string) {
    const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
    expect(button).not.toBeNull();
    await act(async () => button!.click());
  }

  async function choose(label: string, value: string) {
    const select = container.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
    await act(async () => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  it('removes only a rest, offers Undo, persists removal and restores it only on a saved edit', async () => {
    vi.useFakeTimers();
    writeActiveWorkoutDraft(storedDraft());
    await mount();
    expect(restControl()?.value).toBe('180');
    await click('Remove rest after set 1');
    expect(restControl()).toBeNull();
    expect(container.querySelector('.undo-toast')?.textContent).toContain('Rest time removed');
    expect(container.querySelectorAll('.set-details')).toHaveLength(2);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.undo-toast-action')!.click(),
    );
    expect(restControl()?.value).toBe('180');
    await choose('Rest after set 1', '0');
    expect(restControl()).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(container.querySelector('.undo-toast')).toBeNull();
    expect(readActiveWorkoutDraft()?.movements[0].sets[0].rest_seconds).toBeNull();
    // Reload the app to prove no default rest row is recreated from the saved draft.
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount();
    expect(restControl()).toBeNull();
    await click('Options for set 1');
    const edit = [
      ...container.querySelectorAll<HTMLButtonElement>('.set-actions-menu-popover button'),
    ].find((button) => button.textContent?.includes('Edit set'))!;
    await act(async () => edit.click());
    await choose('Rest time for set 1', '30');
    expect(restControl()).toBeNull();
    await click('Done editing set 1');
    expect(restControl()?.value).toBe('30');
    expect(container.querySelector('[role="timer"]')).toBeNull();
    await click('Options for set 1');
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>('.set-actions-menu-popover button')]
        .find((button) => button.textContent?.includes('Edit set'))!
        .click(),
    );
    await choose('Rest time for set 1', '0');
    await click('Done editing set 1');
    expect(restControl()).toBeNull();
    expect(container.querySelector('.undo-toast')?.textContent).toContain('Rest time removed');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.undo-toast-action')!.click(),
    );
    expect(restControl()?.value).toBe('30');
  });

  it('hides rest rows without removing saved durations or disabling the countdown', async () => {
    window.localStorage.setItem('gym-logger-show-rest-times', 'disabled');
    const draft = storedDraft();
    draft.movements[0].sets[0].completed = false;
    writeActiveWorkoutDraft(draft);
    await mount();
    expect(restControl()).toBeNull();
    await click('Complete set 1');
    expect(container.querySelector('[role="timer"]')).not.toBeNull();
    expect(readActiveWorkoutDraft()?.movements[0].sets[0].rest_seconds).toBe(180);
  });

  it('keeps cancelled swipes and removes rest with a completed touch swipe and Undo', async () => {
    vi.useFakeTimers();
    writeActiveWorkoutDraft(storedDraft());
    await mount();
    const shell = restControl()!.closest<HTMLElement>('.set-swipe-shell')!;
    shell.setPointerCapture = vi.fn();
    shell.hasPointerCapture = vi.fn().mockReturnValue(false);
    async function swipe(x: number, y = 0) {
      await act(async () => {
        for (const [type, clientX, clientY] of [
          ['pointerdown', 220, 10],
          ['pointermove', 220 + x, 10 + y],
          ['pointerup', 220 + x, 10 + y],
        ] as const) {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.assign(event, {
            pointerId: 1,
            isPrimary: true,
            pointerType: 'touch',
            clientX,
            clientY,
          });
          shell.dispatchEvent(event);
        }
      });
      await act(async () => vi.advanceTimersByTimeAsync(300));
    }
    await swipe(-30);
    expect(restControl()).not.toBeNull();
    await swipe(-120, 180);
    expect(restControl()).not.toBeNull();
    await swipe(-160);
    expect(restControl()).toBeNull();
    expect(container.querySelectorAll('.set-details')).toHaveLength(2);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.undo-toast-action')!.click(),
    );
    expect(restControl()?.value).toBe('180');
  });
});

describe('active workout recovery at startup', () => {
  it('flushes the live draft before an update and blocks refresh if device storage fails', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    await mount();
    const refresh = new Event(BEFORE_APP_REFRESH_EVENT, { cancelable: true });
    expect(window.dispatchEvent(refresh)).toBe(true);
    expectPreserved(draft);
    const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('device storage is full');
    });
    const blocked = new Event(BEFORE_APP_REFRESH_EVENT, { cancelable: true });
    expect(window.dispatchEvent(blocked)).toBe(false);
    expectPreserved(draft);
    save.mockRestore();
    expect(window.dispatchEvent(new Event(BEFORE_APP_REFRESH_EVENT, { cancelable: true }))).toBe(
      true,
    );
  });

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

describe('finishing workouts in the background', () => {
  async function confirmFinish() {
    const finish = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Finish workout',
    )!;
    await act(async () => finish.click());
    const confirm = document.querySelector<HTMLButtonElement>(
      '.workout-finish-dialog .popup-primary-action',
    )!;
    await act(async () => confirm.click());
  }

  it('returns to Today before the server responds, preserves recovery, and does not interrupt later navigation', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    let finishSave!: (workout: TrackedWorkout) => void;
    vi.mocked(api.createWorkout).mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    await mount();
    await confirmFinish();
    expect(api.createWorkout).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('#dashboard');
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Saving workout"]')?.disabled,
    ).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('.live-workout-card')?.disabled).toBe(true);
    expect(container.querySelector('.live-workout-card')?.textContent).toContain(
      'Workout finished',
    );
    expect(container.querySelector('.background-activity-bar')?.textContent).toContain(
      'Saving workout',
    );
    expectPreserved(draft);
    expect(window.dispatchEvent(new Event(BEFORE_APP_REFRESH_EVENT, { cancelable: true }))).toBe(
      false,
    );

    const history =
      container.querySelector<HTMLButtonElement>('[data-tab="history"]') ??
      [...container.querySelectorAll('button')].find((button) => button.textContent === 'History')!;
    await act(async () => history.click());
    expect(window.location.hash).toBe('#history');
    await act(async () =>
      finishSave({
        ...vi.mocked(api.createWorkout).mock.calls[0][0],
        id: 'finished-workout',
        movements: [],
        is_sample: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    );
    expect(window.location.hash).toBe('#history');
    expect(readActiveWorkoutDraft()).toBeNull();
    expect(container.querySelector('.background-activity-bar')).toBeNull();
  });

  it('recovers the logger and all draft data after a failed background save, allowing a retry', async () => {
    const draft = storedDraft();
    writeActiveWorkoutDraft(draft);
    let failSave!: (error: Error) => void;
    vi.mocked(api.createWorkout).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        failSave = reject;
      }),
    );
    await mount();
    await confirmFinish();
    expect(window.location.hash).toBe('#dashboard');
    await act(async () => failSave(new Error('Server unavailable; try again.')));
    expect(window.location.hash).toBe('#log');
    expect(container.textContent).toContain('Server unavailable; try again.');
    expectPreserved(draft);
    expect(container.querySelector('.background-activity-bar')).toBeNull();
    vi.mocked(api.createWorkout).mockReturnValueOnce(new Promise(() => {}));
    await confirmFinish();
    expect(api.createWorkout).toHaveBeenCalledTimes(2);
    expect(window.location.hash).toBe('#dashboard');
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
    expect(window.location.hash).toBe('#dashboard');
    // An update cannot reload while the server save is still awaiting its response.
    expect(window.dispatchEvent(new Event(BEFORE_APP_REFRESH_EVENT, { cancelable: true }))).toBe(
      false,
    );
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

  it('does not auto-complete an untouched extra set copied with Add set', async () => {
    const draft = storedDraft();
    draft.movements = [draft.movements[0]];
    writeActiveWorkoutDraft(draft);
    await mount();
    const addSet = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Add set'),
    )!;
    await act(async () => addSet.click());
    expect(readActiveWorkoutDraft()!.movements[0].sets[1].fromPrevious).toBe(true);
    vi.mocked(api.createWorkout).mockReturnValueOnce(new Promise<TrackedWorkout>(() => {}));
    vi.spyOn(Date, 'now').mockReturnValue(draft.inactiveFinishAt! + 1000);
    await act(async () => window.dispatchEvent(new Event('focus')));
    const payload = vi.mocked(api.createWorkout).mock.calls[0][0] as WorkoutInput;
    expect(payload.movements[0].sets.map((set) => set.completed)).toEqual([true, false]);
  });

  it('keeps saved incomplete suggestions unchecked after History resume and timeout', async () => {
    window.history.replaceState(null, '', '#history');
    const saved: TrackedWorkout = {
      id: 'saved-workout',
      name: 'Workout with planned sets',
      workout_date: '2026-10-13',
      category: 'push',
      notes: 'Workout notes survive',
      duration_minutes: 45,
      start_time: null,
      end_time: null,
      is_sample: false,
      created_at: '2026-10-13T01:00:00Z',
      updated_at: '2026-10-13T01:00:00Z',
      movements: [
        {
          id: 'saved-movement',
          order_index: 0,
          exercise: bench,
          notes: 'Movement notes survive',
          machine_photos: [],
          superset_group_id: null,
          superset_name: null,
          sets: [0, 1, 2].map((index) => ({
            id: `saved-set-${index}`,
            order_index: index,
            reps: 8,
            weight_kg: index === 0 ? 80 : 160,
            rpe: 8,
            rest_seconds: 180,
            duration_seconds: null,
            distance_km: null,
            incline_percent: null,
            speed_kph: null,
            bodyweight_kg: null,
            percentile: null,
            warmup: false,
            set_type: 'normal',
            failed: false,
            target_reps: null,
            notes: `Saved set ${index}`,
            completed: index === 0,
          })),
        },
      ],
    };
    vi.mocked(api.listWorkouts).mockResolvedValue([saved]);
    vi.mocked(api.updateWorkout).mockReturnValueOnce(new Promise<TrackedWorkout>(() => {}));
    await mount();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.history-card-summary')!.click(),
    );
    const resume = container.querySelector<HTMLButtonElement>('.resume-workout-button')!;
    expect(resume.textContent).toBe('Resume from now');
    await act(async () => resume.click());
    const resumed = readActiveWorkoutDraft()!;
    expect(resumed.resumingWorkoutId).toBe(saved.id);
    expect(resumed.movements[0].sets.map((set) => set.completed)).toEqual([true, false, false]);
    expect(resumed.movements[0].sets.map((set) => set.fromPrevious)).toEqual([false, true, true]);
    vi.spyOn(Date, 'now').mockReturnValue(resumed.inactiveFinishAt! + 1000);
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(api.updateWorkout).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('#dashboard');
    expect(api.createWorkout).not.toHaveBeenCalled();
    const [id, payload] = vi.mocked(api.updateWorkout).mock.calls[0];
    expect(id).toBe(saved.id);
    const sets = payload.movements[0].sets;
    expect(sets.map((set) => set.completed)).toEqual([true, false, false]);
    expect(sets.filter(isStrengthPrEligible)).toHaveLength(1);
    expect(
      sets
        .filter((set) => set.completed)
        .reduce((volume, set) => volume + set.reps! * set.weight_kg!, 0),
    ).toBe(640);
    expect(sets.map((set) => set.notes)).toEqual(saved.movements[0].sets.map((set) => set.notes));
  });
});
