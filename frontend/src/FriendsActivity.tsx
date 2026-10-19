import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { authErrorMessage } from './authForm';
import {
  friendSession,
  nextReaction,
  reactionEmoji,
  reactionSummary,
  REACTIONS,
  relativeDay,
} from './friendFeedData';
import { Icon } from './Icon';
import { ProfileAvatar } from './ProfileAvatar';
import type { FriendFeedItem, WorkoutReactionKind, WorkoutReactions } from './types';
import { localDate } from './utils';

type ActivityState =
  | { kind: 'loading' }
  | { kind: 'locked' }
  | { kind: 'error' }
  | { kind: 'ready'; items: FriendFeedItem[]; following: number };

/** Home's Friends card: each friend's latest session, with one button to react to it. */
export function FriendsActivityCard({
  active,
  onOpenFriend,
  onOpenFriends,
  today = localDate(),
}: {
  active: boolean;
  onOpenFriend: (friend: FriendFeedItem['friend']) => void;
  onOpenFriends: () => void;
  today?: string;
}) {
  const [state, setState] = useState<ActivityState>({ kind: 'loading' });
  const [picking, setPicking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Refreshed whenever Home is shown, so new sessions, follows and reactions appear.
    if (!active) return;
    let cancelled = false;
    api.sharing
      .feed()
      .then((feed) => {
        if (!cancelled) setState({ kind: 'ready', ...feed });
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setState(
          reason instanceof ApiError && reason.code === 'sharing_required'
            ? { kind: 'locked' }
            : { kind: 'error' },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!picking) return;
    const selected = picker.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    (selected ?? picker.current?.querySelector<HTMLButtonElement>('button'))?.focus();
    function close(returnFocus: boolean) {
      setPicking(null);
      if (returnFocus) trigger.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!picker.current?.contains(target) && !trigger.current?.contains(target)) close(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close(true);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [picking]);

  function updateReactions(workoutId: string, reactions: WorkoutReactions) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            items: current.items.map((item) =>
              item.workout.id === workoutId ? { ...item, reactions } : item,
            ),
          }
        : current,
    );
  }

  async function react(item: FriendFeedItem, chosen: WorkoutReactionKind) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = nextReaction(item.reactions.yours, chosen);
      updateReactions(
        item.workout.id,
        next
          ? await api.sharing.react(item.workout.id, next)
          : await api.sharing.removeReaction(item.workout.id),
      );
      setPicking(null);
      trigger.current?.focus();
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pulse-card friends-activity" aria-labelledby="friends-activity-title">
      <header className="pulse-card-header">
        <h2 id="friends-activity-title">Friends</h2>
        <button type="button" className="text-link" onClick={onOpenFriends}>
          {state.kind === 'locked' ? 'Share' : 'See all'}
        </button>
      </header>
      {state.kind === 'loading' ? (
        <p className="pulse-empty-line">Loading your friends’ sessions…</p>
      ) : state.kind === 'locked' ? (
        <p className="pulse-empty-line">
          Share your profile to follow friends and react to their workouts here.
        </p>
      ) : state.kind === 'error' ? (
        <p className="pulse-empty-line">Friends’ sessions could not be loaded.</p>
      ) : state.items.length === 0 ? (
        <p className="pulse-empty-line">
          {state.following === 0
            ? 'Follow friends from Profile to see their latest workouts here.'
            : 'Your friends have not logged a workout yet.'}
        </p>
      ) : (
        <ul className={`friend-activity-list${picking ? ' is-picking' : ''}`}>
          {state.items.map((item) => {
            const session = friendSession(item.workout);
            const summary = reactionSummary(item.reactions.counts);
            const open = picking === item.workout.id;
            const yours = item.reactions.yours;
            const subject = `${item.friend.display_name}’s ${item.workout.name}`;
            return (
              <li key={item.workout.id} className={open ? 'is-picking' : undefined}>
                <button
                  type="button"
                  className="friend-activity-open"
                  onClick={() => onOpenFriend(item.friend)}
                >
                  <ProfileAvatar
                    className="shared-profile-avatar small"
                    user={{ ...item.friend, username: '' }}
                  />
                  <span className="friend-activity-copy">
                    <b>{item.friend.display_name}</b>
                    <span className="friend-activity-session">
                      <span
                        className={`friend-activity-kind ${session.cardio ? 'cardio' : 'strength'}`}
                      >
                        {session.cardio ? 'Cardio' : 'Strength'}
                      </span>
                      <span className="friend-activity-title">{session.title}</span>
                    </span>
                    <span className="friend-activity-meta">
                      {[relativeDay(item.workout.workout_date, today), session.detail]
                        .filter(Boolean)
                        .join(' · ')}
                      {summary.total > 0 && (
                        <span
                          className="friend-activity-reactions"
                          aria-label={`${summary.total} ${summary.total === 1 ? 'reaction' : 'reactions'}`}
                        >
                          <span aria-hidden="true">{summary.emojis.join('')}</span>
                          <span aria-hidden="true">{summary.total}</span>
                        </span>
                      )}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`friend-react-button${yours ? ' is-yours' : ''}`}
                  aria-label={
                    yours
                      ? `Your reaction to ${subject}: ${REACTIONS.find((entry) => entry.kind === yours)?.label}. Change reaction`
                      : `React to ${subject}`
                  }
                  aria-expanded={open}
                  aria-haspopup="true"
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    setError(null);
                    setPicking(open ? null : item.workout.id);
                  }}
                >
                  {yours ? (
                    <span aria-hidden="true">{reactionEmoji(yours)}</span>
                  ) : (
                    <Icon name="react" />
                  )}
                </button>
                {open && (
                  <div
                    ref={picker}
                    className="friend-react-picker"
                    role="group"
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
                        onClick={() => void react(item, kind)}
                      >
                        <span aria-hidden="true">{emoji}</span>
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
