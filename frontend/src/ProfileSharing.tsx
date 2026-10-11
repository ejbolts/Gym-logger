import { useEffect, useState } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import type { SharingChoices } from './types';

type OptionalChoice = Exclude<keyof SharingChoices, 'enabled'>;

const SHARING_OPTIONS: Array<{ key: OptionalChoice; label: string; description: string }> = [
  {
    key: 'share_body_weight',
    label: 'Body weight',
    description: 'Weigh-ins, body fat and body weight logged with sets',
  },
  {
    key: 'share_goals',
    label: 'Goals',
    description: 'Your body-weight goal and weekly Zone 2 cardio target',
  },
  {
    key: 'share_cardio',
    label: 'Cardio sessions',
    description: 'Recent sessions with time, distance, calories and heart rate',
  },
  {
    key: 'share_notes',
    label: 'Notes',
    description: 'Workout, exercise, set and cardio notes, including saved video links',
  },
  {
    key: 'share_profile_photo',
    label: 'Profile photo',
    description: 'Show your photo instead of your initial',
  },
];

const NOT_SHARING: SharingChoices = {
  enabled: false,
  share_notes: false,
  share_cardio: false,
  share_body_weight: false,
  share_goals: false,
  share_profile_photo: false,
};

function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}

/** Profile's sharing section: what to share, and the agreement that unlocks other profiles. */
export function ProfileSharingPanel({
  onOpenSharedProfiles,
}: {
  onOpenSharedProfiles: () => void;
}) {
  const [saved, setSaved] = useState<SharingChoices | null>(null);
  const [draft, setDraft] = useState<SharingChoices>(NOT_SHARING);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.sharing
      .choices()
      .then((choices) => {
        if (cancelled) return;
        setSaved(choices);
        setDraft(choices);
        setLoadError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLoadError(authErrorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  async function save(next: SharingChoices, message: string) {
    if (saving) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const stored = await api.sharing.updateChoices(next);
      setSaved(stored);
      setDraft(stored);
      setStatus(message);
    } catch (reason) {
      setDraft(saved ?? NOT_SHARING);
      setError(authErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: OptionalChoice) {
    const next = { ...draft, [key]: !draft[key] };
    // Before agreeing, choices are only a draft; once sharing, each change saves at once.
    if (saved?.enabled) void save(next, 'Sharing choices saved.');
    else {
      setDraft(next);
      setStatus(null);
    }
  }

  const sharing = saved?.enabled === true;

  return (
    <section
      className="settings-panel panel profile-sharing"
      aria-labelledby="profile-sharing-title"
      aria-busy={saving}
    >
      <header>
        <div>
          <p className="section-kicker">SHARING</p>
          <h2 id="profile-sharing-title">Profile sharing</h2>
        </div>
        {saved && (
          <span className={`sharing-state ${sharing ? 'is-on' : ''}`}>
            {sharing ? 'Sharing' : 'Private'}
          </span>
        )}
      </header>
      <p>
        {sharing
          ? 'Members who share their own profile can see what you share below, and you can see theirs.'
          : 'Share your training with other members of this Gym Logger. Only members who also share can see your profile, and sharing lets you see theirs.'}
      </p>
      {loadError ? (
        <div className="sharing-load-error">
          <p className="inline-error" role="alert">
            {loadError}
          </p>
          <button
            type="button"
            className="profile-secondary"
            onClick={() => {
              setLoadError(null);
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : !saved ? (
        <p className="sharing-loading" role="status">
          Loading your sharing choices…
        </p>
      ) : (
        <>
          <div className="sharing-options" role="group" aria-label="What to share">
            <div className="notification-setting-row">
              <div>
                <strong>Workouts</strong>
                <small>Exercises, sets, dates and durations. Required to see others.</small>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Workouts"
                aria-checked="true"
                aria-disabled="true"
                className="is-on is-locked"
              >
                <span />
                Required
              </button>
            </div>
            {SHARING_OPTIONS.map((option) => (
              <div className="notification-setting-row" key={option.key}>
                <div>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label={option.label}
                  aria-checked={draft[option.key]}
                  className={draft[option.key] ? 'is-on' : ''}
                  disabled={saving}
                  onClick={() => toggle(option.key)}
                >
                  <span />
                  {draft[option.key] ? 'On' : 'Off'}
                </button>
              </div>
            ))}
          </div>
          <small className="sharing-never">
            Never shared: your username, machine photos, videos and sample data.
          </small>
          <div aria-live="polite" aria-atomic="true">
            {status && (
              <p className="notification-setting-status" role="status">
                {status}
              </p>
            )}
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </div>
          {sharing ? (
            <div className="sharing-actions">
              <button type="button" className="profile-primary" onClick={onOpenSharedProfiles}>
                View shared profiles
              </button>
              <button
                type="button"
                className="profile-secondary"
                disabled={saving}
                onClick={() =>
                  void save(
                    { ...draft, enabled: false },
                    'Sharing stopped. Your profile is private again.',
                  )
                }
              >
                {saving && <Spinner />}
                <span>Stop sharing</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="profile-primary sharing-start"
              disabled={saving}
              onClick={() =>
                void save(
                  { ...draft, enabled: true },
                  'Your profile is shared. You can now see other shared profiles.',
                )
              }
            >
              {saving && <Spinner />}
              <span>{saving ? 'Sharing…' : 'Share my profile'}</span>
            </button>
          )}
        </>
      )}
    </section>
  );
}
