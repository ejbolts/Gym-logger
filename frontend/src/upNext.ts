import { useMemo } from 'react';
import { CATEGORY_LABELS, sessionTemplateFor } from './trainingSummary';
import { useWeightUnit } from './trainingPreferencesContext';
import type { TrackedWorkout, WorkoutRecommendation } from './types';
import { localDate } from './utils';
import { useWorkoutTypes } from './workoutTypesContext';

/**
 * The recommended next session shared by Home's Up next card and the Start menu: the
 * recommendation (unless its type was removed), its label and the last session to pre-fill from.
 */
export function useUpNextSession(
  recommendation: WorkoutRecommendation | null | undefined,
  workouts: TrackedWorkout[],
  today = localDate(),
) {
  const weightUnit = useWeightUnit();
  const { types } = useWorkoutTypes();
  const active = types.find((type) => type.id === recommendation?.category)?.archived
    ? null
    : (recommendation ?? null);
  const template = useMemo(
    () => (active ? sessionTemplateFor(workouts, active.category, today, weightUnit) : null),
    [active, today, workouts, weightUnit],
  );
  const label = active
    ? active.category === 'cardio'
      ? 'Cardio'
      : CATEGORY_LABELS[active.category]
    : null;
  return { recommendation: active, label, template };
}
