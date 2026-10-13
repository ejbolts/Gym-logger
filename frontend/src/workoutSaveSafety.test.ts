import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, WorkoutConflictError } from './api';
import type { TrackedWorkout, WorkoutInput } from './types';
import { cachedWorkoutsForRevision } from './workoutCache';
import {
  ACTIVE_WORKOUT_DRAFT_KEY,
  createClientRequestId,
  readActiveWorkoutDraft,
  writeActiveWorkoutDraft,
  type ActiveWorkoutDraft,
  type DraftStorage,
} from './workoutDraft';
import { saveWorkoutResolvingConflicts, WORKOUT_CONFLICT_UNRESOLVED } from './workoutSave';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class MemoryStorage implements DraftStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const draft: ActiveWorkoutDraft = {
  version: 1,
  startedAt: Date.UTC(2026, 9, 13, 9),
  updatedAt: Date.UTC(2026, 9, 13, 9, 30),
  name: 'Push workout',
  workoutDate: '2026-10-13',
  category: 'push',
  notes: '',
  movements: [],
};

const payload: WorkoutInput = {
  name: 'Push workout',
  workout_date: '2026-10-13',
  category: 'push',
  notes: null,
  duration_minutes: 45,
  start_time: null,
  end_time: null,
  movements: [],
};

function workout(revision: number, name = 'Push workout'): TrackedWorkout {
  return {
    id: 'saved-workout',
    name,
    workout_date: '2026-10-13',
    category: 'push',
    notes: null,
    duration_minutes: 45,
    start_time: null,
    end_time: null,
    is_sample: false,
    revision,
    created_at: '2026-10-13T09:00:00Z',
    updated_at: '2026-10-13T09:00:00Z',
    movements: [],
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('workout save keys in the active draft', () => {
  it('stores the key and resumed revision with the draft across reloads', () => {
    const storage = new MemoryStorage();
    const key = createClientRequestId();
    writeActiveWorkoutDraft(
      { ...draft, clientRequestId: key, resumingWorkoutId: 'saved', resumingWorkoutRevision: 4 },
      storage,
    );
    expect(readActiveWorkoutDraft(storage)).toMatchObject({
      clientRequestId: key,
      resumingWorkoutRevision: 4,
    });
  });

  it('keeps a draft whose stored key or revision is unusable, dropping only that field', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      ACTIVE_WORKOUT_DRAFT_KEY,
      JSON.stringify({ ...draft, clientRequestId: 'not-a-key', resumingWorkoutRevision: 0 }),
    );
    expect(readActiveWorkoutDraft(storage)).toEqual(draft);
  });

  it('creates version 4 UUIDs even where randomUUID is unavailable', () => {
    expect(createClientRequestId()).toMatch(UUID);
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const fallback = createClientRequestId();
    expect(fallback).toMatch(UUID);
    expect(createClientRequestId()).not.toBe(fallback);
    vi.stubGlobal('crypto', undefined);
    expect(createClientRequestId()).toMatch(UUID);
  });
});

describe('workout cache revisions', () => {
  it('reloads a snapshot cached before workouts carried revisions', () => {
    const legacy = { ...workout(1), revision: undefined };
    expect(cachedWorkoutsForRevision({ revision: 'r', workouts: [legacy] }, 'r')).toBeNull();
    expect(cachedWorkoutsForRevision({ revision: 'r', workouts: [workout(2)] }, 'r')).toEqual([
      workout(2),
    ]);
  });
});

describe('workout save requests', () => {
  it('sends the key on create and applies a retried save to the workout already saved', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, workout(1)))
      .mockResolvedValueOnce(jsonResponse(200, workout(2, 'With a set added since')));
    vi.stubGlobal('fetch', fetchMock);
    const saved = await api.createWorkout({ ...payload, client_request_id: 'key-1' });

    expect(saved.revision).toBe(2);
    const [createPath, createInit] = fetchMock.mock.calls[0];
    expect(createPath).toBe('/api/workouts');
    expect(JSON.parse(createInit.body)).toMatchObject({ client_request_id: 'key-1' });
    const [updatePath, updateInit] = fetchMock.mock.calls[1];
    expect([updatePath, updateInit.method]).toEqual(['/api/workouts/saved-workout', 'PUT']);
    const body = JSON.parse(updateInit.body);
    expect(body.base_revision).toBe(1);
    expect(body).not.toHaveProperty('client_request_id');
  });

  it('returns a newly created workout without a second request', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(201, workout(1)));
    vi.stubGlobal('fetch', fetchMock);
    await api.createWorkout({ ...payload, client_request_id: 'key-1' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports a stale edit as a conflict for that workout', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(409, { error: { code: 'workout_conflict', message: 'Changed elsewhere.' } }),
        ),
    );
    const failure = api.updateWorkout('saved-workout', { ...payload, base_revision: 1 });
    await expect(failure).rejects.toBeInstanceOf(WorkoutConflictError);
    await expect(failure).rejects.toMatchObject({ workoutId: 'saved-workout', status: 409 });
  });
});

describe('resolving save conflicts', () => {
  function conflictThen(...results: Array<TrackedWorkout | Error>) {
    const update = vi.spyOn(api, 'updateWorkout');
    update.mockRejectedValueOnce(new WorkoutConflictError('Changed elsewhere.', 'saved-workout'));
    for (const result of results) {
      if (result instanceof Error) update.mockRejectedValueOnce(result);
      else update.mockResolvedValueOnce(result);
    }
    vi.spyOn(api, 'getWorkout').mockResolvedValue(workout(5, 'Edited on phone'));
    return update;
  }

  it('keeps the local version by saving it over the latest revision', async () => {
    const update = conflictThen(workout(6));
    const choose = vi.fn().mockResolvedValue('keep-mine');
    const outcome = await saveWorkoutResolvingConflicts(
      { ...payload, base_revision: 3 },
      'saved-workout',
      choose,
    );
    expect(choose).toHaveBeenCalledWith(workout(5, 'Edited on phone'));
    expect(outcome).toEqual({ status: 'saved', workout: workout(6) });
    expect(update.mock.calls.map(([, body]) => body.base_revision)).toEqual([3, 5]);
  });

  it('returns the latest version when local changes are discarded', async () => {
    const update = conflictThen();
    const outcome = await saveWorkoutResolvingConflicts(payload, 'saved-workout', async () =>
      Promise.resolve('load-latest' as const),
    );
    expect(outcome).toEqual({ status: 'discarded', workout: workout(5, 'Edited on phone') });
    expect(update).toHaveBeenCalledOnce();
  });

  it('keeps the edits unsaved when the dialog is dismissed', async () => {
    conflictThen();
    await expect(
      saveWorkoutResolvingConflicts(payload, 'saved-workout', async () =>
        Promise.resolve('cancel' as const),
      ),
    ).rejects.toThrow(WORKOUT_CONFLICT_UNRESOLVED);
  });

  it('creates a new workout with its key and does not prompt without a conflict', async () => {
    const create = vi.spyOn(api, 'createWorkout').mockResolvedValue(workout(1));
    const choose = vi.fn();
    const keyed = { ...payload, client_request_id: 'key-1' };
    await saveWorkoutResolvingConflicts(keyed, null, choose);
    expect(create).toHaveBeenCalledWith(keyed);
    expect(choose).not.toHaveBeenCalled();
  });
});
