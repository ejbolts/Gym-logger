import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { friendSession, reactionSummary, relativeDay } from './friendFeedData';
import { WorkoutReactionControl } from './WorkoutReactionControl';
import { ProfileAvatar } from './ProfileAvatar';
import type { FriendFeedItem, WorkoutReactions } from './types';
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
  const refresh = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let request = 0;
    function load() {
      if (document.visibilityState === 'hidden') return;
      const current = ++request;
      api.sharing
        .feed()
        .then((feed) => {
          if (cancelled || current !== request) return;
          setState({ kind: 'ready', ...feed });
          setPicking((id) => (feed.items.some((item) => item.workout.id === id) ? id : null));
        })
        .catch((reason: unknown) => {
          if (cancelled || current !== request) return;
          setState(
            reason instanceof ApiError && reason.code === 'sharing_required'
              ? { kind: 'locked' }
              : { kind: 'error' },
          );
        });
    }
    refresh.current = load;
    load();
    const timer = window.setInterval(load, 30_000);
    window.addEventListener('focus', load);
    window.addEventListener('online', load);
    document.addEventListener('visibilitychange', load);
    return () => {
      cancelled = true;
      refresh.current = () => undefined;
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
      window.removeEventListener('online', load);
      document.removeEventListener('visibilitychange', load);
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
    refresh.current();
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
                <WorkoutReactionControl
                  workoutId={item.workout.id}
                  subject={subject}
                  reactions={item.reactions}
                  open={open}
                  onOpenChange={(value) =>
                    setPicking((current) =>
                      value ? item.workout.id : current === item.workout.id ? null : current,
                    )
                  }
                  onChange={(value) => updateReactions(item.workout.id, value)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
