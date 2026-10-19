import type { MainTab } from './appNavigation';
import { Icon, type IconName } from './Icon';
import { formatElapsed, useElapsedSeconds } from './elapsed';
import { useRestCountdown } from './restTimer';
import { formatSeconds } from './utils';
import type { useHomeLayout } from './useHomeLayout';

const TABS: Array<{ tab: MainTab; label: string; icon: IconName }> = [
  { tab: 'dashboard', label: 'Home', icon: 'home' },
  { tab: 'history', label: 'History', icon: 'calendar' },
  { tab: 'progress', label: 'Progress', icon: 'trend' },
  { tab: 'body', label: 'Body', icon: 'body' },
];

export function AppTabBar({
  active,
  workoutStartedAt,
  restEndsAt = null,
  workoutSaving = false,
  onSelect,
  onStart,
  homeLayout,
}: {
  active: MainTab | null;
  workoutStartedAt: number | null;
  /** While the live workout's rest runs, the button shows a timer counting it down. */
  restEndsAt?: number | null;
  workoutSaving?: boolean;
  onSelect: (tab: MainTab) => void;
  onStart: () => void;
  homeLayout?: ReturnType<typeof useHomeLayout>;
}) {
  const live = workoutStartedAt !== null && !workoutSaving;
  const restLeft = useRestCountdown(live ? restEndsAt : null);
  const resting = restLeft > 0;
  const editing = Boolean(homeLayout?.editing);
  const busy = Boolean(homeLayout?.saving || homeLayout?.dragging);
  const renderTab = ({ tab, label, icon }: (typeof TABS)[number]) => (
    <button
      key={tab}
      data-guide-target={tab === 'dashboard' ? 'today' : tab}
      type="button"
      className={`app-tab ${active === tab ? 'active' : ''}`}
      aria-current={active === tab ? 'page' : undefined}
      onClick={() => onSelect(tab)}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );

  return (
    <nav
      className={`app-tab-bar${editing ? ' is-editing-home' : ''}`}
      aria-label={editing ? 'Home layout controls' : 'Main navigation'}
    >
      <div className="app-tab-items app-tab-navigation" inert={editing} aria-hidden={editing}>
        {TABS.slice(0, 2).map(renderTab)}
        <button
          type="button"
          className={`app-tab app-tab-start ${live ? 'live' : ''}${resting ? ' resting' : ''}`}
          data-guide-target="start"
          aria-label={
            workoutSaving
              ? 'Saving workout'
              : resting
                ? `Resume active workout, rest ${formatSeconds(restLeft)} left`
                : live
                  ? 'Resume active workout'
                  : 'Start workout'
          }
          disabled={workoutSaving}
          onClick={onStart}
        >
          <span className="app-tab-start-bubble">
            {resting ? (
              <Icon name="timer" />
            ) : live ? (
              <i className="live-dot" aria-hidden="true" />
            ) : (
              <Icon name={workoutSaving ? 'check' : 'plus'} />
            )}
          </span>
          <span>
            {workoutSaving ? (
              'Saving'
            ) : resting ? (
              <span className="num">{formatSeconds(restLeft)}</span>
            ) : live ? (
              <LiveElapsed startedAt={workoutStartedAt} />
            ) : (
              'Start'
            )}
          </span>
        </button>
        {TABS.slice(2).map(renderTab)}
      </div>
      {homeLayout && (
        <div className="app-tab-items app-tab-layout" inert={!editing} aria-hidden={!editing}>
          <button
            type="button"
            className="app-tab"
            disabled={busy}
            aria-label="Cancel layout changes"
            onClick={homeLayout.cancel}
          >
            <Icon name="close" />
            <span>Cancel</span>
          </button>
          <button
            type="button"
            className="app-tab app-tab-start app-tab-save"
            disabled={busy}
            aria-label={homeLayout.saving ? 'Saving layout' : 'Save layout'}
            aria-busy={homeLayout.saving}
            onClick={() => void homeLayout.save()}
          >
            <span className="app-tab-start-bubble">
              <Icon name="check" />
            </span>
            <span>{homeLayout.saving ? 'Saving…' : 'Save'}</span>
          </button>
          <button
            type="button"
            className="app-tab"
            disabled={busy}
            aria-label="Reset layout"
            onClick={homeLayout.reset}
          >
            <Icon name="reset" />
            <span>Reset layout</span>
          </button>
        </div>
      )}
      {editing && homeLayout?.error && (
        <p className="app-tab-layout-error" role="alert">
          {homeLayout.error}
        </p>
      )}
    </nav>
  );
}

function LiveElapsed({ startedAt }: { startedAt: number }) {
  const elapsed = useElapsedSeconds(startedAt);
  return <span className="num">{formatElapsed(elapsed)}</span>;
}
