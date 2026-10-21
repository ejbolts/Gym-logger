import { useEffect, useState } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { reactionEmoji } from './friendFeedData';
import {
  markNotificationSnapshotRead,
  unreadNotificationReferences,
} from './notificationReadState';
import { ProfileAvatar } from './ProfileAvatar';
import type { SharingConnection, SharingNotifications } from './types';
import './FollowNotifications.css';

function NotificationDate({ since }: { since: string }) {
  return (
    <span className="follow-notification-date">
      {' · '}
      <time dateTime={since}>
        {new Date(since).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </time>
    </span>
  );
}

/** Opening the compact inbox reads displayed notices; requests remain actionable. */
export function FollowNotifications({
  active,
  onOpenFriends,
}: {
  active: boolean;
  onOpenFriends: () => void;
}) {
  const [items, setItems] = useState<SharingNotifications | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let refreshing = false;
    async function refresh() {
      if (document.visibilityState === 'hidden' || refreshing) return;
      refreshing = true;
      try {
        const next = await api.sharing.notifications();
        if (cancelled) return;
        setItems(next);
        setError(null);
        const unread = unreadNotificationReferences(next);
        if (open && unread.length) {
          await api.sharing.markNotificationsRead(unread);
          if (!cancelled)
            setItems((current) => current && markNotificationSnapshotRead(current, unread));
        }
      } catch (reason) {
        if (!cancelled) setError(authErrorMessage(reason));
      } finally {
        refreshing = false;
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [active, open, attempt]);

  async function respond(person: SharingConnection, action: 'accept' | 'decline') {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'accept') await api.sharing.acceptFriend(person.id);
      else await api.sharing.removeFriend(person.id);
      setItems(
        (current) =>
          current && {
            ...current,
            requests: current.requests.filter((item) => item.id !== person.id),
          },
      );
      setAttempt((current) => current + 1);
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const count = items ? unreadNotificationReferences(items).length : 0;
  const total =
    (items?.requests.length ?? 0) + (items?.accepted.length ?? 0) + (items?.reactions?.length ?? 0);
  return (
    <>
      <button
        type="button"
        className="icon-button-pulse follow-notification-button"
        aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon name="bell" />
        {count > 0 && (
          <span className="profile-request-badge" aria-hidden="true">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <PopupDialog
          title="Notifications"
          className="follow-notifications"
          onClose={() => setOpen(false)}
        >
          {error && (
            <p className="inline-error" role="alert">
              {error}{' '}
              <button
                type="button"
                className="text-link"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Try again
              </button>
            </p>
          )}
          {!items && !error && (
            <p className="shared-card-empty" role="status">
              Loading notifications…
            </p>
          )}
          {items && total === 0 && (
            <p className="shared-card-empty">
              You're all caught up. Friend requests, accepted requests and workout reactions appear
              here.
            </p>
          )}
          <ul className="follow-notification-list">
            {items?.requests.map((person) => (
              <li key={`request-${person.id}`}>
                <ProfileAvatar className="profile-avatar" user={{ ...person, username: '' }} />
                <div className="follow-notification-copy">
                  <p>
                    <strong>{person.display_name}</strong> sent you a friend request
                    <NotificationDate since={person.since} />
                  </p>
                  <div className="follow-notification-actions">
                    <button
                      type="button"
                      className="profile-primary"
                      disabled={busy}
                      aria-label={`Accept ${person.display_name}`}
                      onClick={() => void respond(person, 'accept')}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="profile-secondary"
                      disabled={busy}
                      aria-label={`Decline ${person.display_name}`}
                      onClick={() => void respond(person, 'decline')}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </li>
            ))}
            {items?.reactions?.map((notice) => (
              <li key={`reaction-${notice.workout_id}-${notice.id}`}>
                <ProfileAvatar className="profile-avatar" user={{ ...notice, username: '' }} />
                <div className="follow-notification-copy">
                  <p>
                    <strong>{notice.display_name}</strong> reacted to <b>{notice.workout_name}</b>
                    <NotificationDate since={notice.since} />
                  </p>
                </div>
                <span
                  className="follow-notification-emoji"
                  aria-label={`Reacted ${reactionEmoji(notice.reaction)}`}
                >
                  {reactionEmoji(notice.reaction)}
                </span>
              </li>
            ))}
            {items?.accepted.map((person) => (
              <li key={`accepted-${person.id}`}>
                <ProfileAvatar className="profile-avatar" user={{ ...person, username: '' }} />
                <div className="follow-notification-copy">
                  <p>
                    <strong>{person.display_name}</strong> accepted your friend request
                    <NotificationDate since={person.since} />
                  </p>
                </div>
                <Icon name="user" />
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="text-link follow-notification-manage"
            onClick={() => {
              setOpen(false);
              onOpenFriends();
            }}
          >
            Manage friends <Icon name="chevron-right" />
          </button>
        </PopupDialog>
      )}
    </>
  );
}
