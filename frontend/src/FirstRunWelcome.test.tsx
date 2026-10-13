// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstRunWelcome } from './FirstRunWelcome';
import { SampleDataBanner } from './SampleDataBanner';

let root: Root;
let container: HTMLDivElement;

beforeAll(() => {
  // jsdom has no modal dialog support; opening is enough for these tests.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function button(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label,
  );
  expect(match, `button "${label}"`).toBeDefined();
  return match!;
}

const hasButton = (label: string) =>
  [...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === label);

function welcome(overrides: Partial<Parameters<typeof FirstRunWelcome>[0]> = {}) {
  const props = {
    name: 'Riley',
    sampleWorkouts: 5,
    sampleMeasurements: 3,
    onRemoveSamples: vi.fn().mockResolvedValue(undefined),
    onStartWorkout: vi.fn(),
    onTakeTour: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { props, element: <FirstRunWelcome {...props} /> };
}

describe('first-run welcome', () => {
  it('leads with three essentials and the first workout, with the tour optional', async () => {
    const { props, element } = welcome({ sampleWorkouts: 0, sampleMeasurements: 0 });
    await act(async () => root.render(element));

    expect(document.body.textContent).toContain('Welcome, Riley');
    expect(document.querySelectorAll('.first-run-essentials li')).toHaveLength(3);
    expect(document.body.textContent).toContain('Tick off each set');
    expect(document.body.textContent).toContain('rest timer starts');
    expect(document.querySelector('.first-run-samples')).toBeNull();

    button('Start my first workout').click();
    button('Take the full tour').click();
    button('Not now').click();
    expect(props.onStartWorkout).toHaveBeenCalledTimes(1);
    expect(props.onTakeTour).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('offers keeping the sample data without deleting anything', async () => {
    const { props, element } = welcome();
    await act(async () => root.render(element));

    expect(document.body.textContent).toContain('5 sample workouts and 3 body check-ins');
    await act(async () => button('Keep sample data to explore').click());
    expect(document.body.textContent).toContain('Keeping the sample week to explore');
    expect(props.onRemoveSamples).not.toHaveBeenCalled();
  });

  it('removes the samples only after an explicit confirmation', async () => {
    const { props, element } = welcome();
    await act(async () => root.render(element));

    await act(async () => button('Start with my own data').click());
    expect(props.onRemoveSamples).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('cannot be undone');
    await act(async () => button('Cancel').click());
    expect(hasButton('Remove sample data')).toBe(false);

    await act(async () => button('Start with my own data').click());
    await act(async () => button('Remove sample data').click());
    expect(props.onRemoveSamples).toHaveBeenCalledTimes(1);
    // The removed samples no longer reach the welcome, but the outcome stays visible.
    await act(async () =>
      root.render(<FirstRunWelcome {...props} sampleWorkouts={0} sampleMeasurements={0} />),
    );
    expect(document.body.textContent).toContain('Sample data removed');
  });

  it('keeps the choice open and explains a failed removal', async () => {
    const { element } = welcome({
      onRemoveSamples: vi.fn().mockRejectedValue(new Error('Server unavailable')),
    });
    await act(async () => root.render(element));

    await act(async () => button('Start with my own data').click());
    await act(async () => button('Remove sample data').click());
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Server unavailable');
    expect(hasButton('Remove sample data')).toBe(true);
  });
});

describe('Home sample data banner', () => {
  it('labels the sample week and can collapse without being dismissed', async () => {
    await act(async () =>
      root.render(<SampleDataBanner workoutCount={5} measurementCount={3} onRemove={vi.fn()} />),
    );
    const banner = container.querySelector('.sample-data-banner')!;
    expect(banner.textContent).toContain("You're exploring sample data");
    expect(banner.textContent).toContain('5 sample workouts and 3 body check-ins');

    const toggle = container.querySelector<HTMLButtonElement>('.sample-data-banner-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // Collapsed, it still says the data is a sample; there is no way to hide it entirely.
    expect(container.querySelector('.sample-data-banner')?.textContent).toContain(
      "You're exploring sample data",
    );
    expect(window.localStorage.getItem('gym-logger-sample-banner-collapsed')).toBe('1');
  });

  it('asks for confirmation before removing, and shows a failure in the dialog', async () => {
    const onRemove = vi.fn().mockRejectedValueOnce(new Error('Could not reach the server'));
    await act(async () =>
      root.render(<SampleDataBanner workoutCount={5} measurementCount={3} onRemove={onRemove} />),
    );

    await act(async () => button('Remove sample data').click());
    expect(onRemove).not.toHaveBeenCalled();
    const dialog = document.querySelector('.sample-remove-dialog')!;
    expect(dialog.textContent).toContain('Remove sample data?');
    expect(dialog.textContent).toContain('This cannot be undone.');

    await act(async () => button('Keep sample data').click());
    expect(document.querySelector('.sample-remove-dialog')).toBeNull();
    expect(onRemove).not.toHaveBeenCalled();

    await act(async () => button('Remove sample data').click());
    await act(async () =>
      document.querySelector<HTMLButtonElement>('.sample-remove-confirm')!.click(),
    );
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.sample-remove-dialog [role="alert"]')?.textContent).toBe(
      'Could not reach the server',
    );
  });
});
