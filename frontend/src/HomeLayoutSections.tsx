import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import {
  HOME_SECTIONS,
  homeSectionSpans,
  moveHomeSection,
  toggleHomeSection,
  toggleHomeSectionWidth,
  type HomeLayout,
  type HomeSectionId,
} from './homeLayout';
import './homeLayout.css';

interface HomeEditActions {
  onChange: (layout: HomeLayout) => void;
  onDraggingChange?: (dragging: boolean) => void;
  saving: boolean;
}
interface CardDrag {
  id: HomeSectionId;
  pointerId: number;
  startX: number;
  startY: number;
  startScrollY: number;
  clientX: number;
  clientY: number;
  card: HTMLElement;
  handle: HTMLButtonElement;
  target: HomeSectionId | null;
}

export function HomeLayoutSections({
  layout,
  sections,
  edit,
}: {
  layout: HomeLayout;
  sections: Record<HomeSectionId, ReactNode>;
  edit?: HomeEditActions;
}) {
  const visible = layout.order.filter(
    (id) => !layout.hidden.includes(id) && (edit || sections[id] != null),
  );
  const hidden = layout.order.filter((id) => layout.hidden.includes(id));
  const spans = homeSectionSpans(visible, layout.widths);
  const [dragging, setDragging] = useState<HomeSectionId | null>(null);
  const [over, setOver] = useState<HomeSectionId | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const dragRef = useRef<CardDrag | null>(null);
  const titleFor = (id: HomeSectionId) => HOME_SECTIONS.find((section) => section.id === id)!.title;

  function move(source: HomeSectionId, target: HomeSectionId) {
    if (!edit || edit.saving) return;
    const next = moveHomeSection(layout, source, target);
    edit.onChange(next);
    setAnnouncement(
      `${titleFor(source)} moved to position ${next.order.filter((id) => !next.hidden.includes(id)).indexOf(source) + 1}.`,
    );
  }
  function stopDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag) {
      drag.card.style.removeProperty('--home-drag-x');
      drag.card.style.removeProperty('--home-drag-y');
      if (drag.handle.hasPointerCapture(drag.pointerId))
        drag.handle.releasePointerCapture(drag.pointerId);
    }
    setDragging(null);
    setOver(null);
  }
  function updateTarget(drag: CardDrag) {
    const card = document
      .elementFromPoint(drag.clientX, drag.clientY)
      ?.closest<HTMLElement>('[data-home-section]');
    const target = card?.dataset.homeSection as HomeSectionId | undefined;
    drag.target = target && target !== drag.id ? target : null;
    setOver(drag.target);
  }
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const scroll = () => {
      const drag = dragRef.current;
      if (!drag) return;
      // Keep scrolling while a finger is held at an edge, even without more moves.
      const delta = drag.clientY < 160 ? -12 : drag.clientY > window.innerHeight - 90 ? 12 : 0;
      if (delta) {
        window.scrollBy(0, delta);
        drag.card.style.setProperty(
          '--home-drag-y',
          `${drag.clientY - drag.startY + window.scrollY - drag.startScrollY}px`,
        );
        updateTarget(drag);
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [dragging]);

  const onDraggingChange = edit?.onDraggingChange;
  useEffect(() => {
    onDraggingChange?.(dragging !== null);
  }, [dragging, onDraggingChange]);

  const busy = Boolean(edit?.saving || dragging);
  return (
    <>
      {edit && hidden.length > 0 && (
        <details className="home-layout-add">
          <summary>
            <Icon name="plus" />
            Add sections <span>{hidden.length}</span>
          </summary>
          <div className="home-hidden-options">
            {hidden.map((id) => (
              <button
                className="pulse-button secondary"
                type="button"
                key={id}
                disabled={busy}
                aria-label={`Add ${titleFor(id)}`}
                onClick={() => {
                  edit.onChange(toggleHomeSection(layout, id));
                  setAnnouncement(`${titleFor(id)} added.`);
                }}
              >
                <Icon name="plus" />
                {titleFor(id)}
              </button>
            ))}
          </div>
        </details>
      )}
      <div className={`home-sections${edit ? ' is-editing' : ''}`}>
        {visible.map((id, index) => (
          <div
            key={id}
            data-home-section={id}
            data-home-span={spans[index]}
            style={{ gridColumn: `span ${spans[index]}` }}
            className={`home-section home-section-${HOME_SECTIONS.find((section) => section.id === id)!.size}${dragging === id ? ' is-dragging' : ''}${over === id ? ' is-drop-target' : ''}`}
          >
            <div className="home-edit-card">
              <div className="home-section-content" inert={Boolean(edit)}>
                {sections[id] ?? (
                  <section className="pulse-card home-unavailable">
                    <h2>{titleFor(id)}</h2>
                    <p>Your active workout stays above the cards.</p>
                  </section>
                )}
              </div>
              {edit && (
                <>
                  <button
                    className="home-card-hide"
                    type="button"
                    disabled={busy}
                    aria-label={`Hide ${titleFor(id)}`}
                    title={`Hide ${titleFor(id)}`}
                    onClick={() => {
                      edit.onChange(toggleHomeSection(layout, id));
                      setAnnouncement(`${titleFor(id)} hidden. Restore it from Add sections.`);
                    }}
                  >
                    <Icon name="close" />
                  </button>
                  <button
                    className="home-card-resize"
                    type="button"
                    disabled={busy}
                    aria-label={`${spans[index] === 6 ? 'Shrink' : 'Expand'} ${titleFor(id)} ${spans[index] === 6 ? 'to compact width' : 'to full width'}`}
                    title={spans[index] === 6 ? 'Shrink to compact width' : 'Expand to full width'}
                    onClick={() => {
                      edit.onChange(toggleHomeSectionWidth(layout, id, spans[index]));
                      setAnnouncement(
                        `${titleFor(id)} set to ${spans[index] === 6 ? 'compact' : 'full'} width.`,
                      );
                    }}
                  >
                    <svg
                      className="pulse-icon"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d={
                          spans[index] === 6
                            ? 'M3 12h7m-3-3 3 3-3 3m14-3h-7m3-3-3 3 3 3'
                            : 'M10 12H3m3-3-3 3 3 3m8-3h7m-3-3 3 3-3 3'
                        }
                      />
                    </svg>
                  </button>
                  <button
                    className="home-drag-handle"
                    type="button"
                    disabled={edit.saving}
                    aria-label={`Drag ${titleFor(id)} to reorder`}
                    aria-describedby="home-drag-help"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        stopDrag();
                        return;
                      }
                      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key))
                        return;
                      event.preventDefault();
                      const direction =
                        event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
                      const target = visible[index + direction];
                      if (target) move(id, target);
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || !event.isPrimary || dragRef.current) return;
                      event.preventDefault();
                      event.currentTarget.focus({ preventScroll: true });
                      event.currentTarget.setPointerCapture(event.pointerId);
                      const card = event.currentTarget.closest<HTMLElement>('[data-home-section]')!;
                      dragRef.current = {
                        id,
                        pointerId: event.pointerId,
                        startX: event.clientX,
                        startY: event.clientY,
                        startScrollY: window.scrollY,
                        clientX: event.clientX,
                        clientY: event.clientY,
                        card,
                        handle: event.currentTarget,
                        target: null,
                      };
                      setDragging(id);
                    }}
                    onPointerMove={(event) => {
                      const drag = dragRef.current;
                      if (!drag || event.pointerId !== drag.pointerId) return;
                      drag.clientX = event.clientX;
                      drag.clientY = event.clientY;
                      drag.card.style.setProperty(
                        '--home-drag-x',
                        `${event.clientX - drag.startX}px`,
                      );
                      drag.card.style.setProperty(
                        '--home-drag-y',
                        `${event.clientY - drag.startY + window.scrollY - drag.startScrollY}px`,
                      );
                      updateTarget(drag);
                    }}
                    onPointerUp={() => {
                      const drag = dragRef.current;
                      if (drag?.target) move(drag.id, drag.target);
                      stopDrag();
                    }}
                    onPointerCancel={stopDrag}
                    onLostPointerCapture={stopDrag}
                  >
                    <Icon name="grip" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="pulse-empty-line home-empty">
            {edit
              ? 'Add a section above, or reset the layout.'
              : 'Your Home Screen is clear. Use the edit button to add sections.'}
          </p>
        )}
      </div>
      {edit && (
        <>
          <span id="home-drag-help" className="sr-only">
            Drag to another card, or use the arrow keys to move it. Escape cancels a drag. Use the
            width button to resize, X to hide, and the green tick below to save.
          </span>
          <span className="sr-only" role="status" aria-live="polite">
            {announcement}
          </span>
        </>
      )}
    </>
  );
}
