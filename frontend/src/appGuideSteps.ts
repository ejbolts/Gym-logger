import type { AppTab } from './appNavigation';
import type { IconName } from './Icon';

export interface AppGuideStep {
  title: string;
  description: string;
  target: string;
  tab: AppTab;
  icon: IconName;
}

export function appGuideSteps(videosAllowed: boolean): AppGuideStep[] {
  return [
    {
      title: 'Your training, at a glance',
      description:
        'Today brings together your week, training calendar and suggested next session. Come back here to see how you are doing.',
      target: 'today',
      tab: 'dashboard',
      icon: 'home',
    },
    {
      title: 'Start a workout',
      description:
        'Tap Start to choose exercises and log sets, reps, weight and effort. Rest timers keep you moving. If a workout is already running, this button resumes it.',
      target: 'start',
      tab: 'dashboard',
      icon: 'plus',
    },
    {
      title: 'Look back in History',
      description:
        'Review and edit saved workouts, read your notes and revisit machine photos. You can also import or export workout history with CSV.',
      target: 'history',
      tab: 'history',
      icon: 'calendar',
    },
    {
      title: 'Watch your progress',
      description:
        'Choose an exercise to explore its progression charts and personal records. Compare sessions to see how your training is changing.',
      target: 'progress',
      tab: 'progress',
      icon: 'trend',
    },
    {
      title: 'Track your body',
      description:
        'Log body weight and optional body-fat measurements, follow trends and set a weight goal. A single check-in is enough to get started.',
      target: 'body',
      tab: 'body',
      icon: 'body',
    },
    {
      title: 'Keep cardio in the picture',
      description:
        'Open Cardio from this Today card. Log sessions and machine metrics, and compare your time, distance and energy across date ranges.',
      target: 'cardio',
      tab: 'dashboard',
      icon: 'heart',
    },
    ...(videosAllowed
      ? [
          {
            title: 'Save your workout videos',
            description:
              'The video logger batches set clips into one workout video. Follow its upload steps to keep a record of your technique.',
            target: 'videos',
            tab: 'dashboard' as const,
            icon: 'video' as const,
          },
        ]
      : []),
    {
      title: 'Make Gym Logger your own',
      description:
        'Settings has illustrated Add to Home Screen steps, timers, phone alerts and display preferences. Use Replay guide here whenever you need a refresher.',
      target: 'installation',
      tab: 'settings',
      icon: 'settings',
    },
  ];
}

export const PROJECT_URL = 'https://github.com/ejbolts/Gym-video-logger';
export const CONTRIBUTING_URL = `${PROJECT_URL}/blob/master/CONTRIBUTING.md`;
