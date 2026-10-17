import { useState, type CSSProperties } from 'react';
import { COLOUR_THEMES, colourThemePreference, saveColourTheme } from './colourThemes';
import './colourThemes.css';

export function ColourThemePanel() {
  const [selected, setSelected] = useState(colourThemePreference);
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
      <p>Choose an accent colour. Your choice stays on this device.</p>
      <fieldset className="colour-theme-options">
        <legend className="sr-only">App theme</legend>
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
