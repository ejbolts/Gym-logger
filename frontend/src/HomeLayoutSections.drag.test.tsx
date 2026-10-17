// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeLayoutSections } from './HomeLayoutSections';
import { HOME_SECTIONS, type HomeLayout, type HomeSectionId } from './homeLayout';

let root: Root;
let container: HTMLDivElement;
let pointTarget: Element | null;
const changed = vi.fn();
const initial: HomeLayout = {
  order: ['consistency', 'friends', 'zone2', 'bodyweight-trend'],
  hidden: [],
  widths: { consistency: 'compact' },
};
function Harness() {
  const [layout, setLayout] = useState(initial);
  return (
    <HomeLayoutSections
      layout={layout}
      sections={
        Object.fromEntries(HOME_SECTIONS.map(({ id }) => [id, <p key={id}>{id}</p>])) as Record<
          HomeSectionId,
          React.ReactNode
        >
      }
      edit={{
        saving: false,
        onChange: (next) => {
          changed(next);
          setLayout(next);
        },
      }}
    />
  );
}
async function pointer(handle: Element, type: string) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 240, clientY: 300 });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
  await act(async () => {
    handle.dispatchEvent(event);
  });
}
async function begin(id: HomeSectionId) {
  const handle = container.querySelector<HTMLButtonElement>(
    `[data-home-section="${id}"] .home-drag-handle`,
  )!;
  handle.setPointerCapture = vi.fn();
  handle.hasPointerCapture = () => false;
  await pointer(handle, 'pointerdown');
  return handle;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => pointTarget,
  });
  pointTarget = null;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(document, 'elementFromPoint');
  vi.unstubAllGlobals();
  changed.mockClear();
});
describe('Home empty-space dragging', () => {
  it('highlights the empty half-row and fills it without changing the other card widths', async () => {
    const handle = await begin('zone2');
    pointTarget = container.querySelector('[data-home-drop-after="consistency"]');
    await pointer(handle, 'pointermove');
    expect(pointTarget!.classList.contains('is-drop-target')).toBe(true);
    await pointer(handle, 'pointerup');
    expect(changed.mock.lastCall![0]).toEqual({
      ...initial,
      order: ['consistency', 'zone2', 'friends', 'bodyweight-trend'],
      widths: { consistency: 'compact', zone2: 'compact' },
    });
    expect(container.querySelector('[data-home-drop-after="consistency"]')).toBeNull();
    expect(
      container.querySelector('[data-home-section="zone2"]')!.getAttribute('data-home-span'),
    ).toBe('3');
  });
  it('does not offer a half-row to a full-width card', async () => {
    const handle = await begin('friends');
    pointTarget = container.querySelector('[data-home-drop-after="consistency"]');
    await pointer(handle, 'pointermove');
    expect(pointTarget!.classList.contains('is-drop-target')).toBe(false);
    await pointer(handle, 'pointerup');
    expect(changed).not.toHaveBeenCalled();
  });
  it('cancels a highlighted drop without changing the draft', async () => {
    const handle = await begin('zone2');
    pointTarget = container.querySelector('[data-home-drop-after="consistency"]');
    await pointer(handle, 'pointermove');
    await act(async () => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    await pointer(handle, 'pointerup');
    expect(changed).not.toHaveBeenCalled();
    expect(container.querySelector('.is-dragging')).toBeNull();
    expect(container.querySelector('.is-drop-target')).toBeNull();
  });
  it('retains existing card-to-card reorder behaviour', async () => {
    const handle = await begin('zone2');
    pointTarget = container.querySelector('[data-home-section="consistency"]');
    await pointer(handle, 'pointermove');
    await pointer(handle, 'pointerup');
    expect(changed.mock.lastCall![0]).toEqual({
      ...initial,
      order: ['zone2', 'consistency', 'friends', 'bodyweight-trend'],
    });
  });
});
