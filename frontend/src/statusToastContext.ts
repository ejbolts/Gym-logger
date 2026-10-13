import { createContext, useContext } from 'react';

export interface StatusToastOptions {
  /** Keep the toast until the user dismisses it or a newer toast replaces it. */
  persist?: boolean;
}

/** Shows a non-blocking status message; a newer message replaces the current one. */
export type ShowToast = (text: string, options?: StatusToastOptions) => void;

export interface StatusToastMessage {
  id: number;
  text: string;
  persist: boolean;
}

/** Shortest time a routine toast stays visible. */
export const STATUS_TOAST_MS = 4500;
const STATUS_TOAST_MAX_MS = 10_000;
const READING_MS_PER_CHARACTER = 60;

/** Routine toasts close after about 4.5 s; longer summaries get extra reading time. */
export function statusToastDuration(text: string): number {
  return Math.min(
    STATUS_TOAST_MAX_MS,
    Math.max(STATUS_TOAST_MS, text.length * READING_MS_PER_CHARACTER),
  );
}

export const StatusToastContext = createContext<ShowToast>(() => undefined);

/**
 * Returns `showToast` for success and information messages that need no reply. Errors that
 * need acknowledgement, choices and destructive confirmations stay in dialogs.
 */
export function useShowToast(): ShowToast {
  return useContext(StatusToastContext);
}
