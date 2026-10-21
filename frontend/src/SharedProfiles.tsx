import { useWeightUnit } from './trainingPreferencesContext';
import { bodyGoalKind } from './bodyMeasurementHistory';
import { formatWeight, weightFromKg, type WeightUnit } from './weightUnits';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { authErrorMessage } from './authForm';
import { clipBodyWeightGoalPath } from './bodyTrend';
import { CollapsibleSection } from './CollapsibleSection';
import { Icon } from './Icon';
import { ProfileAvatar } from './ProfileAvatar';
import { ProfileAccountId } from './ProfileAccountId';
import { SharedWorkoutFilters } from './SharedWorkoutFilters';
import { ConsistencyCard } from './ConsistencyCard';
import { WorkoutCalendar, WorkoutCalendarLegend } from './WorkoutCalendar';
import { builtinTypeColors, calendarLegendTypes } from './workoutTypes';
import { TrainingTimeStats } from './TrainingTimeStats';
import { WorkoutReactionControl } from './WorkoutReactionControl';
import { PopupDialog } from './PopupDialog';
import { formatMemberSince } from './profileDisplay';
import { TrendChart, type GoalPath } from './PulseCharts';
import {
  followActionLabel,
  followSinceLabel,
  plural,
  SHARED_WORKOUT_PAGE_SIZE,
  sinceMonthLabel,
  VISIBILITY_LABELS,
  workoutActivitySummary,
} from './sharedProfileDisplay';
import { addDays, dayMonth, parseLocalDate } from './trainingSummary';
import type {
  FollowStatus,
  MachinePhoto,
  PersonalRecord,
  SharedBodyMeasurement,
  SharedCardioSession,
  SharedGoals,
  SharedProfile,
  SharedProfileSummary,
  SharedConsistency,
  SharedWorkoutFilters as WorkoutFilters,
  SharedWorkoutFilterOptions,
  SharingConnection,
  SharingConnections,
  TrackedWorkout,
  WorkoutReactions,
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
        className={
          profile.follow_status === 'accepted'
            ? 'profile-danger'
            : following
              ? 'profile-secondary'
              : 'profile-primary'
        }
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

/** A profile page's follow control: Follow, then Following or Requested with a menu to undo it. */
function ProfileFollowControl({
  profile,
  onChange,
}: {
  profile: SharedProfileSummary;
  onChange: (status: FollowStatus) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  if (profile.is_you) return null;
  const pending = profile.follow_status === 'pending';
  const since = pending ? null : sinceMonthLabel(profile.following_since);

  async function run(action: () => Promise<FollowStatus>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const status = await action();
      setOpen(false);
      onChange(status);
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shared-follow profile-follow">
      {profile.follow_status === 'none' ? (
        <button
          type="button"
          className="profile-follow-button is-follow"
          disabled={busy}
          onClick={() => void run(async () => (await api.sharing.follow(profile.id)).status)}
        >
          {busy && <span className="auth-spinner" aria-hidden="true" />}
          <span>{followActionLabel(profile)}</span>
        </button>
      ) : (
        <div className="profile-follow-menu-wrap">
          <button
            ref={trigger}
            type="button"
            className="profile-follow-button"
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            onClick={() => {
              setError(null);
              setOpen(!open);
            }}
          >
            {busy ? (
              <span className="auth-spinner" aria-hidden="true" />
            ) : (
              !pending && <Icon name="check" />
            )}
            <span>{pending ? 'Requested' : 'Following'}</span>
            <Icon name="chevron-down" />
          </button>
          {open && (
            <div ref={menu} id={menuId} className="profile-follow-menu" role="menu">
              {since && <p>{since}</p>}
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api.sharing.unfollow(profile.id);
                    return 'none';
                  })
                }
              >
                {pending ? 'Cancel request' : 'Unfollow'}
              </button>
            </div>
          )}
        </div>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
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
  help,
  highlighted = false,
  children,
}: {
  title: string;
  count?: number;
  emptyText: string;
  help?: ReactNode;
  highlighted?: boolean;
  children: ReactNode[];
}) {
  return (
    <div className={`friend-group${highlighted ? ' friend-requests' : ''}`}>
      <h3>
        {title}
        {count !== undefined && <span>{count}</span>}
        {help}
      </h3>
      {children.length === 0 ? (
        <p className="shared-card-empty">{emptyText}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </div>
  );
}

export function PeopleSearch({
  active,
  refreshKey,
  onOpenProfile,
  onFollowChanged,
}: {
  active: boolean;
  refreshKey: string;
  onOpenProfile: (profile: SharedProfileSummary) => void;
  onFollowChanged: () => void;
}) {
  const id = useId();
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState({ term: '', serial: 0 });
  const [results, setResults] = useState<SharedProfileSummary[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active || !submitted.term) return;
    let cancelled = false;
    setState('loading');
    setError(null);
    api.sharing
      .profiles(submitted.term)
      .then((profiles) => {
        if (cancelled) return;
        setResults(profiles.filter((profile) => !profile.is_you));
        setState('ready');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(authErrorMessage(reason));
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [active, submitted, refreshKey]);
  return (
    <div className="friend-group people-search">
      <h3>Search people</h3>
      <form
        className="people-search-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim())
            setSubmitted((current) => ({ term: input.trim(), serial: current.serial + 1 }));
        }}
      >
        <label className="sr-only" htmlFor={id}>
          Account name or UUID
        </label>
        <input
          id={id}
          type="search"
          value={input}
          maxLength={100}
          autoComplete="off"
          placeholder="Account name or UUID"
          onChange={(event) => {
            const next = event.target.value;
            setInput(next);
            if (!next.trim()) {
              setSubmitted((current) => ({ term: '', serial: current.serial + 1 }));
              setResults([]);
              setState('idle');
              setError(null);
            }
          }}
        />
        <button
          type="submit"
          className="profile-primary"
          disabled={!input.trim() || (state === 'loading' && input.trim() === submitted.term)}
          aria-busy={state === 'loading'}
        >
          <Icon name="search" /> Search
        </button>
      </form>
      <p className="shared-card-empty">
        Search by display name, username or full UUID. Only shared profiles appear.
      </p>
      {state === 'loading' && (
        <p className="sharing-loading" role="status">
          Searching…
        </p>
      )}
      {state === 'error' && (
        <div className="sharing-load-error">
          <p className="inline-error" role="alert">
            {error ?? 'Could not search people.'}
          </p>
          <button
            type="button"
            className="profile-secondary"
            onClick={() => setSubmitted((current) => ({ ...current, serial: current.serial + 1 }))}
          >
            Try again
          </button>
        </div>
      )}
      {state === 'ready' && (
        <>
          <p className="people-search-summary" role="status">
            {results.length} {results.length === 1 ? 'account' : 'accounts'} found for “
            {submitted.term}”.
          </p>
          {results.length === 0 ? (
            <p className="shared-card-empty">No shared accounts found. Check the name or UUID.</p>
          ) : (
            <ul>
              {results.map((profile) => (
                <FriendRow
                  key={profile.id}
                  person={profile}
                  detail={VISIBILITY_LABELS[profile.visibility]}
                  onOpen={() => onOpenProfile(profile)}
                  actions={<FollowButton compact profile={profile} onChange={onFollowChanged} />}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Profile's Friends section: requests, follows, followers and account search. */
export function FriendsPanel({
  active,
  refreshKey,
  onOpenProfile,
  onChooseSharing,
}: {
  active: boolean;
  refreshKey: number;
  onOpenProfile: (profile: SharedProfileSummary) => void;
  onChooseSharing?: () => void;
}) {
  const [profiles, setProfiles] = useState<SharedProfileSummary[] | null>(null);
  const [connections, setConnections] = useState<SharingConnections | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [blockHelpOpen, setBlockHelpOpen] = useState(false);

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

  async function respond(
    person: SharingConnection,
    action: 'approve' | 'remove' | 'block' | 'unblock',
  ) {
    if (busyId) return;
    setBusyId(person.id);
    setActionError(null);
    try {
      if (action === 'approve') await api.sharing.approveFollower(person.id);
      else if (action === 'block') await api.sharing.blockMember(person.id);
      else if (action === 'unblock') await api.sharing.unblockMember(person.id);
      else await api.sharing.removeFollower(person.id);
      const next = await api.sharing.connections();
      setConnections(next);
      if (action === 'block' || action === 'unblock') {
        if (profiles !== null) setProfiles(await api.sharing.profiles());
        return;
      }
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
        <div className="shared-card-empty">
          <p>Choose profile sharing to see and follow other members.</p>
          {onChooseSharing && (
            <button type="button" className="profile-secondary" onClick={onChooseSharing}>
              Profile sharing
            </button>
          )}
        </div>
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
            help={
              <button
                type="button"
                className="friend-block-help"
                aria-label="About blocking"
                aria-haspopup="dialog"
                onClick={() => setBlockHelpOpen(true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4" />
                  <path d="M12 16.5h.01" />
                </svg>
              </button>
            }
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
                    aria-label={`Block ${person.display_name}`}
                    onClick={() => void respond(person, 'block')}
                  >
                    Block
                  </button>
                }
              />
            ))}
          </FriendGroup>
          <PeopleSearch
            active={active}
            refreshKey={`${refreshKey}:${attempt}:${connections?.blocked?.map((person) => person.id).join(',') ?? ''}`}
            onOpenProfile={onOpenProfile}
            onFollowChanged={() => setAttempt((count) => count + 1)}
          />
        </>
      )}
      {(connections?.blocked?.length ?? 0) > 0 && (
        <FriendGroup title="Blocked" count={connections!.blocked!.length} emptyText="">
          {connections!.blocked!.map((person) => (
            <FriendRow
              key={person.id}
              person={person}
              detail={`Blocked ${longDate(person.since.slice(0, 10))}`}
              actions={
                <button
                  type="button"
                  className="profile-secondary"
                  disabled={busyId !== null}
                  aria-label={`Unblock ${person.display_name}`}
                  onClick={() => void respond(person, 'unblock')}
                >
                  Unblock
                </button>
              }
            />
          ))}
        </FriendGroup>
      )}
      {blockHelpOpen && (
        <PopupDialog
          title="About blocking"
          className="friend-block-dialog"
          onClose={() => setBlockHelpOpen(false)}
        >
          <p>
            Blocking stops this person from seeing your profile, data and recent activity. You also
            stop following each other. You can unblock them in Blocked.
          </p>
        </PopupDialog>
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
  const span =
    goal && bodyGoalKind(goal) !== 'maintain' ? goal.start_weight_kg - goal.target_weight_kg : 0;
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
              {bodyGoalKind(goal) === 'maintain'
                ? `Maintain ${formatWeight(goal.target_weight_kg, weightUnit, 1)} until ${longDate(goal.target_date)}`
                : `${formatWeight(goal.start_weight_kg, weightUnit, 1)} → ${formatWeight(goal.target_weight_kg, weightUnit, 1)} by ${longDate(goal.target_date)}`}
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
  onFilterMachine?: (photo: MachinePhoto) => void;
  renderWorkoutAction?: (workout: TrackedWorkout) => ReactNode;
}

function SharedConsistencyCalendar({
  data,
  onDayClick,
}: {
  data: SharedConsistency;
  onDayClick: (date: string) => void;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const colors = builtinTypeColors(data.workout_types);
  return (
    <ConsistencyCard streak={data.current_streak} trainingDays={data.training_days}>
      <WorkoutCalendar
        entries={data.heatmap}
        types={data.workout_types}
        categoryColors={colors}
        hiddenCategories={hidden}
        readOnly
        onDayClick={onDayClick}
      />
      <WorkoutCalendarLegend
        presentTypes={calendarLegendTypes(data.heatmap, data.workout_types)}
        hiddenCategories={hidden}
        categoryColors={colors}
        onToggle={(id) =>
          setHidden((current) => {
            const next = new Set(current);
            if (!next.delete(id)) next.add(id);
            return next;
          })
        }
      />
    </ConsistencyCard>
  );
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
  const [reactions, setReactions] = useState<Record<string, WorkoutReactions>>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [filters, setFilters] = useState<WorkoutFilters>({
    category: '',
    exercise_id: '',
    machine_photo_id: '',
    start_date: '',
    end_date: '',
  });
  const [filterOptions, setFilterOptions] = useState<SharedWorkoutFilterOptions>({
    exercises: [],
    machines: [],
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loadingWorkouts, setLoadingWorkouts] = useState(false);
  const invalidDates = Boolean(
    filters.start_date && filters.end_date && filters.start_date > filters.end_date,
  );
  const queryKey = JSON.stringify([profileId, attempt, filters]);
  const currentQuery = useRef(queryKey);
  currentQuery.current = queryKey;

  useEffect(() => {
    if (invalidDates) {
      setLoadingWorkouts(false);
      return;
    }
    let cancelled = false;
    setLoadingWorkouts(true);
    setLoadingMore(false);
    setMoreError(null);
    async function load() {
      const nextProfile = await api.sharing.profile(profileId);
      // A friends-only profile you do not follow shares only its name and photo.
      const [page, options] = nextProfile.can_view
        ? await Promise.all([
            api.sharing.workouts(profileId, 0, SHARED_WORKOUT_PAGE_SIZE, filters),
            api.sharing.workoutFilters(profileId),
          ])
        : [
            { workouts: [], personal_records: [], total: 0 },
            { exercises: [], machines: [] },
          ];
      if (cancelled) return;
      setProfile(nextProfile);
      setWorkouts(page.workouts);
      setRecords(page.personal_records);
      setReactions('reactions' in page ? (page.reactions ?? {}) : {});
      setPicking(null);
      setTotal(page.total);
      setFilterOptions(options);
      setState('ready');
    }
    load()
      .catch((reason: unknown) => {
        if (cancelled) return;
        setState(loadStateFor(reason));
        setError(authErrorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setLoadingWorkouts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, attempt, filters, invalidDates]);

  async function loadMore() {
    if (loadingMore || loadingWorkouts || invalidDates) return;
    const requestedQuery = queryKey;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await api.sharing.workouts(
        profileId,
        workouts.length,
        SHARED_WORKOUT_PAGE_SIZE,
        filters,
      );
      if (currentQuery.current !== requestedQuery) return;
      setWorkouts((current) => [
        ...current,
        ...page.workouts.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setRecords((current) => [...current, ...page.personal_records]);
      setReactions((current) => ({ ...current, ...page.reactions }));
      setTotal(page.total);
    } catch (reason) {
      if (currentQuery.current === requestedQuery) setMoreError(authErrorMessage(reason));
    } finally {
      if (currentQuery.current === requestedQuery) setLoadingMore(false);
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
            <strong>
              {profile.display_name}
              {profile.is_you && <span className="profile-badge">You</span>}
            </strong>
            {(memberSince || profile.follows_you) && (
              <span className="shared-status-chips profile-joined">
                {memberSince && <small>Joined {memberSince}</small>}
                {profile.follows_you && <em>Follows you</em>}
              </span>
            )}
            <ProfileFollowControl profile={profile} onChange={followChanged} />
          </div>
        </div>
        <ProfileAccountId accountId={profile.id} />
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
          {profile.consistency && (
            <SharedConsistencyCalendar
              key={profile.id}
              data={profile.consistency}
              onDayClick={(date) => {
                setFilters({
                  category: '',
                  exercise_id: '',
                  machine_photo_id: '',
                  start_date: date,
                  end_date: date,
                });
                setFiltersOpen(true);
                document
                  .getElementById('shared-workouts-title')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
          )}
          {profile.training_time && (
            <section
              className="settings-panel panel profile-training-time"
              aria-labelledby="shared-training-time-title"
            >
              <header>
                <div>
                  <p className="section-kicker">ACTIVITY</p>
                  <h2 id="shared-training-time-title">Time trained</h2>
                </div>
              </header>
              <TrainingTimeStats time={profile.training_time} />
            </section>
          )}
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
            <SharedWorkoutFilters
              filters={filters}
              options={filterOptions}
              open={filtersOpen}
              onToggle={setFiltersOpen}
              onChange={setFilters}
            />
            {invalidDates ? (
              <p className="inline-error" role="alert">
                From date must not be after To date.
              </p>
            ) : loadingWorkouts ? (
              <p className="sharing-loading" role="status">
                Loading workouts…
              </p>
            ) : workouts.length === 0 ? (
              <p className="shared-card-empty">
                {Object.values(filters).some(Boolean)
                  ? 'No workouts match these filters.'
                  : 'No workouts logged yet.'}
              </p>
            ) : (
              renderWorkouts({
                workouts,
                personalRecords: records,
                renderWorkoutAction: profile.is_you
                  ? undefined
                  : (workout) => (
                      <WorkoutReactionControl
                        workoutId={workout.id}
                        subject={`${profile.display_name}’s ${workout.name}`}
                        reactions={reactions[workout.id] ?? { counts: [], yours: null }}
                        open={picking === workout.id}
                        showSummary
                        onOpenChange={(value) =>
                          setPicking((current) =>
                            value ? workout.id : current === workout.id ? null : current,
                          )
                        }
                        onChange={(value) =>
                          setReactions((current) => ({ ...current, [workout.id]: value }))
                        }
                      />
                    ),
                onFilterMachine: (photo) => {
                  setFilters((current) => ({ ...current, machine_photo_id: photo.id }));
                  setFiltersOpen(true);
                },
              })
            )}
            {moreError && (
              <p className="inline-error" role="alert">
                {moreError}
              </p>
            )}
            {!invalidDates && !loadingWorkouts && workouts.length < total && (
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
