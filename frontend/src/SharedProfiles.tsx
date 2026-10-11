import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { authErrorMessage } from './authForm';
import { clipBodyWeightGoalPath } from './bodyTrend';
import { Icon } from './Icon';
import { ProfileAvatar } from './ProfileAvatar';
import { formatMemberSince } from './profileDisplay';
import { TrendChart, type GoalPath } from './PulseCharts';
import {
  plural,
  SHARED_WORKOUT_PAGE_SIZE,
  sharedParts,
  workoutActivitySummary,
} from './sharedProfileDisplay';
import { addDays, dayMonth, formatKg, parseLocalDate } from './trainingSummary';
import type {
  PersonalRecord,
  SharedBodyMeasurement,
  SharedCardioSession,
  SharedGoals,
  SharedProfile,
  SharedProfileSummary,
  TrackedWorkout,
} from './types';
import { formatMinutesDuration } from './utils';

const BODY_WEIGHT_CHART_DAYS = 90;

type LoadState = 'loading' | 'ready' | 'locked' | 'missing' | 'error';

function loadStateFor(reason: unknown): LoadState {
  if (reason instanceof ApiError && reason.code === 'sharing_required') return 'locked';
  if (reason instanceof ApiError && reason.status === 404) return 'missing';
  return 'error';
}

function longDate(value: string): string {
  return parseLocalDate(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function avatarUser(profile: SharedProfileSummary) {
  return {
    display_name: profile.display_name,
    username: '',
    profile_photo_url: profile.profile_photo_url,
  };
}

function SharingLocked({ onChooseSharing }: { onChooseSharing: () => void }) {
  return (
    <section className="settings-panel panel sharing-locked" aria-labelledby="sharing-locked-title">
      <header>
        <div>
          <p className="section-kicker">SHARING</p>
          <h2 id="sharing-locked-title">Share your profile to see others</h2>
        </div>
      </header>
      <p>
        Shared profiles are only visible to members who share their own. Choose what to share in
        Profile; your workouts are the minimum.
      </p>
      <button type="button" className="profile-primary" onClick={onChooseSharing}>
        Choose what to share
      </button>
    </section>
  );
}

function LoadProblem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="settings-panel panel">
      <p className="inline-error" role="alert">
        {message}
      </p>
      <button type="button" className="profile-secondary" onClick={onRetry}>
        Try again
      </button>
    </section>
  );
}

export function SharedProfilesScreen({
  active,
  onOpenProfile,
  onChooseSharing,
}: {
  active: boolean;
  onOpenProfile: (profile: SharedProfileSummary) => void;
  onChooseSharing: () => void;
}) {
  const [profiles, setProfiles] = useState<SharedProfileSummary[] | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Refreshed whenever the screen is shown, so sharing changes appear straight away.
    if (!active) return;
    let cancelled = false;
    api.sharing
      .profiles()
      .then((next) => {
        if (cancelled) return;
        setProfiles(next);
        setState('ready');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setState(loadStateFor(reason));
        setError(authErrorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [active, attempt]);

  if (state === 'locked') {
    return (
      <section className="settings-screen shared-profiles-screen content-page">
        <SharingLocked onChooseSharing={onChooseSharing} />
      </section>
    );
  }
  const others = profiles?.filter((profile) => !profile.is_you) ?? [];

  return (
    <section className="settings-screen shared-profiles-screen content-page">
      {state === 'error' && !profiles ? (
        <LoadProblem
          message={error ?? 'Could not load shared profiles.'}
          onRetry={() => setAttempt((count) => count + 1)}
        />
      ) : !profiles ? (
        <p className="sharing-loading" role="status">
          Loading shared profiles…
        </p>
      ) : (
        <>
          <ul className="shared-profile-list" aria-label="Shared profiles">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <button
                  type="button"
                  className="shared-profile-card"
                  onClick={() => onOpenProfile(profile)}
                >
                  <ProfileAvatar className="shared-profile-avatar" user={avatarUser(profile)} />
                  <span className="shared-profile-copy">
                    <strong>
                      {profile.display_name}
                      {profile.is_you && <span className="profile-badge">You</span>}
                    </strong>
                    <small>{workoutActivitySummary(profile)}</small>
                    <span className="shared-profile-chips" aria-label="Shares">
                      {sharedParts(profile).map((part) => (
                        <em key={part}>{part}</em>
                      ))}
                    </span>
                  </span>
                  <Icon name="chevron-right" />
                </button>
              </li>
            ))}
          </ul>
          {others.length === 0 && (
            <p className="shared-profiles-empty">
              No one else is sharing yet. Members appear here as soon as they share their profile.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div
      className="shared-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

/** The goal line within the charted dates, labelled like the Body screen's. */
function bodyWeightGoalPath(
  goals: SharedGoals | null,
  startDate: string,
  endDate: string,
): GoalPath | null {
  const goal = goals?.body_weight;
  const clipped = goal ? clipBodyWeightGoalPath(goal, startDate, endDate) : null;
  if (!goal || !clipped) return null;
  return {
    startDate: clipped.start_date,
    startValue: clipped.start_weight_kg,
    endDate: clipped.target_date,
    endValue: clipped.target_weight_kg,
    label: `Goal ${goal.target_weight_kg} kg`,
  };
}

function BodyWeightCard({
  measurements,
  goals,
}: {
  measurements: SharedBodyMeasurement[];
  goals: SharedGoals | null;
}) {
  const latest = measurements[0];
  const recent = useMemo(() => {
    if (!latest) return [];
    const earliest = addDays(latest.measurement_date, -BODY_WEIGHT_CHART_DAYS);
    return measurements
      .filter((item) => item.measurement_date >= earliest)
      .map((item) => ({ date: item.measurement_date, value: item.weight_kg }))
      .reverse();
  }, [latest, measurements]);
  const latestFat = measurements.find((item) => item.body_fat_pct !== null)?.body_fat_pct ?? null;
  const change = recent.length > 1 ? recent[recent.length - 1].value - recent[0].value : null;

  return (
    <section className="pulse-card shared-card" aria-labelledby="shared-body-weight-title">
      <header className="pulse-card-header">
        <h2 id="shared-body-weight-title">Body weight</h2>
        {latest && <span>{dayMonth(latest.measurement_date)}</span>}
      </header>
      {!latest ? (
        <p className="shared-card-empty">No weigh-ins yet.</p>
      ) : (
        <>
          <dl className="shared-stat-row">
            <div>
              <dt>Latest</dt>
              <dd className="num">{formatKg(latest.weight_kg)}</dd>
            </div>
            {change !== null && (
              <div>
                <dt>{BODY_WEIGHT_CHART_DAYS} days</dt>
                <dd className="num">
                  {change > 0 ? '+' : change < 0 ? '−' : ''}
                  {formatKg(Math.abs(change))}
                </dd>
              </div>
            )}
            {latestFat !== null && (
              <div>
                <dt>Body fat</dt>
                <dd className="num">{latestFat}%</dd>
              </div>
            )}
          </dl>
          {recent.length > 1 && (
            <TrendChart
              points={recent}
              label={`Body weight over the last ${BODY_WEIGHT_CHART_DAYS} days`}
              seriesLabel="Body weight"
              unit="kg"
              area={false}
              goalPath={bodyWeightGoalPath(goals, recent[0].date, recent[recent.length - 1].date)}
              height={170}
            />
          )}
        </>
      )}
    </section>
  );
}

function GoalsCard({ goals, latestWeight }: { goals: SharedGoals; latestWeight: number | null }) {
  const goal = goals.body_weight;
  const span = goal ? goal.start_weight_kg - goal.target_weight_kg : 0;
  const progress =
    goal && latestWeight !== null && span !== 0
      ? (goal.start_weight_kg - latestWeight) / span
      : null;

  return (
    <section className="pulse-card shared-card" aria-labelledby="shared-goals-title">
      <header className="pulse-card-header">
        <h2 id="shared-goals-title">Goals</h2>
      </header>
      <div className="shared-goal">
        <strong>Body weight</strong>
        {goal ? (
          <>
            <span>
              {formatKg(goal.start_weight_kg)} → {formatKg(goal.target_weight_kg)} by{' '}
              {longDate(goal.target_date)}
            </span>
            {progress !== null && (
              <>
                <ProgressBar value={progress} label="Body-weight goal progress" />
                <small>{Math.round(Math.min(Math.max(progress, 0), 1) * 100)}% of the way</small>
              </>
            )}
          </>
        ) : (
          <span>No body-weight goal set.</span>
        )}
      </div>
      <div className="shared-goal">
        <strong>Weekly Zone 2 cardio</strong>
        <span>
          {goals.zone2.completed_minutes} of {goals.zone2.goal_minutes} min this week
        </span>
        <ProgressBar value={goals.zone2.percentage / 100} label="Weekly Zone 2 cardio progress" />
      </div>
    </section>
  );
}

function cardioMetrics(session: SharedCardioSession): string {
  return [
    formatMinutesDuration(session.duration_minutes),
    session.distance_km !== null && session.distance_km !== undefined
      ? `${Number(session.distance_km.toFixed(2))} km`
      : null,
    session.calories_kcal !== null && session.calories_kcal !== undefined
      ? `${session.calories_kcal} kcal`
      : null,
    session.average_heart_rate_bpm ? `${session.average_heart_rate_bpm} bpm avg` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function CardioCard({ sessions }: { sessions: SharedCardioSession[] }) {
  return (
    <section className="pulse-card shared-card" aria-labelledby="shared-cardio-title">
      <header className="pulse-card-header">
        <h2 id="shared-cardio-title">Cardio</h2>
        {sessions.length > 0 && <span>Latest {sessions.length}</span>}
      </header>
      {sessions.length === 0 ? (
        <p className="shared-card-empty">No cardio sessions yet.</p>
      ) : (
        <ul className="shared-cardio-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <span className="shared-cardio-date num">{dayMonth(session.session_date)}</span>
              <span>
                <strong>
                  {session.activity_type}
                  {session.qualifies_zone2 && <em>Zone 2</em>}
                </strong>
                <small className="num">{cardioMetrics(session)}</small>
                {session.notes && <small className="shared-cardio-notes">{session.notes}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export interface SharedWorkoutListProps {
  workouts: TrackedWorkout[];
  personalRecords: PersonalRecord[];
}

export function SharedProfileScreen({
  profileId,
  renderWorkouts,
  onChooseSharing,
}: {
  profileId: string;
  /** The workout history list, drawn with the same cards as the account's own history. */
  renderWorkouts: (props: SharedWorkoutListProps) => ReactNode;
  onChooseSharing: () => void;
}) {
  const [profile, setProfile] = useState<SharedProfile | null>(null);
  const [workouts, setWorkouts] = useState<TrackedWorkout[]>([]);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.sharing.profile(profileId),
      api.sharing.workouts(profileId, 0, SHARED_WORKOUT_PAGE_SIZE),
    ])
      .then(([nextProfile, page]) => {
        if (cancelled) return;
        setProfile(nextProfile);
        setWorkouts(page.workouts);
        setRecords(page.personal_records);
        setTotal(page.total);
        setState('ready');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setState(loadStateFor(reason));
        setError(authErrorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, attempt]);

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await api.sharing.workouts(profileId, workouts.length, SHARED_WORKOUT_PAGE_SIZE);
      setWorkouts((current) => [
        ...current,
        ...page.workouts.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setRecords((current) => [...current, ...page.personal_records]);
      setTotal(page.total);
    } catch (reason) {
      setMoreError(authErrorMessage(reason));
    } finally {
      setLoadingMore(false);
    }
  }

  if (state === 'locked') {
    return (
      <section className="settings-screen shared-profile-screen content-page">
        <SharingLocked onChooseSharing={onChooseSharing} />
      </section>
    );
  }
  if (state === 'missing') {
    return (
      <section className="settings-screen shared-profile-screen content-page">
        <section className="settings-panel panel">
          <header>
            <div>
              <p className="section-kicker">SHARING</p>
              <h2>This profile is no longer shared</h2>
            </div>
          </header>
          <p>Its owner has stopped sharing, so their training is private again.</p>
        </section>
      </section>
    );
  }
  if (state === 'error' || !profile) {
    return (
      <section className="settings-screen shared-profile-screen content-page">
        {state === 'error' ? (
          <LoadProblem
            message={error ?? 'Could not load this profile.'}
            onRetry={() => {
              setState('loading');
              setAttempt((count) => count + 1);
            }}
          />
        ) : (
          <p className="sharing-loading" role="status">
            Loading profile…
          </p>
        )}
      </section>
    );
  }

  const memberSince = formatMemberSince(profile.member_since);
  const latestWeight = profile.body_weight?.[0]?.weight_kg ?? null;

  return (
    <section className="settings-screen shared-profile-screen content-page">
      <section className="settings-panel panel profile-summary" aria-label="Shared profile">
        <div className="profile-summary-main">
          <ProfileAvatar className="profile-avatar" user={avatarUser(profile)} />
          <div className="profile-summary-copy">
            <strong>
              {profile.display_name}
              {profile.is_you && <span className="profile-badge">You</span>}
            </strong>
            {memberSince && <small>Member since {memberSince}</small>}
          </div>
        </div>
        <dl className="shared-stat-row">
          <div>
            <dt>Workouts</dt>
            <dd className="num">{profile.workout_count.toLocaleString('en-GB')}</dd>
          </div>
          <div>
            <dt>Last 30 days</dt>
            <dd className="num">{profile.recent_workout_count}</dd>
          </div>
          <div>
            <dt>Last workout</dt>
            <dd className="num">
              {profile.last_workout_date ? dayMonth(profile.last_workout_date) : '–'}
            </dd>
          </div>
        </dl>
        {profile.is_you && (
          <p className="shared-preview-note">
            This is what other sharing members see. Change what you share in Profile.
          </p>
        )}
      </section>
      {profile.body_weight && (
        <BodyWeightCard measurements={profile.body_weight} goals={profile.goals} />
      )}
      {profile.goals && <GoalsCard goals={profile.goals} latestWeight={latestWeight} />}
      {profile.cardio_sessions && <CardioCard sessions={profile.cardio_sessions} />}
      <section className="history-screen shared-workouts" aria-labelledby="shared-workouts-title">
        <header className="history-week-header shared-workouts-header">
          <h2 id="shared-workouts-title">Workouts</h2>
          <span className="num">{plural(total, 'workout')}</span>
        </header>
        {workouts.length === 0 ? (
          <p className="shared-card-empty">No workouts logged yet.</p>
        ) : (
          renderWorkouts({ workouts, personalRecords: records })
        )}
        {moreError && (
          <p className="inline-error" role="alert">
            {moreError}
          </p>
        )}
        {workouts.length < total && (
          <button
            type="button"
            className="show-more-button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? 'Loading…' : `Show more · ${total - workouts.length} older`}
          </button>
        )}
      </section>
    </section>
  );
}
