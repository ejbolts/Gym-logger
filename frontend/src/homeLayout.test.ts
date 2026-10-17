import { describe, expect, it } from 'vitest';
import {
  defaultHomeLayout,
  HOME_SECTIONS,
  homeSectionSpans,
  moveHomeSection,
  toggleHomeSection,
  toggleHomeSectionWidth,
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
    expect(moveHomeSection(reordered, 'consistency', 'friends').order.at(-1)).toBe('consistency');
    expect(moveHomeSection(saved, 'records', 'records')).toBe(saved);
  });

  it('restores hidden sections at their saved position', () => {
    const saved = defaultHomeLayout();
    const hidden = toggleHomeSection(saved, 'workouts');
    expect(hidden.hidden).toEqual(['workouts']);
    expect(saved.hidden).toEqual([]);
    expect(toggleHomeSection(hidden, 'workouts')).toEqual(saved);
  });

  it('keeps explicitly resized cards at their chosen width and preserves default packing', () => {
    expect(
      homeSectionSpans(['workouts', 'cardio-sessions', 'weekly-bodyweight'], {
        workouts: 'full',
      }),
    ).toEqual([6, 3, 3]);
    expect(
      homeSectionSpans(['daily-check-in', 'records'], {
        'daily-check-in': 'compact',
        records: 'compact',
      }),
    ).toEqual([3, 3]);
    expect(homeSectionSpans(['daily-check-in'], { 'daily-check-in': 'compact' })).toEqual([3]);
    expect(homeSectionSpans(['workouts'], { workouts: 'compact' })).toEqual([2]);
  });

  it('resizes without mutating saved widths, order or visibility and resets overrides', () => {
    const saved = { ...defaultHomeLayout(), widths: { records: 'compact' as const } };
    const compact = toggleHomeSectionWidth(saved, 'daily-check-in', 6);
    expect(compact.widths).toEqual({ records: 'compact', 'daily-check-in': 'compact' });
    expect(compact.order).toEqual(saved.order);
    expect(compact.hidden).toEqual(saved.hidden);
    expect(saved.widths).toEqual({ records: 'compact' });
    expect(toggleHomeSectionWidth(compact, 'daily-check-in', 3).widths).toEqual({
      records: 'compact',
      'daily-check-in': 'full',
    });
    expect(moveHomeSection(compact, 'records', 'workouts').widths).toEqual(compact.widths);
    expect(toggleHomeSection(compact, 'records').widths).toEqual(compact.widths);
    expect(defaultHomeLayout().widths).toEqual({});
  });

  it('returns expanded stats to their shared row when shrinking and fills remaining space', () => {
    const stats = ['workouts', 'cardio-sessions', 'weekly-bodyweight'] as const;
    const expanded = toggleHomeSectionWidth(defaultHomeLayout(), 'workouts', 2);
    expect(homeSectionSpans([...stats], expanded.widths)).toEqual([6, 3, 3]);
    const shrunk = toggleHomeSectionWidth(expanded, 'workouts', 6);
    expect(homeSectionSpans([...stats], shrunk.widths)).toEqual([2, 2, 2]);
    expect(homeSectionSpans(['workouts', 'cardio-sessions'], shrunk.widths)).toEqual([2, 4]);
    expect(homeSectionSpans(['cardio-sessions', 'workouts'], shrunk.widths)).toEqual([4, 2]);
    expect(homeSectionSpans(['workouts', 'consistency'], shrunk.widths)).toEqual([2, 6]);
  });
});
