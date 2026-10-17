// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProfileAccountId } from './ProfileAccountId';
const id = 'd7131000-7937-40be-b8ee-8b02800f5a36';
let root: Root;
let container: HTMLDivElement;
const writeText = vi.fn();
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  writeText.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<ProfileAccountId accountId={id} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  writeText.mockReset();
  window.getSelection()?.removeAllRanges();
});
it('shows and copies the full account UUID', async () => {
  expect(container.querySelector('code')?.textContent).toBe(id);
  await act(async () => container.querySelector('button')!.click());
  expect(writeText).toHaveBeenCalledWith(id);
  expect(container.textContent).toContain('UUID copied.');
});
it('selects the UUID for manual copying when clipboard access fails', async () => {
  writeText.mockRejectedValueOnce(new Error('denied'));
  await act(async () => container.querySelector('button')!.click());
  expect(window.getSelection()?.toString()).toBe(id);
  expect(container.textContent).toContain('UUID selected.');
});
