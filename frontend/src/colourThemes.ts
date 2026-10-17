const THEME_KEY = 'gym-logger-colour-theme';
export const COLOUR_THEMES = [
  {
    id: 'blue',
    name: 'Blue',
    detail: 'Original',
    accent: '#3987e5',
    hover: '#4b94ea',
    text: '#6da7ec',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    detail: 'Forest green',
    accent: '#237844',
    hover: '#2d8a51',
    text: '#78d49c',
  },
  {
    id: 'plum',
    name: 'Plum',
    detail: 'Soft purple',
    accent: '#8057ba',
    hover: '#9069c7',
    text: '#c4a2ef',
  },
  {
    id: 'coral',
    name: 'Coral',
    detail: 'Warm coral',
    accent: '#a44850',
    hover: '#b7565e',
    text: '#f3a0a6',
  },
  {
    id: 'amber',
    name: 'Amber',
    detail: 'Burnt amber',
    accent: '#985014',
    hover: '#ac6020',
    text: '#efb06d',
  },
] as const;
export type ColourThemeId = (typeof COLOUR_THEMES)[number]['id'];

export function colourThemePreference(): ColourThemeId {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return COLOUR_THEMES.find((theme) => theme.id === saved)?.id ?? 'blue';
  } catch {
    return 'blue';
  }
}

export function applyColourTheme(id: ColourThemeId) {
  const theme = COLOUR_THEMES.find((entry) => entry.id === id) ?? COLOUR_THEMES[0];
  const root = document.documentElement;
  root.dataset.colourTheme = theme.id;
  root.style.setProperty('--p-accent', theme.accent);
  root.style.setProperty('--p-accent-hover', theme.hover);
  root.style.setProperty('--p-accent-text', theme.text);
  root.style.setProperty('--p-accent-soft', `color-mix(in srgb, ${theme.accent} 15%, transparent)`);
}

export function saveColourTheme(id: ColourThemeId): boolean {
  applyColourTheme(id);
  try {
    localStorage.setItem(THEME_KEY, id);
    return true;
  } catch {
    return false;
  }
}
