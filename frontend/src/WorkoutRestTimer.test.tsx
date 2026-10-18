// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RestTimerToast, WorkoutHeaderMeta, WorkoutRestTimer } from './WorkoutRestTimer';

describe('workout header rest timer', () => {
  it('shows the countdown with an accessible red-X skip control', () => {
    const markup = renderToStaticMarkup(<WorkoutRestTimer seconds={168} onSkip={vi.fn()} />);

    expect(markup).toContain('role="timer"');
    expect(markup).toContain('aria-label="Rest timer 2:48"');
    expect(markup).toContain('<strong>2:48</strong>');
    expect(markup).toContain('aria-label="Skip rest timer"');
    expect(markup).toContain('>×</button>');
  });

  it('keeps a dot separator between the duration and active timer', () => {
    const markup = renderToStaticMarkup(
      <WorkoutHeaderMeta durationLabel="Live 3:55:32" restSeconds={168} onSkipRest={vi.fn()} />,
    );

    expect(markup).toContain('Live 3:55:32');
    expect(markup).toContain(
      '<span class="workout-header-duration">Live 3:55:32</span><span class="workout-header-separator" aria-hidden="true">•</span><span class="workout-rest-timer"',
    );
  });

  it('shows only the duration when the timer is inactive', () => {
    const markup = renderToStaticMarkup(
      <WorkoutHeaderMeta durationLabel="Live 4:11:40" restSeconds={null} onSkipRest={vi.fn()} />,
    );

    expect(markup).toContain('<span class="workout-header-duration">Live 4:11:40</span>');
    expect(markup).not.toContain('workout-header-separator');
    expect(markup).not.toContain('workout-rest-timer');
  });

  it('reopens the popup from the time while the red × still skips the rest', () => {
    const markup = renderToStaticMarkup(
      <WorkoutRestTimer seconds={75} onSkip={vi.fn()} onShow={vi.fn()} />,
    );

    expect(markup).toContain(
      '<button type="button" class="workout-rest-timer-show" aria-label="Show rest timer, 1:15 left"><strong>1:15</strong></button>',
    );
    expect(markup).toContain('aria-label="Skip rest timer"');
  });
});

describe('rest timer popup', () => {
  it('shows the time left with Cancel, Dismiss and a bar sized to the rest remaining', () => {
    const markup = renderToStaticMarkup(
      <RestTimerToast seconds={45} totalSeconds={180} onDismiss={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(markup).toContain('role="timer"');
    expect(markup).toContain('aria-label="Rest timer 0:45"');
    expect(markup).toContain('<small>Rest</small><strong>0:45</strong>');
    expect(markup).toContain('aria-label="Cancel rest timer"');
    expect(markup).toContain(
      'aria-label="Dismiss rest timer popup and show it beside the live time"',
    );
    expect(markup).toContain('transform:scaleX(0.25)');
  });

  it('calls back separately when cancelled or dismissed', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const onCancel = vi.fn();
    const onDismiss = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <RestTimerToast
            seconds={90}
            totalSeconds={90}
            onDismiss={onDismiss}
            onCancel={onCancel}
          />,
        ),
      );
      const button = (label: string) =>
        container.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`)!;
      await act(async () => button('Dismiss').click());
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
      await act(async () => button('Cancel').click());
      expect(onCancel).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
