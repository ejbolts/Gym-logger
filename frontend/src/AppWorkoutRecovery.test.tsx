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

describe('vertical set dragging in a workout', () => {
  async function dragFixture() {
    const draft = storedDraft();
    draft.movements = [
      {
        ...draft.movements[0],
        sets: [0, 1, 2].map((index) => ({
          ...draft.movements[0].sets[0],
          key: `drag-${index}`,
          weight_kg: 80 + index * 10,
          notes: `Notes ${index}`,
          rest_seconds: 120 + index * 30,
          completed: index === 0,
          fromPrevious: index !== 0,
        })),
      },
    ];
    writeActiveWorkoutDraft(draft);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    await mount();
    const rows = [...container.querySelectorAll<HTMLElement>('.set-swipe-shell')];
    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => ({
        top: 200 + index * 100 - window.scrollY,
        bottom: 260 + index * 100 - window.scrollY,
        left: 10,
        right: 370,
        width: 360,
        height: 60,
        x: 10,
        y: 200 + index * 100 - window.scrollY,
        toJSON: () => ({}),
      }));
    });
    const handle = rows[0].querySelector<HTMLButtonElement>('.set-drag-handle')!;
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn().mockReturnValue(true);
    handle.releasePointerCapture = vi.fn();
    return { rows, handle, sets: draft.movements[0].sets };
  }

  async function pointer(
    handle: HTMLElement,
    type: string,
    y: number,
    pointerType = 'mouse',
    x = 340,
    pointerId = 1,
  ) {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperties(event, {
      pointerId: { value: pointerId },
      pointerType: { value: pointerType },
      isPrimary: { value: true },
    });
    await act(async () => handle.dispatchEvent(event));
  }

  it.each(['mouse', 'touch'])(
    'follows %s vertically and preserves whole sets on drop',
    async (kind) => {
      const { rows, handle, sets } = await dragFixture();
      await pointer(handle, 'pointerdown', 230, kind);
      await pointer(handle, 'pointermove', 430, kind, 700);
      expect(rows[0].style.getPropertyValue('--set-drag-y')).toBe('200px');
      expect(rows[0].dataset.setReordering).toBe('true');
      expect(rows[2].querySelector('.set-drop-target')).not.toBeNull();
      // The order changes only on drop, and sideways drift doesn't change the target.
      expect(readActiveWorkoutDraft()!.movements[0].sets).toEqual(sets);
      await pointer(handle, 'pointerup', 430, kind, 700);
      expect(readActiveWorkoutDraft()!.movements[0].sets).toEqual([sets[1], sets[2], sets[0]]);
      expect(rows[0].dataset.setReordering).toBeUndefined();
      expect(rows[0].style.getPropertyValue('--set-drag-y')).toBe('');
      expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
    },
  );

  it.each(['pointercancel', 'lostpointercapture', 'Escape'])(
    'cancels on %s without changing sets',
    async (type) => {
      const { rows, handle, sets } = await dragFixture();
      await pointer(handle, 'pointerdown', 230, 'touch');
      await pointer(handle, 'pointermove', 430, 'touch');
      if (type === 'Escape') {
        await act(async () =>
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
        );
      } else await pointer(handle, type, 430, 'touch');
      expect(readActiveWorkoutDraft()!.movements[0].sets).toEqual(sets);
      expect(rows[0].dataset.setReordering).toBeUndefined();
      expect(rows[0].style.getPropertyValue('--set-drag-y')).toBe('');
      expect(container.querySelector('.set-drop-target')).toBeNull();
    },
  );

  it('ignores other fingers and keeps the held row aligned while the edge scrolls', async () => {
    const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')!;
    try {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
      const { rows, handle } = await dragFixture();
      let nextFrame!: FrameRequestCallback;
      vi.mocked(window.requestAnimationFrame).mockImplementation((frame) => {
        nextFrame = frame;
        return 1;
      });
      vi.spyOn(window, 'scrollBy').mockImplementation((_x, y) => {
        Object.defineProperty(window, 'scrollY', {
          configurable: true,
          value: window.scrollY + Number(y),
        });
      });
      await pointer(handle, 'pointerdown', 230, 'touch');
      await pointer(handle, 'pointermove', 430, 'touch', 340, 2);
      expect(rows[0].style.getPropertyValue('--set-drag-y')).toBe('0px');
      const heldY = window.innerHeight - 40;
      await pointer(handle, 'pointermove', heldY, 'touch');
      await act(async () => nextFrame(16));
      await act(async () => nextFrame(32));
      expect(window.scrollY).toBe(24);
      expect(rows[0].style.getPropertyValue('--set-drag-y')).toBe(`${heldY - 230 + 24}px`);
      await pointer(handle, 'pointercancel', heldY, 'touch');
    } finally {
      Object.defineProperty(window, 'scrollY', originalScrollY);
    }
  });
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
