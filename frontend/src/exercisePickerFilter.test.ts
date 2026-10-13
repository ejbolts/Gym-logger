import { describe, expect, it } from 'vitest';
import { exercisePickerEmptyState, filterExercisePickerSections } from './exercisePickerFilter';
import type { Exercise, WorkoutCategory } from './types';

const categoryLabels: Record<WorkoutCategory, string> = {
  upper: 'Upper body',
  lower: 'Lower body',
  push: 'Push',
  pull: 'Pull',
  full_body: 'Full body',
  cardio: 'Cardio',
  other: 'Other',
};

function exercise(
  id: string,
  name: string,
  category: WorkoutCategory,
  overrides: Partial<Exercise> = {},
): Exercise {
  return {
    id,
    name,
    category,
    kind: 'strength',
    muscle_group: 'Chest',
    equipment: null,
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
    ...overrides,
  };
}

const exercises = [
  exercise('bench', 'Bench Press', 'push', { is_favorite: true }),
  exercise('dip', 'Chest Dip', 'push'),
  exercise('ohp', 'Overhead Press', 'push', { muscle_group: 'Shoulders' }),
  exercise('row', 'Seated Row', 'pull', { is_favorite: true, muscle_group: 'Back' }),
  exercise('pulldown', 'Lat Pulldown', 'pull', { muscle_group: 'Back' }),
  exercise('squat', 'Back Squat', 'lower', { is_favorite: true, muscle_group: 'Quads' }),
  exercise('run', 'Treadmill Run', 'cardio', { kind: 'cardio', muscle_group: 'Cardio' }),
];

// Most recently used first.
const recentExerciseIds = ['ohp', 'row', 'bench'];

function ids(sections: ReturnType<typeof filterExercisePickerSections>) {
  return sections.map((section) => ({
    title: section.title,
    ids: section.exercises.map((item) => item.id),
  }));
}

function browse(overrides: Partial<Parameters<typeof filterExercisePickerSections>[0]> = {}) {
  return filterExercisePickerSections({
    exercises,
    recentExerciseIds,
    categoryLabels,
    categoryFilter: 'all',
    listFilter: 'all',
    query: '',
    ...overrides,
  });
}

describe('exercise picker filters', () => {
  it('combines a workout type with the favorites list', () => {
    expect(ids(browse({ categoryFilter: 'push', listFilter: 'favorites' }))).toEqual([
      { title: 'Favorites', ids: ['bench'] },
    ]);
  });

  it('combines a workout type with recently used exercises', () => {
    expect(ids(browse({ categoryFilter: 'pull', listFilter: 'recent' }))).toEqual([
      { title: 'Recently used', ids: ['row'] },
    ]);
  });

  it('keeps favorites and recent groups inside the selected workout type', () => {
    expect(ids(browse({ categoryFilter: 'push' }))).toEqual([
      { title: 'Favorites', ids: ['bench'] },
      { title: 'Recently used', ids: ['ohp'] },
      { title: 'Push exercises', ids: ['dip'] },
    ]);
  });

  it('searches within the selected workout type', () => {
    expect(ids(browse({ categoryFilter: 'push', query: 'press' }))).toEqual([
      { title: 'Search results', ids: ['ohp', 'bench'] },
    ]);
    expect(ids(browse({ categoryFilter: 'lower', query: 'press' }))).toEqual([
      { title: 'Search results', ids: [] },
    ]);
  });

  it('searches within the selected favorites list', () => {
    expect(ids(browse({ listFilter: 'favorites', query: 'press' }))).toEqual([
      { title: 'Search results', ids: ['bench'] },
    ]);
    expect(ids(browse({ listFilter: 'favorites', query: 'pulldown' }))).toEqual([
      { title: 'Search results', ids: [] },
    ]);
  });

  it('searches within both the workout type and the list together', () => {
    expect(
      ids(browse({ categoryFilter: 'push', listFilter: 'favorites', query: 'press' })),
    ).toEqual([{ title: 'Search results', ids: ['bench'] }]);
    expect(
      ids(browse({ categoryFilter: 'pull', listFilter: 'favorites', query: 'press' })),
    ).toEqual([{ title: 'Search results', ids: [] }]);
    expect(ids(browse({ categoryFilter: 'push', listFilter: 'recent', query: 'press' }))).toEqual([
      { title: 'Search results', ids: ['ohp', 'bench'] },
    ]);
  });

  it('limits recently used exercises to the ten most recent', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      exercise(`item-${index}`, `Item ${index}`, 'other'),
    );
    const sections = filterExercisePickerSections({
      exercises: many,
      recentExerciseIds: many.map((item) => item.id),
      categoryLabels,
      categoryFilter: 'all',
      listFilter: 'recent',
      query: '',
    });
    expect(sections[0].exercises).toHaveLength(10);
  });

  it('lists every exercise once when no workout type, list or search is set', () => {
    const sections = browse();
    const shown = sections.flatMap((section) => section.exercises.map((item) => item.id));

    expect(sections.map((section) => section.title)).toEqual([
      'Favorites',
      'Recently used',
      'All exercises',
    ]);
    expect(shown.slice().sort()).toEqual(exercises.map((item) => item.id).sort());
  });

  it('clearing the workout type, list and search restores the full browse view', () => {
    const filtered = browse({ categoryFilter: 'push', listFilter: 'favorites', query: 'press' });
    const cleared = browse({ categoryFilter: 'all', listFilter: 'all', query: '' });

    expect(ids(filtered)).not.toEqual(ids(cleared));
    expect(cleared).toEqual(browse());
    expect(cleared.flatMap((section) => section.exercises).length).toBe(exercises.length);
  });

  it('names the category section with its label', () => {
    expect(ids(browse({ categoryFilter: 'pull' }))).toEqual([
      { title: 'Favorites', ids: ['row'] },
      { title: 'Pull exercises', ids: ['pulldown'] },
    ]);
  });
});

describe('exercise picker empty state', () => {
  it('keeps the favorites and recent hints when no search or workout type is set', () => {
    expect(
      exercisePickerEmptyState({ categoryFilter: 'all', listFilter: 'favorites', query: '' }),
    ).toBe('favorites');
    expect(
      exercisePickerEmptyState({ categoryFilter: 'all', listFilter: 'recent', query: '  ' }),
    ).toBe('recent');
  });

  it('uses the filtered message with a reset when a workout type or search narrows the list', () => {
    expect(
      exercisePickerEmptyState({ categoryFilter: 'push', listFilter: 'favorites', query: '' }),
    ).toBe('filtered');
    expect(
      exercisePickerEmptyState({ categoryFilter: 'all', listFilter: 'favorites', query: 'row' }),
    ).toBe('filtered');
    expect(
      exercisePickerEmptyState({ categoryFilter: 'all', listFilter: 'all', query: 'zzz' }),
    ).toBe('filtered');
  });

  it('reports an unavailable list when nothing is filtered', () => {
    expect(exercisePickerEmptyState({ categoryFilter: 'all', listFilter: 'all', query: '' })).toBe(
      'unavailable',
    );
  });
});
