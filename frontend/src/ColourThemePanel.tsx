import { useState, type CSSProperties } from 'react';
import {
  COLOUR_MODES,
  COLOUR_THEMES,
  colourModePreference,
  colourThemePreference,
  saveColourMode,
  saveColourTheme,
} from './colourThemes';
import { Icon } from './Icon';
import './colourThemes.css';

export function ColourThemePanel() {
  const [selected, setSelected] = useState(colourThemePreference);
  const [mode, setMode] = useState(colourModePreference);
  const [status, setStatus] = useState('');
  return (
    <section
      className="settings-panel panel colour-theme-panel"
      aria-labelledby="colour-theme-title"
    >
      <header>
        <div>
          <p className="section-kicker">APPEARANCE</p>
          <h2 id="colour-theme-title">App theme</h2>
        </div>
      </header>
      <p>Choose light or dark mode and an accent colour. Your choices stay on this device.</p>
      <fieldset className="colour-mode-options">
        <legend className="sr-only">Mode</legend>
        {COLOUR_MODES.map((option) => (
          <label key={option.id} className={mode === option.id ? 'is-selected' : ''}>
            <input
              type="radio"
              name="colour-mode"
              value={option.id}
              checked={mode === option.id}
              onChange={() => {
                setMode(option.id);
                setStatus(
                  saveColourMode(option.id)
                    ? `${option.name} mode saved on this device.`
                    : `${option.name} mode applied for this visit.`,
                );
              }}
            />
            <Icon name={option.icon} />
            <strong>{option.name}</strong>
          </label>
        ))}
      </fieldset>
      <fieldset className="colour-theme-options">
        <legend className="sr-only">Accent colour</legend>
        {COLOUR_THEMES.map((theme) => (
          <label key={theme.id} className={selected === theme.id ? 'is-selected' : ''}>
            <input
              type="radio"
              name="colour-theme"
              value={theme.id}
              checked={selected === theme.id}
              onChange={() => {
                setSelected(theme.id);
                setStatus(
                  saveColourTheme(theme.id)
                    ? `${theme.name} theme saved on this device.`
                    : `${theme.name} theme applied for this visit.`,
                );
              }}
            />
            <span
              className="colour-theme-swatch"
              style={{ '--theme-swatch': theme.accent } as CSSProperties}
              aria-hidden="true"
            />
            <span>
              <strong>{theme.name}</strong>
              <small>{theme.detail}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="notification-setting-status" role="status">
        {status}
      </p>
    </section>
  );
}
