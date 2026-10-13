import { rankExerciseSearchMatches } from './exerciseSearch';
import type { Exercise, WorkoutCategory } from './types';

export type ExerciseCategoryFilter = WorkoutCategory | 'all';
export type ExerciseListFilter = 'all' | 'favorites' | 'recent';

export interface ExercisePickerFilters {
  categoryFilter: ExerciseCategoryFilter;
  listFilter: ExerciseListFilter;
  query: string;
}

export interface ExercisePickerSection {
  title: string;
  exercises: Exercise[];
}

export type ExercisePickerEmptyState = 'favorites' | 'recent' | 'filtered' | 'unavailable';

const RECENT_EXERCISE_LIMIT = 10;

function recentlyUsedExercises(
  exercises: readonly Exercise[],
  recentExerciseIds: readonly string[],
): Exercise[] {
  return recentExerciseIds
    .slice(0, RECENT_EXERCISE_LIMIT)
    .map((id) => exercises.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is Exercise => Boolean(exercise));
}

/**
 * Groups the picker's exercises for the current workout type, list and search.
 * A search always runs inside the selected workout type and list, never around them.
 */
export function filterExercisePickerSections({
  exercises,
  recentExerciseIds,
  categoryLabels,
  categoryFilter,
  listFilter,
  query,
}: ExercisePickerFilters & {
  exercises: readonly Exercise[];
  recentExerciseIds: readonly string[];
  categoryLabels: Record<WorkoutCategory, string>;
}): ExercisePickerSection[] {
  const needle = query.trim();
  const inCategory = (exercise: Exercise) =>
    categoryFilter === 'all' || exercise.category === categoryFilter;
  const recent = recentlyUsedExercises(exercises, recentExerciseIds);

  if (needle) {
    const listed =
      listFilter === 'favorites'
        ? exercises.filter((exercise) => exercise.is_favorite)
        : listFilter === 'recent'
          ? recent
          : exercises;
    return [
      {
        title: 'Search results',
        exercises: rankExerciseSearchMatches(listed.filter(inCategory), needle, recentExerciseIds),
      },
    ];
  }

  if (listFilter === 'favorites') {
    return [
      {
        title: 'Favorites',
        exercises: exercises.filter((exercise) => exercise.is_favorite && inCategory(exercise)),
      },
    ];
  }

  if (listFilter === 'recent') {
    return [{ title: 'Recently used', exercises: recent.filter(inCategory) }];
  }

  const scoped = exercises.filter(inCategory);
  const favorites = scoped.filter((exercise) => exercise.is_favorite);
  const favoriteIds = new Set(favorites.map((exercise) => exercise.id));
  const recentlyUsed = recent.filter(
    (exercise) => inCategory(exercise) && !favoriteIds.has(exercise.id),
  );
  const featuredIds = new Set([
    ...favorites.map((exercise) => exercise.id),
    ...recentlyUsed.map((exercise) => exercise.id),
  ]);
  const sections: ExercisePickerSection[] = [];
  if (favorites.length) sections.push({ title: 'Favorites', exercises: favorites });
  if (recentlyUsed.length) sections.push({ title: 'Recently used', exercises: recentlyUsed });
  sections.push({
    title:
      categoryFilter === 'all' ? 'All exercises' : `${categoryLabels[categoryFilter]} exercises`,
    exercises: scoped.filter((exercise) => !featuredIds.has(exercise.id)),
  });
  return sections;
}

/**
 * Chooses the empty-state copy for a picker that shows no exercises.
 * The favorites and recent hints only apply when nothing else is narrowing the list.
 */
export function exercisePickerEmptyState({
  categoryFilter,
  listFilter,
  query,
}: ExercisePickerFilters): ExercisePickerEmptyState {
  const hasSearch = query.trim().length > 0;
  if (!hasSearch && categoryFilter === 'all') {
    if (listFilter === 'favorites') return 'favorites';
    if (listFilter === 'recent') return 'recent';
  }
  if (hasSearch || categoryFilter !== 'all' || listFilter !== 'all') return 'filtered';
  return 'unavailable';
}
