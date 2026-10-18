import type { FriendFeedItem, WorkoutReactionKind } from './types';
import { formatMinutesDuration } from './utils';

export const REACTIONS: ReadonlyArray<{ kind: WorkoutReactionKind; emoji: string; label: string }> =
  [
    { kind: 'strong', emoji: '💪', label: 'Strong' },
    { kind: 'fire', emoji: '🔥', label: 'Fire' },
    { kind: 'clap', emoji: '👏', label: 'Applause' },
    { kind: 'trophy', emoji: '🏆', label: 'Trophy' },
  ];

export function reactionEmoji(kind: WorkoutReactionKind): string {
  return REACTIONS.find((item) => item.kind === kind)?.emoji ?? '';
}

/** Exercises, completed sets and logged duration, for a one-line workout summary. */
export function feedWorkoutSummary(workout: FriendFeedItem['workout']): string {
  const sets = workout.movements.reduce(
    (total, movement) => total + movement.sets.filter((item) => item.completed).length,
    0,
  );
  const exercises = workout.movements.length;
  return [
    `${exercises} ${exercises === 1 ? 'exercise' : 'exercises'}`,
    `${sets} ${sets === 1 ? 'set' : 'sets'}`,
    workout.duration_minutes ? formatMinutesDuration(workout.duration_minutes) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The reaction a tap should leave: choosing your current reaction again removes it. */
export function nextReaction(
  current: WorkoutReactionKind | null,
  chosen: WorkoutReactionKind,
): WorkoutReactionKind | null {
  return current === chosen ? null : chosen;
}
