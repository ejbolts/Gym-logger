// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { applyColourTheme, colourThemePreference, saveColourTheme } from './colourThemes';
afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.colourTheme;
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
