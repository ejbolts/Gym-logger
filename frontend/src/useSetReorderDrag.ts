import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

interface SetDrag {
  key: string;
  pointerId: number;
  startY: number;
  startScrollY: number;
  clientY: number;
  scrollY: number;
  centerOffset: number;
  target: string;
  row: HTMLElement;
  content: HTMLElement;
  handle: HTMLButtonElement;
}

/** Lift a set under its handle, keeping its horizontal position fixed. */
export function useSetReorderDrag(
  gridRef: RefObject<HTMLDivElement | null>,
  keys: string[],
  onMove: (from: number, to: number) => void,
) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const dragRef = useRef<SetDrag | null>(null);
  const resetRef = useRef<{ frame: number; drag: SetDrag } | null>(null);

  const resetStyles = useCallback(() => {
    const pending = resetRef.current;
    if (!pending) return;
    cancelAnimationFrame(pending.frame);
    pending.drag.content.style.removeProperty('transition');
    delete pending.drag.row.dataset.flipSkip;
    resetRef.current = null;
  }, []);

  const stopDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    delete drag.row.dataset.setReordering;
    drag.row.style.removeProperty('--set-drag-y');
    // A drop changes the row's layout position. Don't also animate its swipe transform
    // or replay the old list position; neighboring rows still use the normal FLIP animation.
    drag.content.style.setProperty('transition', 'none');
    resetRef.current = { frame: requestAnimationFrame(resetStyles), drag };
    if (drag.handle.hasPointerCapture(drag.pointerId)) {
      drag.handle.releasePointerCapture(drag.pointerId);
    }
    setDraggingKey(null);
    setTargetKey(null);
  }, [resetStyles]);

  const updatePosition = useCallback(
    (drag: SetDrag) => {
      drag.scrollY = window.scrollY;
      drag.row.style.setProperty(
        '--set-drag-y',
        `${drag.clientY - drag.startY + drag.scrollY - drag.startScrollY}px`,
      );
      // Measure stationary row shells, rather than hit-testing the lifted content.
      // Only Y matters: a finger drifting sideways cannot move a set into another column.
      let nearest = drag.key;
      let distance = Infinity;
      const centerY = drag.clientY + drag.centerOffset;
      for (const row of gridRef.current?.querySelectorAll<HTMLElement>(
        '.set-swipe-shell[data-flip-key]',
      ) ?? []) {
        const rect = row.getBoundingClientRect();
        const candidate = Math.abs(centerY - (rect.top + rect.height / 2));
        if (candidate < distance) {
          nearest = row.dataset.flipKey!;
          distance = candidate;
        }
      }
      if (drag.target !== nearest) {
        drag.target = nearest;
        setTargetKey(nearest);
      }
    },
    [gridRef],
  );

  useEffect(() => {
    if (!draggingKey) return;
    let frame = 0;
    const scroll = () => {
      const drag = dragRef.current;
      if (!drag) return;
      // Continue scrolling when a finger pauses near either viewport edge.
      const delta = drag.clientY < 160 ? -12 : drag.clientY > innerHeight - 90 ? 12 : 0;
      if (delta) window.scrollBy(0, delta);
      if (window.scrollY !== drag.scrollY) updatePosition(drag);
      frame = requestAnimationFrame(scroll);
    };
    const onScroll = () => {
      if (dragRef.current) updatePosition(dragRef.current);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      stopDrag();
    };
    frame = requestAnimationFrame(scroll);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('keydown', onEscape);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('keydown', onEscape);
    };
  }, [draggingKey, stopDrag, updatePosition]);

  useEffect(
    () => () => {
      stopDrag();
      resetStyles();
    },
    [stopDrag, resetStyles],
  );

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, key: string) {
    if (
      dragRef.current ||
      keys.length < 2 ||
      !event.isPrimary ||
      (event.pointerType === 'mouse' && event.button !== 0)
    )
      return false;
    const row = event.currentTarget.closest<HTMLElement>('.set-swipe-shell');
    const content = row?.querySelector<HTMLElement>('.set-swipe-content');
    if (!row || !content || !gridRef.current?.contains(row)) return false;
    event.preventDefault();
    event.stopPropagation();
    resetStyles();
    const rect = row.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      key,
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollY: window.scrollY,
      clientY: event.clientY,
      scrollY: window.scrollY,
      centerOffset: rect.top + rect.height / 2 - event.clientY,
      target: key,
      row,
      content,
      handle: event.currentTarget,
    };
    row.dataset.setReordering = 'true';
    row.dataset.flipSkip = 'true';
    row.style.setProperty('--set-drag-y', '0px');
    setDraggingKey(key);
    setTargetKey(key);
    return true;
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    drag.clientY = event.clientY;
    updatePosition(drag);
  }

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    moveDrag(event);
    const from = keys.indexOf(drag.key);
    const to = keys.indexOf(drag.target);
    stopDrag();
    if (from >= 0 && to >= 0 && from !== to) onMove(from, to);
  }

  function cancelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerId !== dragRef.current?.pointerId) return;
    event.stopPropagation();
    stopDrag();
  }

  return { draggingKey, targetKey, beginDrag, moveDrag, finishDrag, cancelDrag };
}
