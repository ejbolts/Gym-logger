// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { defaultHomeLayout, toggleHomeSectionWidth, type HomeLayout } from './homeLayout';
import { useHomeLayout } from './useHomeLayout';

vi.mock('./api', () => ({ api: { getHomeLayout: vi.fn(), saveHomeLayout: vi.fn() } }));
vi.mock('./userContext', () => {
  const session = { user: { id: 'sample-user' } };
  return { useUserSession: () => session };
});

let root: Root;
let container: HTMLDivElement;
let home: ReturnType<typeof useHomeLayout>;
const saved: HomeLayout = {
  ...defaultHomeLayout(),
  widths: { 'daily-check-in': 'compact', workouts: 'full' },
};

function Harness({ active }: { active: boolean }) {
  home = useHomeLayout(active);
  return <p>{home.editing ? 'Editing Home' : 'Viewing Home'}</p>;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.mocked(api.getHomeLayout).mockResolvedValue(saved);
  vi.mocked(api.saveHomeLayout).mockImplementation(async (layout) => layout);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('account Home layout drafts', () => {
  it('discards unsaved width edits when leaving the cached Today tab', async () => {
    await act(async () => root.render(<Harness active />));
    await act(async () => home.edit());
    expect(home.draft.widths).toEqual(saved.widths);
    expect(home.draft.widths).not.toBe(saved.widths);
    await act(async () => home.change(toggleHomeSectionWidth(home.draft, 'daily-check-in', 3)));
    expect(home.draft.widths?.['daily-check-in']).toBe('full');

    await act(async () => root.render(<Harness active={false} />));
    await act(async () => root.render(<Harness active />));
    expect(container.textContent).toBe('Viewing Home');
    expect(home.layout).toEqual(saved);
    expect(api.saveHomeLayout).not.toHaveBeenCalled();
    await act(async () => home.edit());
    expect(home.draft.widths).toEqual(saved.widths);
  });

  it('saves widths with order and visibility and cancel keeps the saved sizes', async () => {
    await act(async () => root.render(<Harness active />));
    await act(async () => home.edit());
    await act(async () => home.change(toggleHomeSectionWidth(home.draft, 'records', 6)));
    await act(async () => home.save());
    expect(api.saveHomeLayout).toHaveBeenCalledWith({
      ...saved,
      widths: { ...saved.widths, records: 'compact' },
    });
    expect(home.editing).toBe(false);
    await act(async () => home.edit());
    await act(async () => home.change(defaultHomeLayout()));
    await act(async () => home.cancel());
    await act(async () => home.edit());
    expect(home.draft.widths).toEqual({ ...saved.widths, records: 'compact' });
  });
});
