import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import type { WorkoutType } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';
import { WorkoutTypesContext } from './workoutTypesContext';

export function WorkoutTypesProvider({ children }: { children: ReactNode }) {
  const [types, setTypes] = useState<WorkoutType[]>(DEFAULT_WORKOUT_TYPES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const saved = await api.getWorkoutTypes();
      if (version === requestVersion.current) setTypes(saved);
    } catch (reason) {
      if (version === requestVersion.current)
        setError(reason instanceof Error ? reason.message : 'Could not load workout types.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);
  const applySaved = useCallback((saved: WorkoutType[]) => {
    ++requestVersion.current;
    setTypes(saved);
    setLoading(false);
    setError(null);
  }, []);
  useEffect(() => {
    void reload();
    return () => {
      // Invalidate pending requests on unmount; this ref is a generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++requestVersion.current;
    };
  }, [reload]);
  const value = useMemo(
    () => ({ types, loading, error, reload, applySaved }),
    [types, loading, error, reload, applySaved],
  );
  return <WorkoutTypesContext.Provider value={value}>{children}</WorkoutTypesContext.Provider>;
}
