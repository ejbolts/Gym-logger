import type { Exercise, WorkoutSetInput } from './types';
import { formatWeight, type WeightUnit } from './weightUnits';
import { isCompletedWorkingSet } from './workoutSets';

const COMPACT_LOGGING_PREFERENCE_KEY = 'gym-logger-compact-logging';

/** Compact logging is opt-in; the full exercise cards stay the default layout. */
export function compactLoggingPreferenceEnabled(): boolean {
  try {
    return window.localStorage.getItem(COMPACT_LOGGING_PREFERENCE_KEY) === 'enabled';
  } catch {
    return false;
  }
}

export function saveCompactLoggingPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(COMPACT_LOGGING_PREFERENCE_KEY, enabled ? 'enabled' : 'disabled');
  } catch {
    // Keep the in-memory setting usable if browser storage is unavailable.
  }
}

type ProgressFields = { isComplete: boolean; sets: ReadonlyArray<{ completed: boolean }> };

export type CompactMovement = {
  key: string;
  supersetKey: string | null;
  isComplete: boolean;
  sets: ReadonlyArray<{ key: string; completed: boolean }>;
};

/** Finished means every set is logged, or the lifter marked the exercise finished early. */
export function isMovementDone(movement: ProgressFields): boolean {
  return (
    movement.isComplete ||
    (movement.sets.length > 0 && movement.sets.every((item) => item.completed))
  );
}

function unitMembers<T extends CompactMovement>(movements: readonly T[], movement: T): T[] {
  return movement.supersetKey
    ? movements.filter((item) => item.supersetKey === movement.supersetKey)
    : [movement];
}

/** A superset is logged as one unit; any other exercise is a unit of one. */
export function movementUnitKeys(movements: readonly CompactMovement[], key: string): string[] {
  const movement = movements.find((item) => item.key === key);
  return movement ? unitMembers(movements, movement).map((item) => item.key) : [];
}

/**
 * The exercise being logged: the one the lifter last worked on while it (or its superset) still
 * has sets left, otherwise the first exercise with an unlogged set. -1 when everything is done.
 */
export function currentMovementIndex(
  movements: readonly CompactMovement[],
  preferredKey: string | null = null,
): number {
  const preferred = movements.find((item) => item.key === preferredKey);
  if (preferred) {
    const unfinished = unitMembers(movements, preferred).find((item) => !isMovementDone(item));
    if (unfinished) return movements.indexOf(unfinished);
  }
  return movements.findIndex((item) => !isMovementDone(item));
}

const NO_CURRENT = 'none';

function unitContext(movement: CompactMovement | undefined): string {
  if (!movement) return NO_CURRENT;
  return movement.supersetKey ? `superset:${movement.supersetKey}` : `movement:${movement.key}`;
}

export interface CompactSetTarget {
  movementKey: string;
  setKey: string;
}

/** In a superset the sets alternate: the partner with the fewest logged sets goes next. */
export function nextSetTarget(
  movements: readonly CompactMovement[],
  currentIndex: number,
): CompactSetTarget | null {
  const current = movements[currentIndex];
  if (!current) return null;
  let next: { movement: CompactMovement; logged: number } | null = null;
  for (const movement of unitMembers(movements, current)) {
    if (isMovementDone(movement) || !movement.sets.some((item) => !item.completed)) continue;
    const logged = movement.sets.filter((item) => item.completed).length;
    if (!next || logged < next.logged) next = { movement, logged };
  }
  const set = next?.movement.sets.find((item) => !item.completed);
  return next && set ? { movementKey: next.movement.key, setKey: set.key } : null;
}

/**
 * Manual expand/collapse choices. They belong to the current exercise (`context`) and lapse when
 * the lifter moves on, so the layout tidies itself after each finished exercise.
 */
export interface CompactOverrides {
  context: string;
  expanded: Readonly<Record<string, boolean>>;
}

export const NO_COMPACT_OVERRIDES: CompactOverrides = { context: NO_CURRENT, expanded: {} };

export interface CompactLayout {
  context: string;
  currentKeys: ReadonlySet<string>;
  expandedKeys: ReadonlySet<string>;
  nextSet: CompactSetTarget | null;
}

/** Which cards are open in compact mode. Presentation only: the draft is never changed. */
export function compactLayout(
  movements: readonly CompactMovement[],
  preferredKey: string | null,
  overrides: CompactOverrides,
): CompactLayout {
  const index = currentMovementIndex(movements, preferredKey);
  const current = movements[index];
  const context = unitContext(current);
  const currentKeys = new Set(current ? movementUnitKeys(movements, current.key) : []);
  const choices = overrides.context === context ? overrides.expanded : {};
  const expandedKeys = new Set(
    movements
      .filter((movement) => choices[movement.key] ?? currentKeys.has(movement.key))
      .map((movement) => movement.key),
  );
  return { context, currentKeys, expandedKeys, nextSet: nextSetTarget(movements, index) };
}

/** Tapping a summary row or a collapse control opens or closes the whole superset together. */
export function toggleCompactMovement(
  movements: readonly CompactMovement[],
  preferredKey: string | null,
  overrides: CompactOverrides,
  key: string,
): CompactOverrides {
  const layout = compactLayout(movements, preferredKey, overrides);
  const expanded = !layout.expandedKeys.has(key);
  const choices = overrides.context === layout.context ? { ...overrides.expanded } : {};
  movementUnitKeys(movements, key).forEach((unitKey) => {
    choices[unitKey] = expanded;
  });
  return { context: layout.context, expanded: choices };
}

/**
 * Working on a different exercise makes it current. Keep every other card as it was, so nothing
 * collapses above the lifter's finger mid-set; the layout tidies when that exercise is finished.
 */
export function overridesAfterSetInteraction(
  movements: readonly CompactMovement[],
  preferredKey: string | null,
  overrides: CompactOverrides,
  key: string,
): CompactOverrides {
  const before = compactLayout(movements, preferredKey, overrides);
  const afterIndex = currentMovementIndex(movements, key);
  const after = unitContext(movements[afterIndex]);
  if (before.context === NO_CURRENT || after === before.context || afterIndex < 0) {
    return overrides;
  }
  const afterKeys = new Set(movementUnitKeys(movements, movements[afterIndex].key));
  return {
    context: after,
    expanded: Object.fromEntries(
      movements.map((movement) => [
        movement.key,
        afterKeys.has(movement.key) || before.expandedKeys.has(movement.key),
      ]),
    ),
  };
}

export type CompactMovementStatus = 'done' | 'in-progress' | 'upcoming';

export interface CompactMovementSummary {
  status: CompactMovementStatus;
  /** “3/3 sets” once started, otherwise “3 sets planned”. */
  progress: string;
  /** Best strength set or cardio totals, when anything has been logged. */
  detail: string | null;
  /** Descriptive accessible name for the summary row. */
  label: string;
}

type SummaryMovement = {
  isComplete: boolean;
  supersetKey: string | null;
  exercise: Pick<Exercise, 'name' | 'kind'>;
  sets: readonly WorkoutSetInput[];
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function bestStrengthSet(sets: readonly WorkoutSetInput[], unit: WeightUnit): string | null {
  const working = sets.filter(isCompletedWorkingSet);
  const pool = working.length ? working : sets;
  const weighted = pool.filter((item) => item.weight_kg !== null && item.weight_kg > 0);
  if (weighted.length) {
    const best = weighted.reduce((top, item) =>
      item.weight_kg! > top.weight_kg! ||
      (item.weight_kg === top.weight_kg && (item.reps ?? 0) > (top.reps ?? 0))
        ? item
        : top,
    );
    const reps = best.reps === null ? '' : ` × ${best.reps}`;
    return `Best ${formatWeight(best.weight_kg!, unit)}${reps}`;
  }
  const reps = Math.max(0, ...pool.map((item) => item.reps ?? 0));
  return reps > 0 ? `Best ${plural(reps, 'rep')}` : null;
}

function cardioTotals(sets: readonly WorkoutSetInput[]): string | null {
  const seconds = sets.reduce((total, item) => total + (item.duration_seconds ?? 0), 0);
  const km = sets.reduce((total, item) => total + (item.distance_km ?? 0), 0);
  const parts = [
    seconds > 0 ? `${Math.max(1, Math.round(seconds / 60))} min` : null,
    km > 0 ? `${Number(km.toFixed(2)).toLocaleString('en-GB')} km` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function compactMovementSummary(
  movement: SummaryMovement,
  unit: WeightUnit,
): CompactMovementSummary {
  const total = movement.sets.length;
  const logged = movement.sets.filter((item) => item.completed);
  const status: CompactMovementStatus = isMovementDone(movement)
    ? 'done'
    : logged.length
      ? 'in-progress'
      : 'upcoming';
  const progress =
    status === 'upcoming'
      ? `${plural(total, 'set')} planned`
      : `${logged.length}/${total} ${total === 1 ? 'set' : 'sets'}`;
  const detail = logged.length
    ? movement.exercise.kind === 'cardio'
      ? cardioTotals(logged)
      : bestStrengthSet(logged, unit)
    : null;
  const spokenProgress =
    status === 'upcoming'
      ? `${plural(total, 'set')} planned`
      : `${logged.length} of ${plural(total, 'set')} done`;
  const name = movement.supersetKey
    ? `${movement.exercise.name}, superset`
    : movement.exercise.name;
  return {
    status,
    progress,
    detail,
    label: [name, spokenProgress, detail].filter(Boolean).join(', '),
  };
}

/** Says what the “More” disclosure holds, including anything already saved there. */
export function compactExtrasLabel({
  kind,
  photoCount,
  hasNote,
}: {
  kind: Exercise['kind'];
  photoCount: number;
  hasNote: boolean;
}): string {
  const notes = hasNote ? 'note added' : 'notes';
  if (kind === 'cardio') return hasNote ? 'Note added' : 'Notes';
  return [photoCount > 0 ? plural(photoCount, 'photo') : 'Photos', 'rest', notes].join(' · ');
}

export function compactWorkoutProgress(movements: readonly ProgressFields[]): string {
  const done = movements.filter(isMovementDone).length;
  return `${done} of ${plural(movements.length, 'exercise')} done`;
}
