import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { nextReaction, reactionEmoji, reactionSummary, REACTIONS } from './friendFeedData';
import { Icon } from './Icon';
import type { WorkoutReactions, WorkoutComment } from './types';
import { WorkoutComments } from './WorkoutComments';

/** One reaction button and the same six-choice picker on Home and shared workouts. */
export function WorkoutReactionControl({
  workoutId,
  subject,
  reactions,
  open,
  onOpenChange,
  onChange,
  onOpenMember,
  ownWorkout = false,
}: {
  workoutId: string;
  subject: string;
  reactions: WorkoutReactions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: WorkoutReactions) => void;
  showSummary?: boolean;
  ownWorkout?: boolean;
  onOpenMember?: (person: WorkoutComment['author']) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [visited, setVisited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const openRef = useRef(open);
  const closeRef = useRef(onOpenChange);
  openRef.current = open;
  closeRef.current = onOpenChange;
  const yours = reactions.yours;
  const summary = reactionSummary(reactions.counts);
  const selected = REACTIONS.find((entry) => entry.kind === yours);

  useEffect(() => {
    if (!open) return;
    const selectedButton =
      picker.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    (selectedButton ?? picker.current?.querySelector<HTMLButtonElement>('button'))?.focus();
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!container.current?.contains(target) && !trigger.current?.contains(target))
        closeRef.current(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      closeRef.current(false);
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  async function react(chosen: (typeof REACTIONS)[number]['kind']) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = nextReaction(yours, chosen);
      onChange(
        next
          ? await api.sharing.react(workoutId, next)
          : await api.sharing.removeReaction(workoutId),
      );
      if (openRef.current) {
        trigger.current?.focus();
      }
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={container} className="workout-discussion">
      <button
        ref={trigger}
        type="button"
        className={`friend-react-button combined-discussion-button${yours ? ' is-yours' : ''}`}
        aria-label={
          ownWorkout
            ? `Reactions and comments on ${subject}`
            : yours
              ? `Your reaction to ${subject}: ${selected?.label}. Change reaction`
              : `React to ${subject}`
        }
        aria-expanded={open}
        aria-description={`${summary.total} reactions and ${reactions.comment_count ?? 0} comments. Opens the inline discussion.`}
        aria-controls={`discussion-${workoutId}`}
        onClick={() => {
          setError(null);
          setVisited(true);
          onOpenChange(!open);
        }}
      >
        {summary.total > 0 ? (
          <>
            <span aria-hidden="true">{summary.emojis.join('')}</span> {summary.total}
          </>
        ) : yours ? (
          <span aria-hidden="true">{reactionEmoji(yours)}</span>
        ) : (
          <Icon name="react" />
        )}
        <span aria-hidden="true"> · </span>
        {reactions.comment_count ?? 0}{' '}
        {(reactions.comment_count ?? 0) === 1 ? 'comment' : 'comments'}
      </button>
      {open && !ownWorkout && (
        <div
          ref={picker}
          className="friend-react-picker"
          role="dialog"
          aria-label={`Choose a reaction to ${subject}`}
          aria-busy={busy}
        >
          {REACTIONS.map(({ kind, emoji, label }) => (
            <button
              key={kind}
              type="button"
              aria-label={label}
              aria-pressed={yours === kind}
              title={label}
              disabled={busy}
              onClick={() => void react(kind)}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
          {error && (
            <p className="inline-error friend-react-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      {(open || visited) && (
        <div hidden={!open} id={`discussion-${workoutId}`} className="workout-discussion-thread">
          <WorkoutComments
            active={open}
            workoutId={workoutId}
            onOpenMember={onOpenMember}
            onCountChange={(count, summary) =>
              onChange(summary ?? { ...reactions, comment_count: count })
            }
          />
        </div>
      )}
    </div>
  );
}
