import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { ProfileAvatar } from './ProfileAvatar';
import {
  friendActivityTotals,
  loadFriendWorkouts,
  type FriendWorkout,
} from './friendsActivityData';
import { Icon } from './Icon';
import { shortDate } from './trainingSummary';
import type { SharedProfileSummary } from './types';

type ActivityState =
  | { kind: 'loading' }
  | { kind: 'locked' }
  | { kind: 'error' }
  | { kind: 'ready'; friends: FriendWorkout[]; following: number };

/** Today's Friends card: the latest workout from each friend you follow. */
export function FriendsActivityCard({
  active,
  onOpenFriend,
  onOpenFriends,
}: {
  active: boolean;
  onOpenFriend: (friend: SharedProfileSummary) => void;
  onOpenFriends: () => void;
}) {
  const [state, setState] = useState<ActivityState>({ kind: 'loading' });

  useEffect(() => {
    // Refreshed whenever Today is shown, so new follows and workouts appear.
    if (!active) return;
    let cancelled = false;
    api.sharing
      .profiles()
      .then(async (profiles) => ({ profiles, friends: await loadFriendWorkouts(profiles) }))
      .then(({ profiles, friends }) => {
        if (cancelled) return;
        const following = profiles.filter(
          (profile) => !profile.is_you && profile.follow_status === 'accepted',
        ).length;
        setState({ kind: 'ready', friends, following });
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

  return (
    <section className="pulse-card friends-activity" aria-labelledby="friends-activity-title">
      <header className="pulse-card-header">
        <h2 id="friends-activity-title">Friends</h2>
        <button type="button" className="text-link" onClick={onOpenFriends}>
          {state.kind === 'locked' ? 'Share' : 'See all'}
        </button>
      </header>
      {state.kind === 'loading' ? (
        <p className="pulse-empty-line">Loading your friends’ workouts…</p>
      ) : state.kind === 'locked' ? (
        <p className="pulse-empty-line">
          Share your profile to follow friends and see their latest workouts here.
        </p>
      ) : state.kind === 'error' ? (
        <p className="pulse-empty-line">Friends’ workouts could not be loaded.</p>
      ) : state.friends.length === 0 ? (
        <p className="pulse-empty-line">
          {state.following === 0
            ? 'Follow friends from Profile to see their latest workouts here.'
            : 'Your friends have not logged a workout yet.'}
        </p>
      ) : (
        <ul className="record-list friend-activity-list">
          {state.friends.map(({ friend, workout }) => (
            <li key={friend.id}>
              <button type="button" onClick={() => onOpenFriend(friend)}>
                <ProfileAvatar
                  className="shared-profile-avatar small"
                  user={{
                    display_name: friend.display_name,
                    username: '',
                    profile_photo_url: friend.profile_photo_url,
                  }}
                />
                <span className="record-copy">
                  <b>{friend.display_name}</b>
                  <small>
                    {workout
                      ? `${workout.name} · ${shortDate(workout.workout_date)}`
                      : `Last workout ${shortDate(friend.last_workout_date!)}`}
                  </small>
                </span>
                <FriendActivityTotals friend={friend} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FriendActivityTotals({ friend }: { friend: SharedProfileSummary }) {
  const totals = friendActivityTotals(friend);
  const description = totals
    .map(({ value, label }) => `${value ?? 0} ${value === 1 ? label[0] : label[1]}`)
    .join(', ');
  return (
    <span className="friend-activity-totals" role="img" aria-label={description}>
      {totals.map(({ key, icon, value }) => (
        <span key={key}>
          <span className={`today-profile-icon ${key}`} aria-hidden="true">
            <Icon name={icon} />
          </span>
          <b className="num">{value == null ? '–' : value.toLocaleString()}</b>
        </span>
      ))}
    </span>
  );
}
