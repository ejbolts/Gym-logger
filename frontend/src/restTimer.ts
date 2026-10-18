export async function cancelRestTimerPushSchedule(
  cancel: () => Promise<void>,
  pendingSchedules: Iterable<Promise<void>>,
): Promise<void> {
  const firstCancellation = cancel().catch(() => undefined);
  await Promise.allSettled([firstCancellation, ...pendingSchedules]);
  await cancel().catch(() => undefined);
}

/** The share of the rest period still to go, for the popup's shrinking countdown bar. */
export function restTimerProgress(seconds: number, totalSeconds: number): number {
  if (totalSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, seconds / totalSeconds));
}
