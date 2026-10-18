// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen';
import { submitAuthForm } from './authForm';
import { appGuideWaiting } from './appGuideState';

vi.mock('./authForm', async (original) => ({
  ...(await original<typeof import('./authForm')>()),
  submitAuthForm: vi.fn(),
}));

const user = {
  id: 'new-account',
  username: 'newlifter',
  display_name: 'New Lifter',
  is_admin: false,
  can_upload_videos: false,
  created_at: '2026-10-18T00:00:00Z',
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(submitAuthForm).mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('signup returns to login', () => {
  it('clears credentials without authenticating, queues onboarding, then permits explicit login', async () => {
    const authenticated = vi.fn();
    vi.mocked(submitAuthForm).mockResolvedValue({ ok: true, user });
    await act(async () => {
      root.render(
        <AuthScreen
          config={{ registration_open: true, invite_code_required: false }}
          initialMode="create-account"
          onAuthenticated={authenticated}
        />,
      );
    });
    async function fill(name: string, value: string) {
      const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          value,
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    async function submit() {
      await act(async () => {
        container
          .querySelector('form')!
          .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    }
    await fill('name', 'New Lifter');
    await fill('username', 'newlifter');
    await fill('password', 'sample signup password');
    await submit();
    expect(authenticated).not.toHaveBeenCalled();
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
      'Sign in',
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Account created. Sign in',
    );
    expect(container.querySelector<HTMLInputElement>('input[name="username"]')?.value).toBe('');
    expect(container.querySelector<HTMLInputElement>('input[name="password"]')?.value).toBe('');
    expect(container.querySelector('input[name="name"]')).toBeNull();
    expect(appGuideWaiting(user.id)).toBe(true);

    await fill('username', 'newlifter');
    await fill('password', 'sample signup password');
    await submit();
    expect(vi.mocked(submitAuthForm).mock.calls[1][0]).toBe('sign-in');
    expect(authenticated).toHaveBeenCalledExactlyOnceWith(user);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
