import { useWeightUnit } from './trainingPreferencesContext';
import { formatWeight, weightFromKg, type WeightUnit } from './weightUnits';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { authErrorMessage } from './authForm';
import { clipBodyWeightGoalPath } from './bodyTrend';
import { CollapsibleSection } from './CollapsibleSection';
import { Icon } from './Icon';
import { ProfileAvatar } from './ProfileAvatar';
import { formatMemberSince } from './profileDisplay';
import { TrendChart, type GoalPath } from './PulseCharts';
import {
  followActionLabel,
  followSinceLabel,
  plural,
  SHARED_WORKOUT_PAGE_SIZE,
  VISIBILITY_LABELS,
  workoutActivitySummary,
} from './sharedProfileDisplay';
import { addDays, dayMonth, parseLocalDate } from './trainingSummary';
import type {
  FollowStatus,
  PersonalRecord,
  SharedBodyMeasurement,
  SharedCardioSession,
  SharedGoals,
  SharedProfile,
  SharedProfileSummary,
  SharingConnection,
  SharingConnections,
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

function avatarUser(member: { display_name: string; profile_photo_url: string | null }) {
  return {
    display_name: member.display_name,
    username: '',
    profile_photo_url: member.profile_photo_url,
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
        Your profile is private. Share it with friends or everyone in Profile to see and follow
        other members; your workouts and profile photo are always part of it.
      </p>
      <button type="button" className="profile-primary" onClick={onChooseSharing}>
        Choose who can see your profile
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

/** Follow, request to follow, withdraw a request, or unfollow. */
function FollowButton({
  profile,
  compact = false,
  onChange,
}: {
  profile: SharedProfileSummary;
  compact?: boolean;
  onChange: (status: FollowStatus) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (profile.is_you) return null;
  const following = profile.follow_status !== 'none';
  const label =
    profile.follow_status === 'pending'
      ? 'Cancel request'
      : profile.follow_status === 'accepted'
        ? 'Unfollow'
        : followActionLabel(profile);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (following) {
        await api.sharing.unfollow(profile.id);
        onChange('none');
      } else {
        onChange((await api.sharing.follow(profile.id)).status);
      }
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? 'shared-follow compact' : 'shared-follow'}>
      <button
        type="button"
        className={following ? 'profile-secondary' : 'profile-primary'}
        disabled={busy}
        aria-label={compact ? `${label}: ${profile.display_name}` : undefined}
        onClick={() => void run()}
      >
        {busy && <span className="auth-spinner" aria-hidden="true" />}
        <span>{label}</span>
      </button>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function StatusChips({ profile }: { profile: SharedProfileSummary }) {
  return (
    <span className="shared-status-chips">
      {profile.is_you && <span className="profile-badge">You</span>}
      <em className={`visibility-${profile.visibility}`}>
        {VISIBILITY_LABELS[profile.visibility]}
      </em>
      {profile.follow_status === 'accepted' && (
        <em>{followSinceLabel('Following', profile.following_since)}</em>
      )}
      {profile.follow_status === 'pending' && <em>Requested</em>}
      {profile.follows_you && <em>{followSinceLabel('Follows you', profile.follows_you_since)}</em>}
    </span>
  );
}

function FriendRow({
  person,
  detail,
  onOpen,
  actions,
}: {
  person: { display_name: string; profile_photo_url: string | null };
  detail: string;
  onOpen?: () => void;
  actions?: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        className="friend-open"
        disabled={!onOpen}
        aria-label={onOpen ? `Open ${person.display_name}'s profile` : undefined}
        onClick={onOpen}
      >
        <ProfileAvatar className="shared-profile-avatar small" user={avatarUser(person)} />
        <span className="shared-connection-copy">
          <strong>{person.display_name}</strong>
          <small>{detail}</small>
        </span>
        {onOpen && !actions && <Icon name="chevron-right" />}
      </button>
      {actions && <span className="shared-connection-actions">{actions}</span>}
    </li>
  );
}

function FriendGroup({
  title,
  count,
  emptyText,
  highlighted = false,
  children,
}: {
  title: string;
  count?: number;
  emptyText: string;
  highlighted?: boolean;
  children: ReactNode[];
}) {
  return (
    <div className={`friend-group${highlighted ? ' friend-requests' : ''}`}>
      <h3>
        {title}
        {count !== undefined && <span>{count}</span>}
      </h3>
      {children.length === 0 ? (
        <p className="shared-card-empty">{emptyText}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </div>
  );
}

/** Profile's Friends section: follow requests, who you follow, your followers and people to find. */
export function FriendsPanel({
  active,
  refreshKey,
  onOpenProfile,
}: {
  active: boolean;
  refreshKey: number;
  onOpenProfile: (profile: SharedProfileSummary) => void;
}) {
  const [profiles, setProfiles] = useState<SharedProfileSummary[] | null>(null);
  const [connections, setConnections] = useState<SharingConnections | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    // Refreshed whenever Profile is shown or sharing changes, so follows appear straight away.
    if (!active) return;
    let cancelled = false;
    api.sharing
      .connections()
      .then((next) => {
        if (!cancelled) setConnections(next);
      })
      .catch(() => undefined);
    api.sharing
      .profiles()
      .then((next) => {
        if (cancelled) return;
        setProfiles(next);
        setState('ready');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setProfiles(null);
        setState(loadStateFor(reason));
        setError(authErrorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [active, attempt, refreshKey]);

  function updateProfile(id: string, change: Partial<SharedProfileSummary>) {
    setProfiles(
      (current) => current?.map((item) => (item.id === id ? { ...item, ...change } : item)) ?? null,
    );
  }

  async function respond(person: SharingConnection, action: 'approve' | 'remove') {
    if (busyId) return;
    setBusyId(person.id);
    setActionError(null);
    try {
      if (action === 'approve') await api.sharing.approveFollower(person.id);
      else await api.sharing.removeFollower(person.id);
      const next = await api.sharing.connections();
      setConnections(next);
      updateProfile(person.id, {
        follows_you: action === 'approve',
        follows_you_since: next.followers.find((item) => item.id === person.id)?.since ?? null,
      });
    } catch (reason) {
      setActionError(authErrorMessage(reason));
    } finally {
      setBusyId(null);
    }
  }

  const others = profiles?.filter((profile) => !profile.is_you) ?? [];
  const following = others.filter((profile) => profile.follow_status !== 'none');
  const discover = others.filter((profile) => profile.follow_status === 'none');
  const openFor = (id: string) => {
    const profile = others.find((item) => item.id === id);
    return profile ? () => onOpenProfile(profile) : undefined;
  };
  const requestCount = state === 'locked' ? 0 : (connections?.requests.length ?? 0);

  return (
    <CollapsibleSection
      className="settings-panel panel sharing-connections friends-panel"
      kicker="SOCIAL"
      title="Friends"
      defaultExpanded
      badge={
        requestCount > 0 && (
          <span className="sharing-state is-on">
            {requestCount} {requestCount === 1 ? 'request' : 'requests'}
          </span>
        )
      }
    >
      {state === 'locked' ? (
        <p className="shared-card-empty">
          Share your profile above to see and follow other members.
        </p>
      ) : state === 'error' && !profiles ? (
        <div className="sharing-load-error">
          <p className="inline-error" role="alert">
            {error ?? 'Could not load your friends.'}
          </p>
          <button
            type="button"
            className="profile-secondary"
            onClick={() => setAttempt((count) => count + 1)}
          >
            Try again
          </button>
        </div>
      ) : !profiles ? (
        <p className="sharing-loading" role="status">
          Loading your friends…
        </p>
      ) : (
        <>
          {actionError && (
            <p className="inline-error" role="alert">
              {actionError}
            </p>
          )}
          {connections && connections.requests.length > 0 && (
            <FriendGroup
              title="Follow requests"
              count={connections.requests.length}
              emptyText=""
              highlighted
            >
              {connections.requests.map((person) => (
                <FriendRow
                  key={person.id}
                  person={person}
                  detail={`Asked ${longDate(person.since.slice(0, 10))}`}
                  onOpen={openFor(person.id)}
                  actions={
                    <>
                      <button
                        type="button"
                        className="profile-primary"
                        disabled={busyId !== null}
                        aria-label={`Approve ${person.display_name}`}
                        onClick={() => void respond(person, 'approve')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="profile-secondary"
                        disabled={busyId !== null}
                        aria-label={`Decline ${person.display_name}`}
                        onClick={() => void respond(person, 'remove')}
                      >
                        Decline
                      </button>
                    </>
                  }
                />
              ))}
            </FriendGroup>
          )}
          <FriendGroup
            title="Following"
            count={following.length}
            emptyText="You are not following anyone yet."
          >
            {following.map((profile) => (
              <FriendRow
                key={profile.id}
                person={profile}
                detail={[
                  profile.follow_status === 'accepted'
                    ? followSinceLabel('Following', profile.following_since)
                    : null,
                  workoutActivitySummary(profile),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onOpen={() => onOpenProfile(profile)}
              />
            ))}
          </FriendGroup>
          <FriendGroup
            title="Followers"
            count={connections?.followers.length ?? 0}
            emptyText="Nobody follows you yet."
          >
            {(connections?.followers ?? []).map((person) => (
              <FriendRow
                key={person.id}
                person={person}
                detail={followSinceLabel('Follows you', person.since)}
                onOpen={openFor(person.id)}
                actions={
                  <button
                    type="button"
                    className="profile-secondary"
                    disabled={busyId !== null}
                    aria-label={`Remove ${person.display_name} from your followers`}
                    onClick={() => void respond(person, 'remove')}
                  >
                    Remove
                  </button>
                }
              />
            ))}
          </FriendGroup>
          <FriendGroup
            title="Find people"
            emptyText={
              others.length === 0
                ? 'No one else is sharing yet. Members appear here as soon as they share.'
                : 'You follow everyone who shares.'
            }
          >
            {discover.map((profile) => (
              <FriendRow
                key={profile.id}
                person={profile}
                detail={
                  profile.follows_you
                    ? followSinceLabel('Follows you', profile.follows_you_since)
                    : VISIBILITY_LABELS[profile.visibility]
                }
                onOpen={() => onOpenProfile(profile)}
                actions={
                  <FollowButton
                    compact
                    profile={profile}
                    onChange={(status) =>
                      updateProfile(profile.id, {
                        follow_status: status,
                        can_view: profile.can_view || status === 'accepted',
                      })
                    }
                  />
                }
              />
            ))}
          </FriendGroup>
        </>
      )}
    </CollapsibleSection>
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
  weightUnit: WeightUnit,
): GoalPath | null {
  const goal = goals?.body_weight;
  const clipped = goal ? clipBodyWeightGoalPath(goal, startDate, endDate) : null;
  if (!goal || !clipped) return null;
  return {
    startDate: clipped.start_date,
    startValue: weightFromKg(clipped.start_weight_kg, weightUnit),
    endDate: clipped.target_date,
    endValue: weightFromKg(clipped.target_weight_kg, weightUnit),
    label: `Goal ${formatWeight(goal.target_weight_kg, weightUnit)}`,
  };
}

function BodyWeightCard({
  measurements,
  goals,
}: {
  measurements: SharedBodyMeasurement[];
  goals: SharedGoals | null;
}) {
  const weightUnit = useWeightUnit();
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
              <dd className="num">{formatWeight(latest.weight_kg, weightUnit, 1)}</dd>
            </div>
            {change !== null && (
              <div>
                <dt>{BODY_WEIGHT_CHART_DAYS} days</dt>
                <dd className="num">
                  {change > 0 ? '+' : change < 0 ? '−' : ''}
                  {formatWeight(Math.abs(change), weightUnit, 1)}
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
              points={recent.map((point) => ({
                ...point,
                value: weightFromKg(point.value, weightUnit),
              }))}
              label={`Body weight over the last ${BODY_WEIGHT_CHART_DAYS} days`}
              seriesLabel="Body weight"
              unit={weightUnit}
              area={false}
              goalPath={bodyWeightGoalPath(
                goals,
                recent[0].date,
                recent[recent.length - 1].date,
                weightUnit,
              )}
              height={170}
            />
          )}
        </>
      )}
    </section>
  );
}

function GoalsCard({ goals, latestWeight }: { goals: SharedGoals; latestWeight: number | null }) {
  const weightUnit = useWeightUnit();
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
              {formatWeight(goal.start_weight_kg, weightUnit, 1)} →{' '}
              {formatWeight(goal.target_weight_kg, weightUnit, 1)} by {longDate(goal.target_date)}
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
    async function load() {
      const nextProfile = await api.sharing.profile(profileId);
      // A friends-only profile you do not follow shares only its name and photo.
      const page = nextProfile.can_view
        ? await api.sharing.workouts(profileId, 0, SHARED_WORKOUT_PAGE_SIZE)
        : { workouts: [], personal_records: [], total: 0 };
      if (cancelled) return;
      setProfile(nextProfile);
      setWorkouts(page.workouts);
      setRecords(page.personal_records);
      setTotal(page.total);
      setState('ready');
    }
    load().catch((reason: unknown) => {
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

  function followChanged(status: FollowStatus) {
    if (!profile) return;
    // Gaining or losing access to a friends-only profile changes what it shows.
    setProfile({ ...profile, follow_status: status, following_since: null });
    setAttempt((count) => count + 1);
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
          <p>Its owner has made it private, so their training is hidden again.</p>
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
            <strong>{profile.display_name}</strong>
            <StatusChips profile={profile} />
            {memberSince && <small>Joined {memberSince}</small>}
          </div>
        </div>
        {profile.can_view && (
          <dl className="shared-stat-row">
            <div>
              <dt>Workouts</dt>
              <dd className="num">{(profile.workout_count ?? 0).toLocaleString('en-GB')}</dd>
            </div>
            <div>
              <dt>Last 30 days</dt>
              <dd className="num">{profile.recent_workout_count ?? 0}</dd>
            </div>
            <div>
              <dt>Last workout</dt>
              <dd className="num">
                {profile.last_workout_date ? dayMonth(profile.last_workout_date) : '–'}
              </dd>
            </div>
          </dl>
        )}
        <FollowButton profile={profile} onChange={followChanged} />
        {profile.is_you && (
          <p className="shared-preview-note">
            This is what members who can see your profile see. Change it in Profile.
          </p>
        )}
      </section>
      {!profile.can_view ? (
        <section className="settings-panel panel sharing-locked">
          <header>
            <div>
              <p className="section-kicker">FRIENDS ONLY</p>
              <h2>
                {profile.follow_status === 'pending'
                  ? 'Follow request sent'
                  : `Follow ${profile.display_name} to see their training`}
              </h2>
            </div>
          </header>
          <p>
            {profile.follow_status === 'pending'
              ? `Their workouts appear here once ${profile.display_name} approves your request.`
              : `${profile.display_name} shares with followers they approve. Send a request and their workouts appear here once they accept.`}
          </p>
        </section>
      ) : (
        <>
          {profile.body_weight && (
            <BodyWeightCard measurements={profile.body_weight} goals={profile.goals} />
          )}
          {profile.goals && <GoalsCard goals={profile.goals} latestWeight={latestWeight} />}
          {profile.cardio_sessions && <CardioCard sessions={profile.cardio_sessions} />}
          <section
            className="history-screen shared-workouts"
            aria-labelledby="shared-workouts-title"
          >
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
        </>
      )}
    </section>
  );
}
