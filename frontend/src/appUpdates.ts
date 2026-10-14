export const BEFORE_APP_REFRESH_EVENT = 'gym-logger-before-app-refresh';

const WORKER_TIMEOUT_MS = 30_000;
const listeners = new Set<() => void>();
const watchedWorkers = new WeakSet<ServiceWorker>();
let registration: ServiceWorkerRegistration | undefined;
let registering: Promise<ServiceWorkerRegistration | undefined> | undefined;
let checking: Promise<void> | undefined;
let refreshing: Promise<void> | undefined;
let started = false;
let watching = false;
let hadInstalledWorker = false;
let controlledWorker: ServiceWorker | null | undefined;
let updateActivatedElsewhere = false;
let updateAvailable = false;

function supportsWorkers(): boolean {
  return import.meta.env.PROD && 'serviceWorker' in navigator;
}

export function subscribeAppUpdates(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isAppUpdateAvailable(): boolean {
  return updateAvailable;
}

function syncUpdateAvailability() {
  const next = updateActivatedElsewhere || Boolean(hadInstalledWorker && registration?.waiting);
  if (next === updateAvailable) return;
  updateAvailable = next;
  listeners.forEach((listener) => listener());
}

function watchInstallingWorker() {
  const worker = registration?.installing;
  if (!worker || watchedWorkers.has(worker)) return;
  watchedWorkers.add(worker);
  worker.addEventListener('statechange', () => {
    // The first install activates normally. Only a replacement worker produces
    // an update prompt; it leaves the current worker and its assets available.
    syncUpdateAvailability();
    queueMicrotask(syncUpdateAvailability);
  });
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!supportsWorkers()) return;
  if (registration) return registration;
  if (registering) return registering;
  registering = (async () => {
    const next = await navigator.serviceWorker.register('/sw.js', {
      updateViaCache: 'none',
    });
    registration = next;
    controlledWorker = navigator.serviceWorker.controller;
    hadInstalledWorker = Boolean(controlledWorker || next.active);
    next.addEventListener('updatefound', watchInstallingWorker);
    watchInstallingWorker();
    syncUpdateAvailability();
    if (!watching) {
      watching = true;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        const controller = navigator.serviceWorker.controller;
        if (controlledWorker && controller && controller !== controlledWorker) {
          // Another tab can activate the worker while this tab still runs its
          // old bundle. Keep offering refresh even for a same-version rebuild.
          updateActivatedElsewhere = true;
        }
        controlledWorker ||= controller;
        hadInstalledWorker ||= Boolean(controller);
        syncUpdateAvailability();
        // Activation in another tab must never reload a form in this tab.
      });
      const checkInBackground = () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          void checkForAppUpdate().catch(() => {
            // Interrupted checks leave the installed app usable.
          });
        }
      };
      document.addEventListener('visibilitychange', checkInBackground);
      window.addEventListener('online', checkInBackground);
      window.setInterval(checkInBackground, 60 * 60 * 1000);
    }
    return next;
  })();
  try {
    return await registering;
  } finally {
    registering = undefined;
  }
}

// Manual checks report failures to the caller. Automatic checks swallow them.
export async function checkForAppUpdate(): Promise<void> {
  if (!supportsWorkers()) return;
  if (!navigator.onLine) {
    throw new Error('You are offline. Connect to check for updates.');
  }
  const current = await ensureRegistration();
  if (!current) return;
  if (!checking) {
    checking = current.update().then(() => {
      watchInstallingWorker();
      syncUpdateAvailability();
    });
  }
  try {
    await checking;
  } finally {
    checking = undefined;
  }
}

function waitForInstallation(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      worker.removeEventListener('statechange', inspect);
      if (error) reject(error);
      else resolve();
    };
    const inspect = () => {
      if (worker.state === 'redundant') {
        finish(new Error('The update could not be downloaded. Please try again.'));
      } else if (['installed', 'activating', 'activated'].includes(worker.state)) {
        finish();
      }
    };
    const timeout = window.setTimeout(
      () => finish(new Error('The update is still downloading. Please try again.')),
      WORKER_TIMEOUT_MS,
    );
    worker.addEventListener('statechange', inspect);
    inspect();
  });
}

function activateWaitingWorker(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const container = navigator.serviceWorker;
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      container.removeEventListener('controllerchange', inspect);
      worker.removeEventListener('statechange', inspect);
      if (error) reject(error);
      else resolve();
    };
    const inspect = () => {
      if (container.controller === worker) finish();
      else if (worker.state === 'redundant') {
        finish(new Error('The update could not be activated. Please try again.'));
      }
    };
    const timeout = window.setTimeout(
      () => finish(new Error('The update did not finish activating. Please try again.')),
      WORKER_TIMEOUT_MS,
    );
    container.addEventListener('controllerchange', inspect);
    worker.addEventListener('statechange', inspect);
    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
      inspect();
    } catch (error) {
      finish(error instanceof Error ? error : new Error('The update could not be activated.'));
    }
  });
}

function assertRefreshAllowed() {
  if (!window.dispatchEvent(new Event(BEFORE_APP_REFRESH_EVENT, { cancelable: true }))) {
    throw new Error('Your current work could not be saved. Save it before refreshing.');
  }
}

// A refresh is always the user's choice. Wait for downloaded assets and the new
// controller before reloading; failures keep the current app and work available.
export async function refreshApp(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const current = await ensureRegistration();
    if (current && !current.waiting) {
      await checkForAppUpdate();
      if (current.installing) await waitForInstallation(current.installing);
    }
    assertRefreshAllowed();
    if (current?.waiting) {
      await activateWaitingWorker(current.waiting);
      // Save changes made while activation was in progress as well.
      assertRefreshAllowed();
    }
    window.location.reload();
  })();
  try {
    await refreshing;
  } finally {
    refreshing = undefined;
  }
}

export function registerAppUpdates() {
  if (!supportsWorkers() || started) return;
  started = true;
  const register = () => {
    void ensureRegistration()
      .then(() => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          return checkForAppUpdate();
        }
      })
      .catch(() => {
        // The app still runs when workers are unavailable or checks fail.
      });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
