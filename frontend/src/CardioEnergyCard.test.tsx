import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
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
  it('shows the complete stat grid with compact period controls', () => {
    const markup = renderToStaticMarkup(
      <CardioEnergyCard summaries={[week]} weekEnd="2026-09-06" />,
    );
    expect(markup).toContain('864');
    expect(markup).toContain('1,540');
    expect(markup).toContain('cardio-stat-unit');
    expect(markup).toContain('Average METs');
    expect(markup).toContain('Fat energy equivalent');
    expect(markup).toContain('About cardio progress');
    expect(markup).toContain('Cardio progress period');
    expect(markup).not.toContain('Show details');
  });
  it('uses singular session labels and keeps unlogged metrics empty', () => {
    const markup = renderToStaticMarkup(
      <CardioEnergyCard
        summaries={[
          {
            ...week,
            total_sessions: 1,
            logged_sessions: 1,
            mets_sessions: 1,
            heart_rate_sessions: 1,
            distance_sessions: 0,
            speed_sessions: 0,
            incline_sessions: 0,
          },
        ]}
      />,
    );
    expect(markup).toContain('1 session logged');
    expect(markup).not.toContain('1 sessions');
    expect(markup).toContain('No distance logged');
  });
  it('tolerates a cached dashboard from before calorie tracking', () => {
    expect(renderToStaticMarkup(<CardioEnergyCard summaries={undefined} />)).toBe('');
  });
});
