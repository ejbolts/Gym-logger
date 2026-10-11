type GuideState = 'waiting' | 'done';
const sessionState = new Map<string, GuideState>();
const keyFor = (userId: string) => `gym-logger-app-guide:${encodeURIComponent(userId)}`;

function read(userId: string): GuideState | null {
  const key = keyFor(userId);
  if (sessionState.has(key)) return sessionState.get(key)!;
  try {
    const value = window.localStorage.getItem(key);
    return value === 'waiting' || value === 'done' ? value : null;
  } catch {
    return null;
  }
}

function write(userId: string, state: GuideState) {
  sessionState.set(keyFor(userId), state);
  try {
    window.localStorage.setItem(keyFor(userId), state);
  } catch {
    // Remember dismissal during this session when storage is blocked.
  }
}

export function queueAppGuide(userId: string) {
  if (read(userId) !== 'done') write(userId, 'waiting');
}

export const appGuideWaiting = (userId: string) => read(userId) === 'waiting';
export const finishAppGuide = (userId: string) => write(userId, 'done');
