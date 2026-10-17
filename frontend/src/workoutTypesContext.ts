import { createContext, useContext } from 'react';
import type { WorkoutType } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

export const WorkoutTypesContext = createContext<{
  types: WorkoutType[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  applySaved: (types: WorkoutType[]) => void;
}>({
  types: DEFAULT_WORKOUT_TYPES,
  loading: false,
  error: null,
  reload: async () => undefined,
  applySaved: () => undefined,
});

export const useWorkoutTypes = () => useContext(WorkoutTypesContext);
