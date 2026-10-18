import { useEffect, useState } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { ProfileAvatar } from './ProfileAvatar';
import type { SharingConnection, SharingConnections } from './types';
import './FollowNotifications.css';

/** Requests remain actionable; new-follower notices can be dismissed independently. */
export function FollowNotifications({
  active,
  onOpenFriends,
}: {
  active: boolean;
  onOpenFriends: () => void;
}) {
  const [items, setItems] = useState<SharingConnections | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void api.sharing
        .notifications()
        .then((next) => {
          if (!cancelled) {
            setItems(next);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) setError(authErrorMessage(reason));
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [active, open]);

  async function respond(person: SharingConnection, action: 'approve' | 'decline' | 'dismiss') {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'approve') await api.sharing.approveFollower(person.id);
      else if (action === 'decline') await api.sharing.removeFollower(person.id);
      else await api.sharing.dismissNotification(person.id, person.since);
      setItems(await api.sharing.notifications());
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const count = (items?.requests.length ?? 0) + (items?.followers.length ?? 0);
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
          kicker="FRIENDS"
          className="follow-notifications"
          onClose={() => setOpen(false)}
        >
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {!items && !error && <p role="status">Loading notifications…</p>}
          {items && count === 0 && (
            <p className="shared-card-empty">
              You're all caught up. Follow requests and new followers will appear here.
            </p>
          )}
          <ul className="follow-notification-list">
            {items?.requests.map((person) => (
              <li key={`request-${person.id}`}>
                <ProfileAvatar className="profile-avatar" user={{ ...person, username: '' }} />
                <div>
                  <strong>{person.display_name}</strong>
                  <p>Requested to follow you</p>
                  <div className="follow-notification-actions">
                    <button
                      type="button"
                      className="profile-primary"
                      disabled={busy}
                      aria-label={`Approve ${person.display_name}`}
                      onClick={() => void respond(person, 'approve')}
                    >
                      Approve
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
            {items?.followers.map((person) => (
              <li key={`follower-${person.id}`}>
                <ProfileAvatar className="profile-avatar" user={{ ...person, username: '' }} />
                <div>
                  <strong>{person.display_name}</strong>
                  <p>Started following you</p>
                  <button
                    type="button"
                    className="profile-secondary"
                    disabled={busy}
                    aria-label={`Dismiss notification from ${person.display_name}`}
                    onClick={() => void respond(person, 'dismiss')}
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="profile-secondary"
            onClick={() => {
              setOpen(false);
              onOpenFriends();
            }}
          >
            Find people and manage friends
          </button>
        </PopupDialog>
      )}
    </>
  );
}
