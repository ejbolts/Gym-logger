// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { BodyCompositionScreen } from './App';
import { TrainingPreferencesContext } from './trainingPreferencesContext';
import type { BodyMeasurement, BodyWeightGoal } from './types';
import type { WeightUnit } from './weightUnits';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function goal(start: number, target: number, active = true): BodyWeightGoal {
  return {
    id: 'goal',
    start_date: '2026-01-01',
    target_date: '2026-12-31',
    start_weight_kg: start,
    target_weight_kg: target,
    active,
    created_at: '2026-01-01T00:00:00Z',
  };
}

function measurement(date: string, weight: number): BodyMeasurement {
  return {
    id: date,
    measurement_date: date,
    weight_kg: weight,
    body_fat_pct: null,
    notes: null,
    is_sample: true,
    created_at: `${date}T00:00:00Z`,
  };
}

async function render(
  measurements: BodyMeasurement[],
  goals: BodyWeightGoal[],
  unit: WeightUnit = 'kg',
) {
  vi.spyOn(api, 'listBodyWeightGoals').mockResolvedValue(goals);
  await act(async () =>
    root.render(
      <TrainingPreferencesContext.Provider
        value={{
          preferences: {
            preferred_weight_unit: unit,
            week_start: 'monday',
            zone2_goal_minutes: 150,
            weekly_muscle_set_goal: 10,
          },
          error: null,
          applySaved: vi.fn(),
        }}
      >
        <BodyCompositionScreen
          measurements={measurements}
          onSave={vi.fn()}
          onDelete={vi.fn()}
          onDataChange={vi.fn()}
        />
      </TrainingPreferencesContext.Provider>,
    ),
  );
}

function rows() {
  return [...container.querySelectorAll('.body-history-panel > article')];
}

function arrow(row: Element) {
  return row.querySelector('.body-history-weight-change');
}

async function selectTab(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (item) => item.textContent === label,
  )!;
  await act(async () => button.click());
}

describe('Body history goal-aware arrows', () => {
  it.each([
    { target: 75, statuses: ['favorable', 'unfavorable'], goalWord: 'loss' },
    { target: 90, statuses: ['unfavorable', 'favorable'], goalWord: 'gain' },
  ])(
    'renders daily and grouped directions for a weight-$goalWord goal',
    async ({ target, statuses, goalWord }) => {
      await render(
        [
          measurement('2026-08-03', 80),
          measurement('2026-10-05', 80),
          measurement('2026-09-07', 81),
        ],
        [goal(82, target)],
      );

      for (const tab of ['Daily', 'Avg Week', 'Avg Monthly']) {
        await selectTab(tab);
        expect(rows()).toHaveLength(3);
        expect(arrow(rows()[0])?.classList.contains(statuses[0])).toBe(true);
        expect(arrow(rows()[0])?.getAttribute('aria-label')).toContain('Weight decreased');
        expect(arrow(rows()[0])?.getAttribute('aria-label')).toContain(`weight-${goalWord} goal`);
        expect(arrow(rows()[1])?.classList.contains(statuses[1])).toBe(true);
        expect(arrow(rows()[1])?.getAttribute('aria-label')).toContain('Weight increased');
        expect(arrow(rows()[2])).toBeNull();
      }
    },
  );

  it('compares across page boundaries in each history view and keeps pounds independent of status', async () => {
    await render(
      Array.from({ length: 10 }, (_, index) =>
        measurement(`2026-${String(10 - index).padStart(2, '0')}-15`, 80 + index / 10),
      ),
      [goal(90, 75)],
      'lb',
    );
    expect(rows()[0].querySelector('.body-history-weight')?.textContent).toContain('176.37 lb');
    for (const [tab, period] of [
      ['Daily', 'daily'],
      ['Avg Week', 'week'],
      ['Avg Monthly', 'month'],
    ]) {
      await selectTab(tab);
      expect(rows()).toHaveLength(8);
      expect(arrow(rows()[7])?.classList.contains('favorable')).toBe(true);
      await act(async () =>
        container
          .querySelector<HTMLButtonElement>(
            `[aria-label="Next ${period} bodyweight history page"]`,
          )!
          .click(),
      );
      expect(rows()).toHaveLength(2);
      expect(arrow(rows()[0])?.classList.contains('favorable')).toBe(true);
      expect(arrow(rows()[1])).toBeNull();
    }
  });

  it.each([{ goals: [] }, { goals: [goal(80, 80)] }, { goals: [goal(90, 75, false)] }])(
    'keeps changes neutral without an active directional goal: $goals',
    async ({ goals }) => {
      await render([measurement('2026-10-02', 80), measurement('2026-10-01', 81)], goals);
      expect(arrow(rows()[0])?.classList.contains('neutral')).toBe(true);
      expect(arrow(rows()[0])?.getAttribute('aria-label')).toBe(
        'Weight decreased since previous check-in',
      );
    },
  );

  it('does not show arrows for equal weights or the first chronological check-in', async () => {
    await render([measurement('2026-10-02', 80), measurement('2026-10-01', 80)], [goal(90, 75)]);
    expect(container.querySelectorAll('.body-history-weight-change')).toHaveLength(0);
  });

  it('updates period comparisons when the selected statistic changes', async () => {
    await render(
      [
        measurement('2026-10-07', 100),
        measurement('2026-10-06', 80),
        measurement('2026-10-05', 80),
        measurement('2026-09-07', 82),
      ],
      [goal(90, 75)],
    );
    await selectTab('Avg Week');
    expect(arrow(rows()[0])?.classList.contains('unfavorable')).toBe(true);
    const select = container.querySelector<HTMLSelectElement>(
      '[aria-label="Bodyweight trend statistic"]',
    )!;
    await act(async () => {
      select.value = 'median';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(arrow(rows()[0])?.classList.contains('favorable')).toBe(true);
    await selectTab('Median Monthly');
    expect(arrow(rows()[0])?.classList.contains('favorable')).toBe(true);
  });
});
