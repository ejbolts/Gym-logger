import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compactExtrasLabel,
  compactLayout,
  compactLoggingPreferenceEnabled,
  compactMovementSummary,
  compactWorkoutProgress,
  currentMovementIndex,
  isMovementDone,
  movementUnitKeys,
  nextSetTarget,
  NO_COMPACT_OVERRIDES,
  overridesAfterSetInteraction,
  saveCompactLoggingPreference,
  toggleCompactMovement,
  type CompactMovement,
} from './compactWorkout';
import type { WorkoutSetInput } from './types';
import { createWorkoutSet } from './workoutSets';

function movement(
  key: string,
  completed: boolean[],
  options: { supersetKey?: string; isComplete?: boolean } = {},
): CompactMovement {
  return {
    key,
    supersetKey: options.supersetKey ?? null,
    isComplete: options.isComplete ?? false,
    sets: completed.map((done, index) => ({ key: `${key}-set-${index}`, completed: done })),
  };
}

function strengthSet(overrides: Partial<WorkoutSetInput>): WorkoutSetInput {
  return { ...createWorkoutSet('strength'), set_type: 'normal', warmup: false, ...overrides };
}

const bench = { name: 'Bench press', kind: 'strength' as const };

describe('compact logging preference', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('is off until the lifter opts in, then remembers the choice', () => {
    expect(compactLoggingPreferenceEnabled()).toBe(false);
    saveCompactLoggingPreference(true);
    expect(compactLoggingPreferenceEnabled()).toBe(true);
    saveCompactLoggingPreference(false);
    expect(compactLoggingPreferenceEnabled()).toBe(false);
  });

  it('falls back to the full layout when storage is unavailable', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(compactLoggingPreferenceEnabled()).toBe(false);
    expect(() => saveCompactLoggingPreference(true)).not.toThrow();
  });
});

describe('current exercise', () => {
  it('treats an exercise as done when every set is logged or it was finished early', () => {
    expect(isMovementDone(movement('a', [true, true]))).toBe(true);
    expect(isMovementDone(movement('a', [true, false]))).toBe(false);
    expect(isMovementDone(movement('a', [true, false], { isComplete: true }))).toBe(true);
    expect(isMovementDone(movement('a', []))).toBe(false);
  });

  it('is the first exercise with an unlogged set', () => {
    const movements = [
      movement('a', [true, true]),
      movement('b', [true, false]),
      movement('c', [false]),
    ];
    expect(currentMovementIndex(movements)).toBe(1);
  });

  it('follows the exercise the lifter last worked on while it still has sets left', () => {
    const movements = [
      movement('a', [false]),
      movement('b', [false]),
      movement('c', [true, false]),
    ];
    expect(currentMovementIndex(movements, 'c')).toBe(2);
    expect(currentMovementIndex([...movements.slice(0, 2), movement('c', [true])], 'c')).toBe(0);
  });

  it('keeps a superset current until every partner is finished', () => {
    const movements = [
      movement('a', [true]),
      movement('b', [true, true], { supersetKey: 'pair' }),
      movement('c', [true, false], { supersetKey: 'pair' }),
    ];
    expect(currentMovementIndex(movements, 'b')).toBe(2);
    expect(movementUnitKeys(movements, 'b')).toEqual(['b', 'c']);
    expect(movementUnitKeys(movements, 'a')).toEqual(['a']);
  });

  it('has no current exercise once everything is done', () => {
    expect(currentMovementIndex([movement('a', [true])])).toBe(-1);
    expect(currentMovementIndex([])).toBe(-1);
  });
});

describe('next set', () => {
  it('is the first unlogged set of the current exercise', () => {
    const movements = [movement('a', [true, false, false])];
    expect(nextSetTarget(movements, 0)).toEqual({ movementKey: 'a', setKey: 'a-set-1' });
    expect(nextSetTarget(movements, -1)).toBeNull();
  });

  it('alternates between superset partners', () => {
    const pair = { supersetKey: 'pair' };
    expect(
      nextSetTarget([movement('a', [true, false], pair), movement('b', [false, false], pair)], 0),
    ).toEqual({ movementKey: 'b', setKey: 'b-set-0' });
    expect(
      nextSetTarget([movement('a', [true, false], pair), movement('b', [true, false], pair)], 0),
    ).toEqual({ movementKey: 'a', setKey: 'a-set-1' });
  });
});

describe('compact layout', () => {
  const movements = [
    movement('done', [true, true]),
    movement('current', [true, false]),
    movement('next', [false, false]),
  ];

  it('opens only the current exercise and highlights its next set', () => {
    const layout = compactLayout(movements, null, NO_COMPACT_OVERRIDES);
    expect([...layout.expandedKeys]).toEqual(['current']);
    expect([...layout.currentKeys]).toEqual(['current']);
    expect(layout.nextSet).toEqual({ movementKey: 'current', setKey: 'current-set-1' });
  });

  it('opens and closes a whole superset together', () => {
    const pair = { supersetKey: 'pair' };
    const superset = [
      movement('a', [true]),
      movement('b', [false], pair),
      movement('c', [false], pair),
    ];
    const layout = compactLayout(superset, null, NO_COMPACT_OVERRIDES);
    expect([...layout.expandedKeys]).toEqual(['b', 'c']);
    const collapsed = toggleCompactMovement(superset, null, NO_COMPACT_OVERRIDES, 'c');
    expect([...compactLayout(superset, null, collapsed).expandedKeys]).toEqual([]);
  });

  it('lets the lifter expand a folded exercise until they move on', () => {
    const overrides = toggleCompactMovement(movements, null, NO_COMPACT_OVERRIDES, 'done');
    expect([...compactLayout(movements, null, overrides).expandedKeys]).toEqual([
      'done',
      'current',
    ]);

    // Finishing the current exercise tidies the layout: only the new current one stays open.
    const finished = [movements[0], movement('current', [true, true]), movements[2]];
    expect([...compactLayout(finished, 'current', overrides).expandedKeys]).toEqual(['next']);
  });

  it('keeps the previous exercise open when the lifter jumps ahead', () => {
    const opened = toggleCompactMovement(movements, null, NO_COMPACT_OVERRIDES, 'next');
    const afterJump = overridesAfterSetInteraction(movements, null, opened, 'next');
    const layout = compactLayout(movements, 'next', afterJump);
    expect([...layout.currentKeys]).toEqual(['next']);
    expect([...layout.expandedKeys]).toEqual(['current', 'next']);
  });

  it('leaves choices alone when the lifter keeps working on the current exercise', () => {
    const overrides = toggleCompactMovement(movements, null, NO_COMPACT_OVERRIDES, 'done');
    expect(overridesAfterSetInteraction(movements, null, overrides, 'current')).toBe(overrides);
    expect(overridesAfterSetInteraction(movements, null, overrides, 'done')).toBe(overrides);
  });

  it('folds every exercise once the workout is complete', () => {
    const done = [movement('a', [true]), movement('b', [true])];
    const layout = compactLayout(done, 'b', NO_COMPACT_OVERRIDES);
    expect(layout.expandedKeys.size).toBe(0);
    expect(layout.nextSet).toBeNull();
  });
});

describe('compact summaries', () => {
  it('shows progress and the best working set of a finished exercise', () => {
    const summary = compactMovementSummary(
      {
        exercise: bench,
        isComplete: false,
        supersetKey: null,
        sets: [
          strengthSet({
            weight_kg: 120,
            reps: 3,
            set_type: 'warmup',
            warmup: true,
            completed: true,
          }),
          strengthSet({ weight_kg: 100, reps: 5, completed: true }),
          strengthSet({ weight_kg: 100, reps: 6, completed: true }),
          strengthSet({ weight_kg: 90, reps: 8, completed: true }),
        ],
      },
      'kg',
    );
    expect(summary).toEqual({
      status: 'done',
      progress: '4/4 sets',
      detail: 'Best 100 kg × 6',
      label: 'Bench press, 4 of 4 sets done, Best 100 kg × 6',
    });
  });

  it('uses the preferred weight unit', () => {
    const summary = compactMovementSummary(
      {
        exercise: bench,
        isComplete: false,
        supersetKey: 'pair',
        sets: [strengthSet({ weight_kg: 100, reps: 5, completed: true }), strengthSet({})],
      },
      'lb',
    );
    expect(summary.status).toBe('in-progress');
    expect(summary.progress).toBe('1/2 sets');
    expect(summary.detail).toBe('Best 220.46 lb × 5');
    expect(summary.label).toBe('Bench press, superset, 1 of 2 sets done, Best 220.46 lb × 5');
  });

  it('shows the planned set count before an exercise starts', () => {
    const summary = compactMovementSummary(
      {
        exercise: bench,
        isComplete: false,
        supersetKey: null,
        sets: [strengthSet({ weight_kg: 100, reps: 5 }), strengthSet({}), strengthSet({})],
      },
      'kg',
    );
    expect(summary).toMatchObject({ status: 'upcoming', progress: '3 sets planned', detail: null });
    expect(summary.label).toBe('Bench press, 3 sets planned');
  });

  it('summarises bodyweight and cardio work', () => {
    expect(
      compactMovementSummary(
        {
          exercise: { name: 'Pull-up', kind: 'strength' },
          isComplete: true,
          supersetKey: null,
          sets: [strengthSet({ reps: 12, completed: true }), strengthSet({ reps: 9 })],
        },
        'kg',
      ),
    ).toMatchObject({ status: 'done', progress: '1/2 sets', detail: 'Best 12 reps' });
    expect(
      compactMovementSummary(
        {
          exercise: { name: 'Treadmill', kind: 'cardio' },
          isComplete: false,
          supersetKey: null,
          sets: [
            {
              ...createWorkoutSet('cardio'),
              duration_seconds: 1800,
              distance_km: 5.25,
              completed: true,
            },
          ],
        },
        'kg',
      ),
    ).toMatchObject({ status: 'done', progress: '1/1 set', detail: '30 min · 5.25 km' });
  });

  it('describes what the More disclosure holds', () => {
    expect(compactExtrasLabel({ kind: 'strength', photoCount: 0, hasNote: false })).toBe(
      'Photos · rest · notes',
    );
    expect(compactExtrasLabel({ kind: 'strength', photoCount: 2, hasNote: true })).toBe(
      '2 photos · rest · note added',
    );
    expect(compactExtrasLabel({ kind: 'cardio', photoCount: 0, hasNote: false })).toBe('Notes');
  });

  it('counts finished exercises', () => {
    expect(compactWorkoutProgress([movement('a', [true]), movement('b', [false])])).toBe(
      '1 of 2 exercises done',
    );
    expect(compactWorkoutProgress([movement('a', [false])])).toBe('0 of 1 exercise done');
  });
});
