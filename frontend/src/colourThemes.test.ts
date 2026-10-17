// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  applyColourMode,
  applyColourTheme,
  colourModePreference,
  colourThemePreference,
  saveColourMode,
  saveColourTheme,
} from './colourThemes';
afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.colourTheme;
  delete document.documentElement.dataset.colourMode;
  vi.restoreAllMocks();
});
it('persists a selected theme and applies its accent without affecting status colours', () => {
  expect(saveColourTheme('amber')).toBe(true);
  expect(colourThemePreference()).toBe('amber');
  expect(document.documentElement.dataset.colourTheme).toBe('amber');
  expect(document.documentElement.style.getPropertyValue('--p-accent')).toBe('#985014');
  expect(document.documentElement.style.getPropertyValue('--p-danger')).toBe('');
});
it('uses Blue for invalid storage and keeps the theme usable when storage is unavailable', () => {
  localStorage.setItem('gym-logger-colour-theme', 'missing');
  expect(colourThemePreference()).toBe('blue');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('unavailable');
  });
  expect(saveColourTheme('plum')).toBe(false);
  expect(document.documentElement.dataset.colourTheme).toBe('plum');
  applyColourTheme('blue');
  expect(document.documentElement.style.getPropertyValue('--p-accent')).toBe('#3987e5');
});
it('defaults to dark mode and keeps the saved accent when switching to light', () => {
  expect(colourModePreference()).toBe('dark');
  saveColourTheme('emerald');
  expect(saveColourMode('light')).toBe(true);
  expect(colourModePreference()).toBe('light');
  expect(document.documentElement.dataset.colourMode).toBe('light');
  expect(document.documentElement.dataset.colourTheme).toBe('emerald');
  expect(document.documentElement.style.getPropertyValue('--p-accent')).toBe('#237844');
  expect(document.documentElement.style.getPropertyValue('--p-accent-text')).toBe('#1b6638');
  applyColourMode('dark');
  expect(document.documentElement.style.getPropertyValue('--p-accent-text')).toBe('#78d49c');
});
it('ignores invalid modes and applies light mode when storage is unavailable', () => {
  localStorage.setItem('gym-logger-colour-mode', 'sepia');
  expect(colourModePreference()).toBe('dark');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('unavailable');
  });
  expect(saveColourMode('light')).toBe(false);
  expect(document.documentElement.dataset.colourMode).toBe('light');
});
