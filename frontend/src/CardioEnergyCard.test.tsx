// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CardioEnergyCard } from './CardioEnergyCard';
import type { CardioEnergyPeriod } from './types';

const week: CardioEnergyPeriod = {
  period: 'week',
  start_date: '2026-08-31',
  end_date: '2026-09-06',
  calories_kcal: 1540,
  logged_sessions: 3,
  total_sessions: 4,
  previous_start_date: '2026-08-24',
  previous_end_date: '2026-08-30',
  previous_calories_kcal: 1200,
  average_heart_rate_bpm: 142,
  previous_average_heart_rate_bpm: 138,
  distance_km: 18.25,
  previous_distance_km: 16,
  average_speed_kph: 9.4,
  previous_average_speed_kph: 8.9,
  average_incline_percent: 7.5,
  previous_average_incline_percent: 6,
  average_mets: 7.2,
  previous_average_mets: 6.5,
  met_minutes: 864,
  previous_met_minutes: 650,
  heart_rate_sessions: 3,
  distance_sessions: 3,
  speed_sessions: 2,
  incline_sessions: 2,
  mets_sessions: 3,
};

describe('cardio energy card', () => {
  it('starts with the comparison details minimized', () => {
    const markup = renderToStaticMarkup(<CardioEnergyCard summaries={[week]} />);
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('Show details +');
    expect(markup).toContain('864');
    expect(markup).toContain('MET-min');
    expect(markup).toContain('7.2 average METs');
    expect(markup).not.toContain('1,540 kcal');
  });
  it('tolerates a cached dashboard from before calorie tracking', () => {
    expect(renderToStaticMarkup(<CardioEnergyCard summaries={undefined} />)).toBe('');
  });
  it('labels the calorie-derived fat figure as an equivalent, not burnt fat', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<CardioEnergyCard summaries={[week]} />));
      await act(async () =>
        container.querySelector<HTMLButtonElement>('.cardio-progress-toggle')?.click(),
      );
      const text = container.textContent ?? '';
      expect(text).toContain('Fat-energy equivalent');
      expect(text).toContain('≈ 200 g');
      expect(text).toContain('not measured fat loss');
      expect(text).not.toMatch(/burnt/i);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
