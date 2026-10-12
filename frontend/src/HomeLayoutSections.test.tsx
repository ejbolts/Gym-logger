import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomeLayoutSections } from './HomeLayoutSections';
import { defaultHomeLayout, HOME_SECTIONS, type HomeSectionId } from './homeLayout';

describe('Home layout rendering', () => {
  const sections = Object.fromEntries(
    HOME_SECTIONS.map(({ id }) => [id, <p key={id}>{id}</p>]),
  ) as Record<HomeSectionId, React.ReactNode>;

  it('renders saved order, hides cards, and skips the active-workout placeholder', () => {
    const layout = defaultHomeLayout();
    layout.order.reverse();
    layout.hidden = ['consistency'];
    const markup = renderToStaticMarkup(
      <HomeLayoutSections layout={layout} sections={{ ...sections, 'next-workout': null }} />,
    );
    expect(markup.indexOf('data-home-section="records"')).toBeLessThan(
      markup.indexOf('data-home-section="workouts"'),
    );
    expect(markup).not.toContain('data-home-section="consistency"');
    expect(markup).not.toContain('data-home-section="next-workout"');
  });

  it('keeps a recovery instruction when everything is hidden', () => {
    const layout = defaultHomeLayout();
    layout.hidden = [...layout.order];
    expect(
      renderToStaticMarkup(<HomeLayoutSections layout={layout} sections={sections} />),
    ).toContain('Use the edit button to add sections');
  });

  it('edits the actual cards, locks their content, and exposes hide/drag controls', () => {
    const layout = defaultHomeLayout();
    layout.hidden = ['consistency'];
    const markup = renderToStaticMarkup(
      <HomeLayoutSections
        layout={layout}
        sections={sections}
        edit={{ onChange: vi.fn(), onSave: vi.fn(), onCancel: vi.fn(), saving: false, error: null }}
      />,
    );
    expect(markup).toContain('aria-label="Drag Next workout to reorder"');
    expect(markup).toContain('aria-label="Hide Workouts"');
    expect(markup).toContain('class="home-section-content" inert=""');
    expect(markup).toContain('<p>workouts</p>');
    expect(markup).not.toContain('data-home-section="consistency"');
    expect(markup).not.toContain('home-layout-list');
    expect(markup).toContain('aria-label="Add Consistency"');
    expect(markup).toContain('Add sections');
    expect(markup).toContain('Save layout');
  });

  it('keeps editing controls out of the normal cards', () => {
    const markup = renderToStaticMarkup(
      <HomeLayoutSections layout={defaultHomeLayout()} sections={sections} />,
    );
    expect(markup).not.toContain('inert=""');
    expect(markup).not.toContain('home-drag-handle');
    expect(markup).not.toContain('home-card-hide');
  });

  it('can configure next-workout visibility during an active workout', () => {
    const markup = renderToStaticMarkup(
      <HomeLayoutSections
        layout={defaultHomeLayout()}
        sections={{ ...sections, 'next-workout': null }}
        edit={{ onChange: vi.fn(), onSave: vi.fn(), onCancel: vi.fn(), saving: false, error: null }}
      />,
    );
    expect(markup).toContain('Your active workout stays above the cards.');
    expect(markup).toContain('aria-label="Hide Next workout"');
  });
});
