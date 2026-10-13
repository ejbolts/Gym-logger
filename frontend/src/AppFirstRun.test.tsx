// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import releaseMetadata from '../release.json';
import { App } from './App';
import { api } from './api';
import type { BodyMeasurement, DashboardData, TrackedWorkout, User } from './types';
import { UserContext, type UserSession } from './userContext';
import { readDashboardCache, writeDashboardCache } from './workoutCache';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    api: {
      ...original.api,
      dashboard: vi.fn(),
      listExercises: vi.fn(),
      listWorkouts: vi.fn(),
      listBodyMeasurements: vi.fn(),
      listPersonalRecords: vi.fn(),
      getWorkoutTypeColors: vi.fn(),
      deleteSampleData: vi.fn(),
    },
  };
});
vi.mock('./workoutCache', () => ({
  readDashboardCache: vi.fn().mockResolvedValue(null),
  writeDashboardCache: vi.fn().mockResolvedValue(undefined),
  readWorkoutCache: vi.fn().mockResolvedValue(null),
  writeWorkoutCache: vi.fn().mockResolvedValue(undefined),
}));

const sampleWorkout: TrackedWorkout = {
  id: 'sample-workout',
  name: 'Sample push session',
  workout_date: '2026-10-12',
  category: 'push',
  notes: null,
  duration_minutes: 62,
  start_time: null,
  end_time: null,
  is_sample: true,
  created_at: '2026-10-12T10:00:00Z',
  updated_at: '2026-10-12T10:00:00Z',
  movements: [],
};
const sampleMeasurement: BodyMeasurement = {
  id: 'sample-measurement',
  measurement_date: '2026-10-12',
  weight_kg: 83.3,
  body_fat_pct: 17.1,
  notes: null,
  is_sample: true,
  created_at: '2026-10-12T10:00:00Z',
};

let root: Root;
let container: HTMLDivElement;
let accountNumber = 0;

beforeAll(() => {
  // jsdom has no modal dialog support; opening is enough for these tests.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  // The tour scrolls its highlighted controls into view, which jsdom does not lay out.
  Element.prototype.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url === '/release.json'
        ? Promise.resolve(new Response(JSON.stringify(releaseMetadata)))
        : Promise.reject(new TypeError('Failed to fetch')),
    ),
  );
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
  window.localStorage.clear();
  window.localStorage.setItem('gym-logger-reduce-motion', 'reduced');
  window.history.replaceState(null, '', '#dashboard');
  vi.mocked(api.dashboard).mockResolvedValue({ recommendation: null } as unknown as DashboardData);
  vi.mocked(api.listExercises).mockResolvedValue([]);
  vi.mocked(api.listWorkouts).mockResolvedValue([]);
  vi.mocked(api.listBodyMeasurements).mockResolvedValue([]);
  vi.mocked(api.listPersonalRecords).mockResolvedValue([]);
  vi.mocked(api.getWorkoutTypeColors).mockResolvedValue({
    upper: '#8b5cf6',
    lower: '#f59e0b',
    push: '#ef476f',
    pull: '#3b82f6',
    full_body: '#14b8a6',
    cardio: '#22c55e',
    other: '#94a3b8',
  });
  vi.mocked(api.deleteSampleData).mockResolvedValue(undefined);
  vi.mocked(readDashboardCache).mockResolvedValue(null);
  vi.mocked(writeDashboardCache).mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Each test uses its own account, as onboarding and release state are kept per account. */
function nextAccount(): User {
  accountNumber += 1;
  return {
    id: `first-run-${accountNumber}`,
    username: `lifter${accountNumber}`,
    display_name: 'Riley',
    is_admin: false,
    can_upload_videos: false,
    created_at: '2026-10-13T10:00:00Z',
  };
}

async function mount(user: User) {
  const session: UserSession = {
    user,
    updateUser: vi.fn(),
    signOut: vi.fn(),
    accountDeleted: vi.fn(),
  };
  await act(async () =>
    root.render(
      <UserContext.Provider value={session}>
        <App />
      </UserContext.Provider>,
    ),
  );
  // Let the startup data and the release check settle.
  for (let index = 0; index < 3; index += 1) await act(async () => undefined);
}

const text = () => document.body.textContent ?? '';
const releaseSeenKey = (user: User) =>
  `gym-logger-release-seen:${encodeURIComponent(user.id)}:${releaseMetadata.version}`;

function button(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label,
  );
  expect(match, `button "${label}"`).toBeDefined();
  return match!;
}

describe('first sign-in onboarding', () => {
  it('shows the short welcome instead of release notes, and records the release as seen', async () => {
    const user = nextAccount();
    window.localStorage.setItem(`gym-logger-app-guide:${user.id}`, 'waiting');
    window.localStorage.setItem(`gym-logger-home-screen-guide:${user.id}`, 'waiting');
    await mount(user);

    expect(text()).toContain('Welcome, Riley');
    expect(text()).toContain('Start my first workout');
    expect(text()).not.toContain("WHAT'S NEW");
    expect(text()).not.toContain('QUICK TOUR');
    expect(text()).not.toContain('Add to Home Screen');
    expect(window.localStorage.getItem(releaseSeenKey(user))).toBe('1');

    await act(async () => button('Not now').click());
    expect(text()).not.toContain('Welcome, Riley');
    expect(window.localStorage.getItem(`gym-logger-app-guide:${user.id}`)).toBe('done');
    // Home Screen help does not follow on top during this first session.
    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('opens the full tour from the welcome', async () => {
    const user = nextAccount();
    window.localStorage.setItem(`gym-logger-app-guide:${user.id}`, 'waiting');
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    await mount(user);

    await act(async () => button('Take the full tour').click());
    expect(text()).not.toContain('Welcome, Riley');
    expect(text()).toContain('QUICK TOUR · 1 OF');
  });

  it('starts an empty workout from the welcome', async () => {
    const user = nextAccount();
    window.localStorage.setItem(`gym-logger-app-guide:${user.id}`, 'waiting');
    await mount(user);

    await act(async () => button('Start my first workout').click());
    expect(window.location.hash).toBe('#log');
    expect(text()).not.toContain('Welcome, Riley');
  });

  it('still shows a returning account the notes for a version it has not seen', async () => {
    const user = nextAccount();
    window.localStorage.setItem(`gym-logger-app-guide:${user.id}`, 'done');
    await mount(user);

    expect(text()).toContain("WHAT'S NEW");
    expect(text()).toContain(`Version ${releaseMetadata.version}`);
    expect(text()).not.toContain('Start my first workout');
  });
});

describe('Home sample data banner', () => {
  it('appears only while the account holds sample data', async () => {
    await mount(nextAccount());
    expect(container.querySelector('.sample-data-banner')).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(container);
    vi.mocked(api.listBodyMeasurements).mockResolvedValue([sampleMeasurement]);
    await mount(nextAccount());
    expect(container.querySelector('.sample-data-banner')?.textContent).toContain(
      '1 body check-in',
    );
  });

  it('removes the samples after confirmation and updates Home without a reload', async () => {
    const user = nextAccount();
    window.localStorage.setItem(
      `gym-logger-release-seen:${user.id}:${releaseMetadata.version}`,
      '1',
    );
    vi.mocked(api.listWorkouts).mockResolvedValue([sampleWorkout]);
    vi.mocked(api.listBodyMeasurements).mockResolvedValue([sampleMeasurement]);
    await mount(user);
    expect(container.querySelector('.sample-data-banner')?.textContent).toContain(
      '1 sample workout and 1 body check-in',
    );

    await act(async () => button('Remove sample data').click());
    expect(api.deleteSampleData).not.toHaveBeenCalled();
    vi.mocked(api.listWorkouts).mockResolvedValue([]);
    vi.mocked(api.listBodyMeasurements).mockResolvedValue([]);
    await act(async () =>
      document.querySelector<HTMLButtonElement>('.sample-remove-confirm')!.click(),
    );
    for (let index = 0; index < 3; index += 1) await act(async () => undefined);

    expect(api.deleteSampleData).toHaveBeenCalledTimes(1);
    expect(api.listWorkouts).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.sample-data-banner')).toBeNull();
    expect(document.querySelector('.sample-remove-dialog')).toBeNull();
    expect(text()).toContain('Sample data removed.');
  });
});
