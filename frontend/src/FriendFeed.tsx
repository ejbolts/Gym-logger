import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { authErrorMessage } from './authForm';
import { ProfileAvatar } from './ProfileAvatar';
import { feedWorkoutSummary, nextReaction, REACTIONS } from './friendFeedData';
import { shortDate } from './trainingSummary';
import type { FriendFeedItem, WorkoutReactionKind, WorkoutReactions } from './types';

type FeedState =
  | { kind: 'loading' }
  | { kind: 'locked' }
  | { kind: 'error' }
  | { kind: 'ready'; items: FriendFeedItem[] };

/** Home's feed of the newest workouts across the people you follow, with reactions. */
export function FriendFeedCard({
  active,
  onOpenFriend,
  onOpenFriends,
}: {
  active: boolean;
  onOpenFriend: (friend: FriendFeedItem['friend']) => void;
  onOpenFriends: () => void;
}) {
  const [state, setState] = useState<FeedState>({ kind: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Refreshed whenever Home is shown, so new workouts and reactions appear.
    if (!active) return;
    let cancelled = false;
    api.sharing
      .feed()
      .then((items) => {
        if (!cancelled) setState({ kind: 'ready', items });
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
    if (busyId) return;
    setBusyId(item.workout.id);
    setError(null);
    try {
      const next = nextReaction(item.reactions.yours, chosen);
      updateReactions(
        item.workout.id,
        next
          ? await api.sharing.react(item.workout.id, next)
          : await api.sharing.removeReaction(item.workout.id),
      );
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="pulse-card friend-feed" aria-labelledby="friend-feed-title">
      <header className="pulse-card-header">
        <h2 id="friend-feed-title">Friends’ workouts</h2>
        <button type="button" className="text-link" onClick={onOpenFriends}>
          {state.kind === 'locked' ? 'Share' : 'Friends'}
        </button>
      </header>
      {state.kind === 'loading' ? (
        <p className="pulse-empty-line">Loading recent workouts…</p>
      ) : state.kind === 'locked' ? (
        <p className="pulse-empty-line">
          Share your profile to follow friends and react to their workouts here.
        </p>
      ) : state.kind === 'error' ? (
        <p className="pulse-empty-line">Recent workouts could not be loaded.</p>
      ) : state.items.length === 0 ? (
        <p className="pulse-empty-line">
          Workouts from people you follow will appear here for you to react to.
        </p>
      ) : (
        <ul className="friend-feed-list">
          {state.items.map((item) => (
            <li key={item.workout.id}>
              <button
                type="button"
                className="friend-feed-workout"
                onClick={() => onOpenFriend(item.friend)}
              >
                <ProfileAvatar
                  className="shared-profile-avatar small"
                  user={{ ...item.friend, username: '' }}
                />
                <span className="record-copy">
                  <b>
                    {item.friend.display_name} · {item.workout.name}
                  </b>
                  <small>
                    {shortDate(item.workout.workout_date)} · {feedWorkoutSummary(item.workout)}
                  </small>
                </span>
              </button>
              <div
                className="friend-feed-reactions"
                role="group"
                aria-label={`React to ${item.friend.display_name}’s ${item.workout.name}`}
                aria-busy={busyId === item.workout.id}
              >
                {REACTIONS.map(({ kind, emoji, label }) => {
                  const count =
                    item.reactions.counts.find((entry) => entry.reaction === kind)?.count ?? 0;
                  const yours = item.reactions.yours === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      className={yours ? 'is-yours' : undefined}
                      aria-pressed={yours}
                      aria-label={`${label}${count ? `, ${count}` : ''}`}
                      disabled={busyId !== null}
                      onClick={() => void react(item, kind)}
                    >
                      <span aria-hidden="true">{emoji}</span>
                      {count > 0 && <b className="num">{count}</b>}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
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
