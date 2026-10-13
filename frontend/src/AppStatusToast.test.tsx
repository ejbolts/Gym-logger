// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import { readActiveWorkoutDraft, writeActiveWorkoutDraft } from './workoutDraft';
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
    },
  };
});
vi.mock('./workoutCache', () => ({
  readDashboardCache: vi.fn().mockResolvedValue(null),
  writeDashboardCache: vi.fn().mockResolvedValue(undefined),
  readWorkoutCache: vi.fn().mockResolvedValue(null),
  writeWorkoutCache: vi.fn().mockResolvedValue(undefined),
}));

const AUTO_SAVED = 'Your inactive workout passed its time limit and was auto-saved.';
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
const dashboard = {
  workouts_this_week: 0,
  sets_this_week: 0,
  volume_this_week_kg: 0,
  current_streak: 0,
  cardio_minutes_this_week: 0,
  zone2: {
    week_start: '2026-10-12',
    week_end: '2026-10-18',
    goal_minutes: 150,
    completed_minutes: 0,
    remaining_minutes: 150,
    percentage: 0,
    complete: false,
  },
  weekly_sets: {
    week_start: '2026-10-12',
    week_end: '2026-10-18',
    raw_sets: 0,
    effective_sets: 0,
    unrated_sets: 0,
    low_rpe_sets: 0,
    rpe_logging_percent: 0,
    muscle_groups: [],
  },
  heatmap: [],
  recommendation: null,
} as unknown as DashboardData;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  window.localStorage.clear();
  window.localStorage.setItem('gym-logger-reduce-motion', 'reduced');
  window.history.replaceState(null, '', '#log');
  vi.mocked(api.dashboard).mockResolvedValue(dashboard);
  vi.mocked(api.listExercises).mockResolvedValue([bench]);
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

describe('inactive workout auto-save notice', () => {
  it('shows a persistent, non-blocking toast instead of a modal notification', async () => {
    const startedAt = Date.now() - 4 * 60 * 60 * 1000;
    writeActiveWorkoutDraft({
      version: 1,
      startedAt,
      updatedAt: startedAt,
      lastActiveAt: startedAt,
      inactiveFinishAt: Date.now() - 1000,
      name: 'Timed-out workout',
      workoutDate: '2026-10-13',
      category: 'push',
      notes: '',
      movements: [
        {
          key: 'movement-0',
          exerciseId: bench.id,
          notes: '',
          machinePhotoIds: [],
          supersetKey: null,
          isComplete: false,
          sets: [
            {
              ...createWorkoutSet('strength'),
              key: 'set-0',
              reps: 8,
              weight_kg: 80,
              completed: true,
            },
          ],
        },
      ],
    });
    vi.mocked(api.createWorkout).mockImplementation(
      async (payload) =>
        ({
          ...payload,
          id: 'saved-workout',
          is_sample: false,
          created_at: '2026-10-13T01:00:00Z',
          updated_at: '2026-10-13T01:00:00Z',
          movements: [],
        }) as unknown as TrackedWorkout,
    );

    await act(async () => root.render(<App />));
    await vi.waitFor(() => expect(api.createWorkout).toHaveBeenCalledOnce());
    await act(async () => undefined);

    const status = container.querySelector<HTMLElement>('.status-toast [role="status"]');
    await vi.waitFor(() => expect(status?.textContent).toBe(AUTO_SAVED));
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(container.querySelector('.status-toast-countdown')).toBeNull();
    expect(document.querySelector('dialog.notification-dialog')).toBeNull();
    expect(document.activeElement).toBe(document.body);
    expect(readActiveWorkoutDraft()).toBeNull();
    expect(container.querySelector('.app-tab-bar')).not.toBeNull();

    await act(async () =>
      container.querySelector<HTMLButtonElement>('.status-toast-close')!.click(),
    );
    expect(status?.textContent).toBe('');
  });
});
