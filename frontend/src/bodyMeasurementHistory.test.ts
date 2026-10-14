import { describe, expect, it } from 'vitest';
import { bodyHistoryWithWeightChanges, summarizeBodyHistory } from './bodyMeasurementHistory';

const measurements = [
  { measurement_date: '2026-10-01', weight_kg: 90, body_fat_pct: null },
  { measurement_date: '2026-09-30', weight_kg: 80, body_fat_pct: 12 },
  { measurement_date: '2026-09-28', weight_kg: 70, body_fat_pct: 14 },
  { measurement_date: '2026-09-27', weight_kg: 60, body_fat_pct: 16 },
];

describe('bodyweight history summaries', () => {
  it('groups weeks from Monday through Sunday and keeps the newest week first', () => {
    expect(summarizeBodyHistory(measurements, 'week', 'average')).toEqual([
      {
        start_date: '2026-09-28',
        end_date: '2026-10-04',
        weight_kg: 80,
        body_fat_pct: 13,
        count: 3,
      },
      {
        start_date: '2026-09-21',
        end_date: '2026-09-27',
        weight_kg: 60,
        body_fat_pct: 16,
        count: 1,
      },
    ]);
  });

  it('uses calendar months, median values, and only known body fat readings', () => {
    expect(summarizeBodyHistory(measurements, 'month', 'median')).toEqual([
      {
        start_date: '2026-10-01',
        end_date: '2026-10-31',
        weight_kg: 90,
        body_fat_pct: null,
        count: 1,
      },
      {
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        weight_kg: 70,
        body_fat_pct: 14,
        count: 3,
      },
    ]);
  });
});

describe('bodyweight history changes', () => {
  const cut = { start_weight_kg: 90, target_weight_kg: 80 };
  const bulk = { start_weight_kg: 80, target_weight_kg: 90 };
  const history = [82, 83, 82].map((weight_kg) => ({ weight_kg }));

  it('marks losses favorably and gains unfavorably for a cutting goal', () => {
    expect(bodyHistoryWithWeightChanges(history, cut).map((entry) => entry.weight_change)).toEqual([
      { direction: 'down', status: 'favorable', goalDirection: 'loss' },
      { direction: 'up', status: 'unfavorable', goalDirection: 'loss' },
      null,
    ]);
  });

  it('reverses the goal status for a bulking goal without reversing arrow direction', () => {
    expect(bodyHistoryWithWeightChanges(history, bulk).map((entry) => entry.weight_change)).toEqual(
      [
        { direction: 'down', status: 'unfavorable', goalDirection: 'gain' },
        { direction: 'up', status: 'favorable', goalDirection: 'gain' },
        null,
      ],
    );
  });

  it.each([null, { start_weight_kg: 82, target_weight_kg: 82 }])(
    'shows neutral direction when no directional goal exists: %s',
    (goal) => {
      expect(bodyHistoryWithWeightChanges(history, goal)[0].weight_change).toEqual({
        direction: 'down',
        status: 'neutral',
        goalDirection: null,
      });
    },
  );

  it('omits arrows for ties, floating-point aggregate noise, missing or invalid comparisons', () => {
    const entries = [82, 82, 82 + Number.EPSILON * 82, Number.NaN, 80].map((weight_kg) => ({
      weight_kg,
    }));
    expect(bodyHistoryWithWeightChanges(entries, cut).map((entry) => entry.weight_change)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(bodyHistoryWithWeightChanges([], cut)).toEqual([]);
  });

  it('compares adjacent available period statistics rather than individual measurements', () => {
    const entries = [
      { measurement_date: '2026-10-12', weight_kg: 80, body_fat_pct: null },
      { measurement_date: '2026-10-13', weight_kg: 90, body_fat_pct: null },
      { measurement_date: '2026-09-07', weight_kg: 84, body_fat_pct: null },
      { measurement_date: '2026-08-03', weight_kg: 86, body_fat_pct: null },
    ];
    for (const period of ['week', 'month'] as const) {
      for (const statistic of ['average', 'median'] as const) {
        const rows = bodyHistoryWithWeightChanges(
          summarizeBodyHistory(entries, period, statistic),
          cut,
        );
        expect(rows.map((row) => row.weight_kg)).toEqual([85, 84, 86]);
        expect(rows.map((row) => row.weight_change?.status ?? null)).toEqual([
          'unfavorable',
          'favorable',
          null,
        ]);
      }
    }
  });

  it('retains the comparison across a page boundary and does not modify source weights', () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({ weight_kg: 80 + index / 10 }));
    const rows = bodyHistoryWithWeightChanges(entries, cut);
    expect(rows.slice(0, 8)[7].weight_change).toEqual({
      direction: 'down',
      status: 'favorable',
      goalDirection: 'loss',
    });
    expect(rows.slice(8)[0].weight_change?.status).toBe('favorable');
    expect(rows.at(-1)?.weight_change).toBeNull();
    expect(entries[0]).toEqual({ weight_kg: 80 });
  });
});
