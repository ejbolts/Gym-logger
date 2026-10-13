import { describe, expect, it } from 'vitest';
import { createWorkoutSet } from './workoutSets';
import {
  isWorkoutSetAutoSavable,
  workoutSetAfterEdit,
  workoutSetForAutoSave,
} from './workoutAutoSave';

describe('automatic workout saving', () => {
  it('does not save an untouched empty set', () => {
    expect(isWorkoutSetAutoSavable('strength', createWorkoutSet('strength'))).toBe(false);
    expect(isWorkoutSetAutoSavable('cardio', createWorkoutSet('cardio'))).toBe(false);
  });

  it('completes entered cardio data before automatically saving', () => {
    const set = { ...createWorkoutSet('cardio'), duration_seconds: 3720, distance_km: 4.77 };

    expect(isWorkoutSetAutoSavable('cardio', set)).toBe(true);
    expect(workoutSetForAutoSave('cardio', set).completed).toBe(true);
  });

  it('completes entered strength data before automatically saving', () => {
    const set = { ...createWorkoutSet('strength'), reps: 8, weight_kg: 80 };

    expect(isWorkoutSetAutoSavable('strength', set)).toBe(true);
    expect(workoutSetForAutoSave('strength', set).completed).toBe(true);
  });

  it('keeps untouched previous-set suggestions incomplete when the workout times out', () => {
    const set = {
      ...createWorkoutSet('strength'),
      reps: 8,
      weight_kg: 80,
      fromPrevious: true,
    };

    expect(isWorkoutSetAutoSavable('strength', set)).toBe(false);
    expect(workoutSetForAutoSave('strength', set)).toBe(set);
    expect(workoutSetForAutoSave('strength', set).completed).toBe(false);
  });

  it('does not treat suggested cardio metrics as performed activity', () => {
    const set = {
      ...createWorkoutSet('cardio'),
      duration_seconds: 1800,
      distance_km: 5,
      calories_kcal: 300,
      fromPrevious: true,
    };
    expect(isWorkoutSetAutoSavable('cardio', set)).toBe(false);
    expect(workoutSetForAutoSave('cardio', set).completed).toBe(false);
  });

  it('counts exactly the logged set when suggestions remain in a timed-out workout', () => {
    const suggestion = {
      ...createWorkoutSet('strength'),
      reps: 8,
      weight_kg: 80,
      fromPrevious: true,
    };
    const sets = [
      { ...suggestion, completed: true, fromPrevious: false },
      suggestion,
      suggestion,
    ].map((set) => workoutSetForAutoSave('strength', set));
    const completed = sets.filter((set) => set.completed);
    expect(completed).toHaveLength(1);
    expect(completed.reduce((volume, set) => volume + set.reps! * set.weight_kg!, 0)).toBe(640);
    expect(sets[1]).toEqual(suggestion);
    expect(sets[2]).toEqual(suggestion);
  });

  it('preserves intentionally entered unchecked fields after a suggestion is edited', () => {
    const suggestion = {
      ...createWorkoutSet('strength'),
      reps: 8,
      weight_kg: 80,
      fromPrevious: true,
    };
    const entered = workoutSetAfterEdit(suggestion, {
      reps: 7,
      weight_kg: 82.5,
      notes: 'Actual reps entered before leaving',
    });
    expect(entered.fromPrevious).toBe(false);
    expect(workoutSetForAutoSave('strength', entered)).toEqual({ ...entered, completed: true });
  });

  it('keeps suggestions incomplete when only their notes, rest, RPE or set type changes', () => {
    const suggestion = {
      ...createWorkoutSet('strength'),
      reps: 8,
      weight_kg: 80,
      fromPrevious: true,
    };
    const planned = workoutSetAfterEdit(suggestion, {
      notes: 'Try pause reps',
      rest_seconds: 120,
      rpe: 8,
      set_type: 'normal',
      warmup: false,
    });
    expect(planned.fromPrevious).toBe(true);
    expect(isWorkoutSetAutoSavable('strength', planned)).toBe(false);
    expect(workoutSetForAutoSave('strength', planned)).toBe(planned);
  });
});
