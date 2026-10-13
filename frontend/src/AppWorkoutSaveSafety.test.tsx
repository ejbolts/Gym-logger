// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api, WorkoutConflictError } from './api';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
import { readActiveWorkoutDraft, writeActiveWorkoutDraft } from './workoutDraft';
import type { ActiveWorkoutDraft } from './workoutDraft';
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
      getWorkoutTypeColors: vi.fn(),
      listMachinePhotos: vi.fn(),
      lastUsedMachinePhotos: vi.fn(),
      createWorkout: vi.fn(),
      updateWorkout: vi.fn(),
      getWorkout: vi.fn(),
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
const saved: TrackedWorkout = {
  id: 'saved-workout',
  name: 'Saved push',
  workout_date: '2026-10-13',
  category: 'push',
  notes: null,
  duration_minutes: 40,
  start_time: null,
  end_time: null,
  is_sample: false,
  revision: 3,
  created_at: '2026-10-13T01:00:00Z',
  updated_at: '2026-10-13T01:00:00Z',
  movements: [],
};
let root: Root;
let container: HTMLDivElement;

/** A draft whose inactivity limit has passed, so it is saved automatically on mount. */
function expiredDraft(overrides: Partial<ActiveWorkoutDraft> = {}): ActiveWorkoutDraft {
  const startedAt = Date.now() - 4 * 60 * 60 * 1000;
  return {
    version: 1,
    startedAt,
    updatedAt: startedAt,
    lastActiveAt: startedAt,
    inactiveFinishAt: Date.now() - 1000,
    name: 'Retried workout',
    workoutDate: '2026-10-13',
    category: 'push',
    notes: '',
    movements: [
      {
        key: 'movement',
        exerciseId: bench.id,
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        sets: [
          {
            ...createWorkoutSet('strength'),
            key: 'set',
            reps: 5,
            weight_kg: 100,
            completed: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

async function mount() {
  await act(async () => root.render(<App />));
}

async function remount() {
  await act(async () => root.unmount());
  root = createRoot(container);
  await mount();
}

function button(label: string) {
  const match = [...document.querySelectorAll('button')].find((item) => item.textContent === label);
  expect(match, label).toBeDefined();
  return match!;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  window.localStorage.clear();
  window.localStorage.setItem('gym-logger-reduce-motion', 'reduced');
  window.history.replaceState(null, '', '#log');
  vi.mocked(api.dashboard).mockResolvedValue({ recommendation: null } as unknown as DashboardData);
  vi.mocked(api.listExercises).mockResolvedValue([bench]);
  vi.mocked(api.listWorkouts).mockResolvedValue([saved]);
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

describe('retrying a new workout save', () => {
  it('sends one stored key with every attempt, including after a reload', async () => {
    writeActiveWorkoutDraft(expiredDraft());
    vi.mocked(api.createWorkout)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockReturnValue(new Promise<TrackedWorkout>(() => {}));

    // A draft stored before keys existed is given one when it is restored.
    await mount();
    const key = readActiveWorkoutDraft()?.clientRequestId;
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(container.textContent).toContain('Failed to fetch');

    await act(async () => window.dispatchEvent(new Event('focus')));
    await remount();

    const keys = vi.mocked(api.createWorkout).mock.calls.map(([body]) => body.client_request_id);
    expect(keys).toEqual([key, key, key]);
    expect(readActiveWorkoutDraft()?.clientRequestId).toBe(key);
    expect(api.updateWorkout).not.toHaveBeenCalled();
  });
});

describe('saving over changes from another device', () => {
  const latest: TrackedWorkout = { ...saved, name: 'Edited on phone', revision: 5 };

  async function conflictOnResume() {
    writeActiveWorkoutDraft(
      expiredDraft({ resumingWorkoutId: saved.id, resumingWorkoutRevision: 3 }),
    );
    vi.mocked(api.updateWorkout).mockRejectedValueOnce(
      new WorkoutConflictError('Changed elsewhere.', saved.id),
    );
    vi.mocked(api.getWorkout).mockResolvedValue(latest);
    await mount();
    expect(api.updateWorkout).toHaveBeenCalledOnce();
    const [id, body] = vi.mocked(api.updateWorkout).mock.calls[0];
    expect([id, body.base_revision, body.client_request_id]).toEqual([saved.id, 3, undefined]);
    expect(document.body.textContent).toContain('This workout was changed on another device');
    expect(document.body.textContent).toContain('“Edited on phone” was saved on another device');
  }

  it('keeps the local edits and saves them over the latest revision', async () => {
    await conflictOnResume();
    vi.mocked(api.updateWorkout).mockResolvedValueOnce({ ...latest, revision: 6 });
    await act(async () => button('Keep my version').click());

    expect(api.updateWorkout).toHaveBeenCalledTimes(2);
    const [id, body] = vi.mocked(api.updateWorkout).mock.calls[1];
    expect([id, body.base_revision, body.name]).toEqual([saved.id, 5, 'Retried workout']);
    expect(readActiveWorkoutDraft()).toBeNull();
  });

  it('discards the local edits only after confirming, then resumes the latest version', async () => {
    await conflictOnResume();
    await act(async () => button('Load latest version').click());
    expect(readActiveWorkoutDraft()?.name).toBe('Retried workout');
    await act(async () => button('Back').click());
    await act(async () => button('Load latest version').click());
    await act(async () => button('Discard my changes').click());

    expect(api.updateWorkout).toHaveBeenCalledOnce();
    const resumed = readActiveWorkoutDraft();
    expect(resumed).toMatchObject({
      name: 'Edited on phone',
      resumingWorkoutId: saved.id,
      resumingWorkoutRevision: 5,
    });
    expect(document.body.textContent).not.toContain('This workout was changed on another device');
  });
});
