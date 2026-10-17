import { useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useCollapseAnimation } from './motionHooks';
import { useSettingsReveal } from './settingsNavigation';
import './collapsibleSection.css';

/**
 * A section folded down to its heading until opened. The heading holds the toggle button; the
 * rest of the section slides open and closed with the same motion as exercise cards.
 */
export function CollapsibleSection({
  className,
  kicker,
  title,
  headingLevel = 2,
  headingClassName,
  badge,
  defaultExpanded = false,
  children,
}: {
  className: string;
  kicker?: string;
  title: string;
  headingLevel?: 2 | 3;
  headingClassName?: string;
  /** Status shown beside the chevron, so it stays visible while the section is folded. */
  badge?: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  useSettingsReveal(title, () => setExpanded(true));
  useCollapseAnimation(ref, expanded);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <section
      ref={ref}
      className={`${className} collapsible-section${expanded ? '' : ' is-collapsed'}`}
      aria-labelledby={`${id}-title`}
    >
      <header onClick={() => setExpanded((current) => !current)}>
        <div>
          {kicker && <p className="section-kicker">{kicker}</p>}
          <Heading id={`${id}-title`} className={headingClassName}>
            <button type="button" className="collapsible-toggle" aria-expanded={expanded}>
              <span>{title}</span>
              <span className="collapsible-toggle-end">
                {badge}
                <Icon name="chevron-down" />
              </span>
            </button>
          </Heading>
        </div>
      </header>
      {children}
    </section>
  );
}
