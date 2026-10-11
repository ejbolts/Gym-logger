import { afterEach, describe, expect, it, vi } from 'vitest';
import { appGuideWaiting, finishAppGuide, queueAppGuide } from './appGuideState';
import { appGuideSteps } from './appGuideSteps';

afterEach(() => vi.unstubAllGlobals());

describe('feature onboarding', () => {
  it('queues only a new account and remembers dismissal per account and reload', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    });
    expect(appGuideWaiting('tour-new')).toBe(false);
    queueAppGuide('tour-new');
    expect(appGuideWaiting('tour-new')).toBe(true);
    expect(appGuideWaiting('tour-existing')).toBe(false);
    finishAppGuide('tour-new');
    queueAppGuide('tour-new');
    expect(appGuideWaiting('tour-new')).toBe(false);
    expect(stored.get('gym-logger-app-guide:tour-new')).toBe('done');
    stored.set('gym-logger-app-guide:tour-reload', 'waiting');
    expect(appGuideWaiting('tour-reload')).toBe(true);
  });

  it('works when storage is blocked, including in an installed app', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('blocked');
      },
      matchMedia: () => ({ matches: true }),
    });
    queueAppGuide('tour-private');
    expect(appGuideWaiting('tour-private')).toBe(true);
    finishAppGuide('tour-private');
    expect(appGuideWaiting('tour-private')).toBe(false);
  });

  it('covers core features without starting a workout and respects video permissions', () => {
    expect(appGuideSteps(false).map((step) => step.target)).toEqual([
      'today',
      'start',
      'history',
      'progress',
      'body',
      'cardio',
      'installation',
    ]);
    expect(appGuideSteps(true).map((step) => step.target)).toContain('videos');
    expect(appGuideSteps(true).some((step) => step.tab === 'log' || step.tab === 'videos')).toBe(
      false,
    );
  });
});
