const COLLAPSED_KEY = 'gym-logger-sample-banner-collapsed';

export function readSampleBannerCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSampleBannerCollapsed(collapsed: boolean) {
  try {
    if (collapsed) window.localStorage.setItem(COLLAPSED_KEY, '1');
    else window.localStorage.removeItem(COLLAPSED_KEY);
  } catch {
    // Collapsing still works for this visit when storage is blocked.
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** What the sample week contains, for explaining exactly what removal deletes. */
export function sampleDataSummary(workoutCount: number, measurementCount: number): string {
  const parts = [
    workoutCount > 0 && plural(workoutCount, 'sample workout', 'sample workouts'),
    measurementCount > 0 && plural(measurementCount, 'body check-in', 'body check-ins'),
  ].filter(Boolean);
  return parts.join(' and ');
}
