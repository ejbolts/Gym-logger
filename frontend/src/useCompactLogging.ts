import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  compactLayout,
  compactLoggingPreferenceEnabled,
  compactWorkoutProgress,
  NO_COMPACT_OVERRIDES,
  overridesAfterSetInteraction,
  saveCompactLoggingPreference,
  toggleCompactMovement,
  type CompactOverrides,
} from './compactWorkout';
import type { WorkoutDraftMovement } from './workoutMovements';

/** What a movement card needs to render in compact mode; absent when compact mode is off. */
export interface CompactCardState {
  expanded: boolean;
  current: boolean;
  nextSetKey: string | null;
  onToggle: () => void;
}

/**
 * Compact logging state for the live workout. It only decides which cards are folded; the
 * draft movements and sets are never changed by it.
 */
export function useCompactLogging(movements: WorkoutDraftMovement[], available: boolean) {
  const [preferenceEnabled, setPreferenceEnabled] = useState(compactLoggingPreferenceEnabled);
  const [preferredKey, setPreferredKey] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<CompactOverrides>(NO_COMPACT_OVERRIDES);
  const enabled = available && preferenceEnabled;
  const layout = useMemo(
    () => compactLayout(movements, preferredKey, overrides),
    [movements, preferredKey, overrides],
  );

  function setEnabled(next: boolean) {
    setPreferenceEnabled(next);
    saveCompactLoggingPreference(next);
  }

  /** Call when the lifter edits, logs or adds a set, so that exercise becomes current. */
  function noteSetInteraction(movementKey: string) {
    setOverrides((current) =>
      overridesAfterSetInteraction(movements, preferredKey, current, movementKey),
    );
    setPreferredKey(movementKey);
  }

  function cardState(movementKey: string): CompactCardState | undefined {
    if (!enabled) return undefined;
    return {
      expanded: layout.expandedKeys.has(movementKey),
      current: layout.currentKeys.has(movementKey),
      nextSetKey: layout.nextSet?.movementKey === movementKey ? layout.nextSet.setKey : null,
      onToggle: () =>
        setOverrides((current) =>
          toggleCompactMovement(movements, preferredKey, current, movementKey),
        ),
    };
  }

  return {
    available,
    enabled,
    setEnabled,
    noteSetInteraction,
    cardState,
    progress: compactWorkoutProgress(movements),
  };
}

/**
 * Keeps keyboard focus on the same exercise when its card folds or unfolds: on the summary row
 * after collapsing, and on the collapse control after expanding.
 * `collapsed` is null when compact mode is off.
 */
export function useCompactCardFocus(
  cardRef: RefObject<HTMLElement | null>,
  collapsed: boolean | null,
) {
  const previous = useRef(collapsed);
  const focusWithin = useRef(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const enter = () => {
      focusWithin.current = true;
    };
    const leave = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && !card.contains(event.relatedTarget)) {
        focusWithin.current = false;
      }
    };
    card.addEventListener('focusin', enter);
    card.addEventListener('focusout', leave);
    return () => {
      card.removeEventListener('focusin', enter);
      card.removeEventListener('focusout', leave);
    };
  }, [cardRef]);

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = collapsed;
    const card = cardRef.current;
    if (!card || before === null || collapsed === null || before === collapsed) return;
    const active = document.activeElement;
    const focusLost = !active || active === document.body;
    const focusInside = active instanceof Node && card.contains(active);
    if (!focusInside && !(focusLost && focusWithin.current)) return;
    card
      .querySelector<HTMLElement>(
        collapsed ? '.compact-movement-summary-button' : '.movement-expand-toggle',
      )
      ?.focus({ preventScroll: true });
  }, [cardRef, collapsed]);
}
