import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomeLayoutEditor, HomeLayoutSections } from './HomeLayoutSections';
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

  it('offers hidden sections separately and accessible move controls', () => {
    const layout = defaultHomeLayout();
    layout.hidden = ['consistency'];
    const markup = renderToStaticMarkup(
      <HomeLayoutEditor
        draft={layout}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        saving={false}
        error={null}
      />,
    );
    expect(markup).toContain('aria-label="Drag Next workout to reorder"');
    expect(markup).toContain('aria-label="Move Workouts up"');
    expect(markup).not.toContain('data-layout-section="consistency"');
    expect(markup).toContain('Add sections');
    expect(markup).toContain('Save layout');
  });
});
