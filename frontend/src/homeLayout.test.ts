import { describe, expect, it } from 'vitest';
import {
  defaultHomeLayout,
  HOME_SECTIONS,
  homeSectionSpans,
  moveHomeSection,
  toggleHomeSection,
} from './homeLayout';

describe('Home layout edits', () => {
  it('fills rows after hiding or moving small cards without changing their order', () => {
    expect(homeSectionSpans(['workouts', 'cardio-sessions', 'weekly-bodyweight'])).toEqual([
      2, 2, 2,
    ]);
    expect(homeSectionSpans(['workouts', 'weekly-bodyweight'])).toEqual([3, 3]);
    expect(homeSectionSpans(['workouts', 'consistency', 'zone2', 'bodyweight-trend'])).toEqual([
      6, 6, 3, 3,
    ]);
    expect(homeSectionSpans(['zone2', 'records', 'bodyweight-trend'])).toEqual([6, 6, 6]);
  });
  it('moves in either direction while retaining hidden sections and not mutating the saved layout', () => {
    const saved = { ...defaultHomeLayout(), hidden: ['records' as const] };
    const reordered = moveHomeSection(saved, 'consistency', 'next-workout');
    expect(reordered.order[0]).toBe('consistency');
    expect(reordered.order).toHaveLength(HOME_SECTIONS.length);
    expect(new Set(reordered.order).size).toBe(HOME_SECTIONS.length);
    expect(reordered.hidden).toEqual(['records']);
    expect(saved.order[0]).toBe('next-workout');
    expect(moveHomeSection(reordered, 'consistency', 'records').order.at(-1)).toBe('consistency');
    expect(moveHomeSection(saved, 'records', 'records')).toBe(saved);
  });

  it('restores hidden sections at their saved position', () => {
    const saved = defaultHomeLayout();
    const hidden = toggleHomeSection(saved, 'workouts');
    expect(hidden.hidden).toEqual(['workouts']);
    expect(saved.hidden).toEqual([]);
    expect(toggleHomeSection(hidden, 'workouts')).toEqual(saved);
  });
});
