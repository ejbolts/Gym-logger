import { createContext, useContext, useEffect, useRef } from 'react';

export interface SettingsDestination {
  id: string;
  title: string;
  page: 'settings' | 'profile';
  keywords: string;
  selector: string;
  reveal?: string[];
  editProfile?: boolean;
}

export const SETTINGS_DESTINATIONS: SettingsDestination[] = [
  {
    id: 'rest',
    title: 'Rest timer',
    page: 'settings',
    keywords: 'automatic countdown between sets',
    selector: '[aria-label="Rest timer"]',
  },
  {
    id: 'alerts',
    title: 'Phone alerts',
    page: 'settings',
    keywords: 'notifications reminders push',
    selector: '#notification-settings-title',
  },
  {
    id: 'appearance',
    title: 'App theme',
    page: 'settings',
    keywords:
      'appearance light dark mode colour color palette accent blue green purple plum emerald amber coral',
    selector: '#colour-theme-title',
  },
  {
    id: 'training',
    title: 'Training preferences',
    page: 'settings',
    keywords:
      'weight units kg lb kilograms pounds week starts schedule weekly muscle sets goal warmups',
    selector: '#training-preferences-title',
  },
  {
    id: 'motion',
    title: 'Animations',
    page: 'settings',
    keywords: 'reduce motion accessibility',
    selector: '#motion-settings-title',
  },
  {
    id: 'colours',
    title: 'Workout types',
    page: 'settings',
    keywords: 'colour color category calendar legend custom add remove arms legs limbs torso',
    selector: '#workout-types-title',
  },
  {
    id: 'trend',
    title: 'Bodyweight trend defaults',
    page: 'settings',
    keywords: 'body weight average median duration statistic measurements',
    selector: '#bodyweight-trend-title',
  },
  {
    id: 'workouts',
    title: 'Workouts & bodyweight',
    page: 'settings',
    keywords: 'import export csv backup sample workouts body weight measurements check-ins',
    selector: '#workout-data-title',
  },
  {
    id: 'youtube',
    title: 'YouTube connection',
    page: 'settings',
    keywords: 'video uploads channel connect disconnect',
    selector: '.youtube-connection h2',
  },
  {
    id: 'release',
    title: "What's new",
    page: 'settings',
    keywords: 'version updates release changelog changes',
    selector: '#release-settings-title',
  },
  {
    id: 'guide',
    title: 'App guide',
    page: 'settings',
    keywords: 'tour help replay',
    selector: '#app-guide-settings-title',
  },
  {
    id: 'install',
    title: 'Add to Home Screen',
    page: 'settings',
    keywords: 'install phone pwa app icon',
    selector: '#home-screen-settings-title',
  },
  {
    id: 'feedback',
    title: 'Feedback & feature requests',
    page: 'settings',
    keywords: 'suggestion bug report ideas support',
    selector: '#feedback-settings-title',
  },
  {
    id: 'username',
    title: 'Change username',
    page: 'profile',
    keywords: 'account login name edit',
    selector: '.profile-identity input[autocomplete="username"]',
    editProfile: true,
  },
  {
    id: 'name',
    title: 'Change display name',
    page: 'profile',
    keywords: 'profile name edit',
    selector: '.profile-identity input[autocomplete="name"]',
    editProfile: true,
  },
  {
    id: 'photo',
    title: 'Profile photo',
    page: 'profile',
    keywords: 'picture avatar change remove edit',
    selector: '.profile-photo-edit',
    editProfile: true,
  },
  {
    id: 'uuid',
    title: 'Account UUID',
    page: 'profile',
    keywords: 'id identifier copy account',
    selector: '.profile-identity .profile-account-id code',
  },
  {
    id: 'sharing',
    title: 'Profile sharing',
    page: 'profile',
    keywords: 'privacy private public friends only visibility',
    selector: '.profile-sharing',
    reveal: ['Profile sharing'],
  },
  {
    id: 'shared-fields',
    title: 'What you share',
    page: 'profile',
    keywords: 'sharing machine photos notes goals cardio body weight',
    selector: '.sharing-options',
    reveal: ['Profile sharing', 'What you share'],
  },
  {
    id: 'friends',
    title: 'Friends',
    page: 'profile',
    keywords: 'people search follow followers requests approve',
    selector: '.friends-panel, .sharing-locked',
    reveal: ['Friends'],
  },
  {
    id: 'password',
    title: 'Change password',
    page: 'profile',
    keywords: 'security login account',
    selector: '.profile-screen .profile-form input[autocomplete="current-password"]',
    reveal: ['Change password'],
  },
  {
    id: 'signout',
    title: 'Sign out',
    page: 'profile',
    keywords: 'logout log out device session',
    selector: '#profile-session-title',
  },
  {
    id: 'delete',
    title: 'Delete account',
    page: 'profile',
    keywords: 'remove permanently danger',
    selector: '.danger-zone h2',
  },
];

export function searchSettings(query: string, includeProfile = true): SettingsDestination[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SETTINGS_DESTINATIONS.filter(
    (entry) =>
      (includeProfile || entry.page !== 'profile') &&
      words.every((word) => `${entry.title} ${entry.keywords}`.toLocaleLowerCase().includes(word)),
  );
}

export interface SettingsJump {
  destination: SettingsDestination;
  serial: number;
}
export const SettingsNavigationContext = createContext<{
  request: SettingsJump | null;
  navigate: (destination: SettingsDestination) => void;
} | null>(null);

/** Open folded sections without invoking any setting's action. */
export function useSettingsReveal(title: string, reveal: () => void) {
  const navigation = useContext(SettingsNavigationContext);
  const callback = useRef(reveal);
  callback.current = reveal;
  useEffect(() => {
    if (navigation?.request?.destination.reveal?.includes(title)) callback.current();
  }, [navigation?.request, title]);
}

/** Runs after page navigation and destination controls have been revealed. */
export function useSettingsPageJump(page: 'settings' | 'profile', active: boolean) {
  const navigation = useContext(SettingsNavigationContext);
  const handled = useRef(0);
  useEffect(() => {
    const request = navigation?.request;
    if (
      !active ||
      !request ||
      request.destination.page !== page ||
      handled.current === request.serial
    )
      return;
    const { destination, serial } = request;
    let first = 0;
    let second = 0;
    let queued = false;
    const observer = new MutationObserver(queueFocus);
    const expiry = setTimeout(() => observer.disconnect(), 15000);
    function queueFocus() {
      if (queued || handled.current === serial) return;
      queued = true;
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          queued = false;
          const root = document.querySelector(`[data-settings-page="${page}"]`);
          const target = root?.querySelector<HTMLElement>(destination.selector);
          if (!target || target.closest('.is-collapsed')) return;
          handled.current = serial;
          observer.disconnect();
          clearTimeout(expiry);
          target.scrollIntoView({ behavior: 'instant', block: 'center' });
          if (!target.matches('input,button,select,textarea,a')) target.tabIndex = -1;
          target.focus({ preventScroll: true });
        });
      });
    }
    // Optional shared fields may arrive after a server request on the first profile visit.
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    queueFocus();
    return () => {
      observer.disconnect();
      clearTimeout(expiry);
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [active, navigation?.request, page]);
}
