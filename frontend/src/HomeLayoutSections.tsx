import { useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import {
  defaultHomeLayout,
  HOME_SECTIONS,
  homeSectionSpans,
  moveHomeSection,
  toggleHomeSection,
  type HomeLayout,
  type HomeSectionId,
} from './homeLayout';
import './homeLayout.css';

export function HomeLayoutSections({
  layout,
  sections,
}: {
  layout: HomeLayout;
  sections: Record<HomeSectionId, ReactNode>;
}) {
  const visible = layout.order.filter((id) => !layout.hidden.includes(id) && sections[id] != null);
  const spans = homeSectionSpans(visible);
  return (
    <div className="home-sections">
      {visible.map((id, index) => (
        <div
          key={id}
          data-home-section={id}
          style={{ gridColumn: `span ${spans[index]}` }}
          className={`home-section home-section-${HOME_SECTIONS.find((section) => section.id === id)!.size}`}
        >
          {sections[id]}
        </div>
      ))}
      {layout.hidden.length === HOME_SECTIONS.length && (
        <p className="pulse-empty-line home-empty">
          Your Home Screen is clear. Use the edit button to add sections.
        </p>
      )}
    </div>
  );
}

export function HomeLayoutEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
}: {
  draft: HomeLayout;
  onChange: (layout: HomeLayout) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [dragging, setDragging] = useState<HomeSectionId | null>(null);
  const [over, setOver] = useState<HomeSectionId | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const dropTarget = useRef<HomeSectionId | null>(null);
  const visible = draft.order.filter((id) => !draft.hidden.includes(id));
  const hidden = draft.order.filter((id) => draft.hidden.includes(id));
  const titleFor = (id: HomeSectionId) => HOME_SECTIONS.find((section) => section.id === id)!.title;

  function move(source: HomeSectionId, target: HomeSectionId) {
    const next = moveHomeSection(draft, source, target);
    onChange(next);
    setAnnouncement(
      `${titleFor(source)} moved to position ${next.order.filter((id) => !next.hidden.includes(id)).indexOf(source) + 1}.`,
    );
  }

  function stopDrag() {
    setDragging(null);
    setOver(null);
    dropTarget.current = null;
  }

  return (
    <section className="home-layout-editor" aria-labelledby="home-layout-title">
      <div className="home-layout-toolbar pulse-card">
        <h2 id="home-layout-title">Make Home your own</h2>
        <p>
          Drag the handles or use the arrows. Hide sections you don’t need and add them back
          anytime.
        </p>
        <div className="home-layout-actions">
          <button className="pulse-button primary" type="button" disabled={saving} onClick={onSave}>
            <Icon name="check" />
            {saving ? 'Saving…' : 'Save layout'}
          </button>
          <button
            className="pulse-button secondary"
            type="button"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="text-link"
            type="button"
            disabled={saving}
            onClick={() => {
              onChange(defaultHomeLayout());
              setAnnouncement('Default layout restored. Save to keep it.');
            }}
          >
            Reset layout
          </button>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <p className="home-layout-label">
        On your Home Screen <span>{visible.length} sections</span>
      </p>
      <ol className="home-layout-list" aria-label="Visible Home sections">
        {visible.map((id, index) => {
          const section = HOME_SECTIONS.find((item) => item.id === id)!;
          return (
            <li
              key={id}
              data-layout-section={id}
              className={`home-layout-row${dragging === id ? ' is-dragging' : ''}${over === id && dragging !== id ? ' is-drop-target' : ''}`}
            >
              <button
                className="home-drag-handle"
                type="button"
                disabled={saving}
                aria-label={`Drag ${section.title} to reorder`}
                aria-describedby="home-drag-help"
                onKeyDown={(event) => {
                  const target = visible[index + (event.key === 'ArrowUp' ? -1 : 1)];
                  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    if (target) move(id, target);
                  }
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0 || !event.isPrimary) return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dropTarget.current = id;
                  setDragging(id);
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  const row = document
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest<HTMLElement>('[data-layout-section]');
                  if (row) {
                    dropTarget.current = row.dataset.layoutSection as HomeSectionId;
                    setOver(dropTarget.current);
                  } else {
                    dropTarget.current = null;
                    setOver(null);
                  }
                  if (event.clientY < 100) window.scrollBy(0, -12);
                  else if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 12);
                }}
                onPointerUp={() => {
                  if (dropTarget.current && dragging) move(dragging, dropTarget.current);
                  stopDrag();
                }}
                onPointerCancel={stopDrag}
              >
                <Icon name="grip" />
              </button>
              <span className="home-layout-section-icon" aria-hidden="true">
                <Icon name={section.icon} />
              </span>
              <div className="home-layout-copy">
                <b>{section.title}</b>
                <small>{section.description}</small>
              </div>
              <div className="home-layout-row-actions">
                <button
                  type="button"
                  disabled={saving || index === 0}
                  aria-label={`Move ${section.title} up`}
                  onClick={() => move(id, visible[index - 1])}
                >
                  <Icon name="up" />
                </button>
                <button
                  type="button"
                  disabled={saving || index === visible.length - 1}
                  aria-label={`Move ${section.title} down`}
                  onClick={() => move(id, visible[index + 1])}
                >
                  <Icon name="down" />
                </button>
                <button
                  type="button"
                  disabled={saving}
                  aria-label={`Hide ${section.title}`}
                  onClick={() => {
                    onChange(toggleHomeSection(draft, id));
                    setAnnouncement(`${section.title} hidden. Add it back below.`);
                  }}
                >
                  <Icon name="hide" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {!visible.length && (
        <p className="pulse-empty-line">
          All sections are hidden. Add some below, or save a clear Home Screen.
        </p>
      )}
      <section className="home-layout-hidden pulse-card" aria-labelledby="home-hidden-title">
        <h3 id="home-hidden-title">Add sections</h3>
        {hidden.length ? (
          <div className="home-hidden-options">
            {hidden.map((id) => (
              <button
                className="pulse-button secondary"
                type="button"
                key={id}
                disabled={saving}
                onClick={() => {
                  onChange(toggleHomeSection(draft, id));
                  setAnnouncement(`${titleFor(id)} added.`);
                }}
              >
                <Icon name="plus" />
                {titleFor(id)}
              </button>
            ))}
          </div>
        ) : (
          <p>All sections are on your Home Screen. Hidden sections will appear here.</p>
        )}
      </section>
      <p className="home-layout-note">
        Your layout is saved to your account. An active workout always stays visible.
      </p>
      <span id="home-drag-help" className="sr-only">
        Drag to another section, or use the up and down arrow keys.
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </section>
  );
}
