import { useEffect, useState } from 'react';
import { api } from './api';
import { authErrorMessage } from './authForm';
import { VISIBILITY_LABELS } from './sharedProfileDisplay';
import type { ProfileVisibility, SharingChoices, SharingSettings } from './types';

type OptionalChoice = Exclude<keyof SharingChoices, 'visibility'>;

const VISIBILITY_OPTIONS: Array<{ value: ProfileVisibility; description: string }> = [
  { value: 'private', description: 'Only you. You cannot see or follow other members.' },
  {
    value: 'followers',
    description: 'Followers you approve. Others see only your name and photo.',
  },
  { value: 'public', description: 'Every member who shares. Anyone sharing can follow you.' },
];

const ALWAYS_SHARED = [
  { label: 'Workouts', description: 'Exercises, sets, dates and durations' },
  { label: 'Profile photo', description: 'Shown with your name, even before someone follows you' },
];

const SHARING_OPTIONS: Array<{ key: OptionalChoice; label: string; description: string }> = [
  {
    key: 'share_machine_photos',
    label: 'Machine photos',
    description: 'Photos pinned to exercises in your shared workouts',
  },
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
];

const VISIBILITY_SAVED: Record<ProfileVisibility, string> = {
  private: 'Your profile is private. Nobody else can see it.',
  followers: 'Your profile is shared with followers you approve.',
  public: 'Your profile is public to every member who shares.',
};

const PRIVATE_DEFAULTS: SharingChoices = {
  visibility: 'private',
  share_notes: false,
  share_cardio: false,
  share_body_weight: false,
  share_goals: false,
  share_machine_photos: false,
};

function choicesFrom(settings: SharingSettings): SharingChoices {
  return {
    visibility: settings.visibility,
    share_notes: settings.share_notes,
    share_cardio: settings.share_cardio,
    share_body_weight: settings.share_body_weight,
    share_goals: settings.share_goals,
    share_machine_photos: settings.share_machine_photos,
  };
}

function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}

/** Profile's sharing section: who can see the profile, and what it shares. */
export function ProfileSharingPanel({
  onOpenSharedProfiles,
}: {
  onOpenSharedProfiles: () => void;
}) {
  const [saved, setSaved] = useState<SharingSettings | null>(null);
  const [draft, setDraft] = useState<SharingChoices>(PRIVATE_DEFAULTS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.sharing
      .choices()
      .then((settings) => {
        if (cancelled) return;
        setSaved(settings);
        setDraft(choicesFrom(settings));
        setLoadError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLoadError(authErrorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const sharing = saved !== null && saved.visibility !== 'private';

  async function save(next: SharingChoices, message: string) {
    if (saving) return;
    setSaving(true);
    setDraft(next);
    setStatus(null);
    setError(null);
    try {
      const stored = await api.sharing.updateChoices(next);
      setSaved(stored);
      setDraft(choicesFrom(stored));
      setStatus(message);
    } catch (reason) {
      setDraft(saved ? choicesFrom(saved) : PRIVATE_DEFAULTS);
      setError(authErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  // While private, choices are a draft until the owner agrees to share; afterwards each
  // change saves at once.
  function change(next: SharingChoices, message: string) {
    if (sharing) void save(next, message);
    else {
      setDraft(next);
      setStatus(null);
    }
  }

  const requests = saved?.pending_requests ?? 0;

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
            {VISIBILITY_LABELS[saved.visibility]}
          </span>
        )}
      </header>
      <p>
        Choose who can see your training. Only members who share their own profile can see or follow
        others.
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
          <fieldset className="sharing-visibility" disabled={saving}>
            <legend>Who can see your profile</legend>
            {VISIBILITY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={draft.visibility === option.value ? 'is-selected' : undefined}
              >
                <input
                  type="radio"
                  name="profile-visibility"
                  value={option.value}
                  checked={draft.visibility === option.value}
                  onChange={() =>
                    change({ ...draft, visibility: option.value }, VISIBILITY_SAVED[option.value])
                  }
                />
                <span>
                  <strong>{VISIBILITY_LABELS[option.value]}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="sharing-options" role="group" aria-label="What to share">
            <p className="sharing-group-title">What you share</p>
            {ALWAYS_SHARED.map((item) => (
              <div className="notification-setting-row" key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label={item.label}
                  aria-checked="true"
                  aria-disabled="true"
                  className="is-on is-locked"
                >
                  <span />
                  Always
                </button>
              </div>
            ))}
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
                  onClick={() =>
                    change({ ...draft, [option.key]: !draft[option.key] }, 'Sharing choices saved.')
                  }
                >
                  <span />
                  {draft[option.key] ? 'On' : 'Off'}
                </button>
              </div>
            ))}
          </div>
          <small className="sharing-never">
            Never shared: your username, videos and sample data.
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
          {!sharing && draft.visibility !== 'private' && (
            <button
              type="button"
              className="profile-primary sharing-start"
              disabled={saving}
              onClick={() => void save(draft, VISIBILITY_SAVED[draft.visibility])}
            >
              {saving && <Spinner />}
              <span>
                {draft.visibility === 'public' ? 'Make my profile public' : 'Share with friends'}
              </span>
            </button>
          )}
          {(sharing || requests > 0) && (
            <div className="sharing-actions">
              {requests > 0 && (
                <button type="button" className="profile-primary" onClick={onOpenSharedProfiles}>
                  Review {requests} follow {requests === 1 ? 'request' : 'requests'}
                </button>
              )}
              {sharing && (
                <button
                  type="button"
                  className={requests > 0 ? 'profile-secondary' : 'profile-primary'}
                  onClick={onOpenSharedProfiles}
                >
                  View shared profiles
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
