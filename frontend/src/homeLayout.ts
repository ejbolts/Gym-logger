import type { IconName } from './Icon';

export const HOME_SECTIONS = [
  {
    id: 'next-workout',
    title: 'Next workout',
    description: 'Your suggested session',
    icon: 'plus',
    size: 'full',
  },
  {
    id: 'workouts',
    title: 'Workouts',
    description: 'Weekly count and trend',
    icon: 'calendar',
    size: 'stat',
  },
  {
    id: 'cardio-sessions',
    title: 'Cardio sessions',
    description: 'Weekly count and trend',
    icon: 'heart',
    size: 'stat',
  },
  {
    id: 'weekly-bodyweight',
    title: 'Body weight',
    description: 'Weekly average and trend',
    icon: 'body',
    size: 'stat',
  },
  {
    id: 'consistency',
    title: 'Consistency',
    description: 'Streak and training calendar',
    icon: 'calendar',
    size: 'full',
  },
  {
    id: 'muscle-sets',
    title: 'Sets per muscle',
    description: 'Working sets this week',
    icon: 'pulse',
    size: 'full',
  },
  {
    id: 'zone2',
    title: 'Zone 2 cardio',
    description: 'Minutes and weekly goal',
    icon: 'heart',
    size: 'half',
  },
  {
    id: 'bodyweight-trend',
    title: 'Bodyweight trend',
    description: 'Recent check-ins and change',
    icon: 'trend',
    size: 'half',
  },
  {
    id: 'daily-check-in',
    title: 'Daily check-in',
    description: 'Log today’s bodyweight',
    icon: 'body',
    size: 'full',
  },
  {
    id: 'records',
    title: 'Recent records',
    description: 'Your latest strength milestones',
    icon: 'trophy',
    size: 'full',
  },
] as const satisfies ReadonlyArray<{
  id: string;
  title: string;
  description: string;
  icon: IconName;
  size: string;
}>;

export type HomeSectionId = (typeof HOME_SECTIONS)[number]['id'];
export interface HomeLayout {
  order: HomeSectionId[];
  hidden: HomeSectionId[];
}

export function defaultHomeLayout(): HomeLayout {
  return { order: HOME_SECTIONS.map((section) => section.id), hidden: [] };
}

/** Fill each row when hiding or moving a small card leaves fewer neighbours. */
export function homeSectionSpans(ids: HomeSectionId[]): number[] {
  const spans: number[] = [];
  for (let start = 0; start < ids.length;) {
    const size = HOME_SECTIONS.find((section) => section.id === ids[start])!.size;
    let end = start + 1;
    while (
      end < ids.length &&
      HOME_SECTIONS.find((section) => section.id === ids[end])!.size === size
    )
      end++;
    const perRow = size === 'stat' ? 3 : size === 'half' ? 2 : 1;
    for (let row = start; row < end; row += perRow) {
      const count = Math.min(perRow, end - row);
      for (let item = 0; item < count; item++) spans.push(6 / count);
    }
    start = end;
  }
  return spans;
}

/** Move to the target's position, preserving hidden sections and every other section. */
export function moveHomeSection(
  layout: HomeLayout,
  source: HomeSectionId,
  target: HomeSectionId,
): HomeLayout {
  const sourceIndex = layout.order.indexOf(source);
  const targetIndex = layout.order.indexOf(target);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return layout;
  const order = [...layout.order];
  order.splice(sourceIndex, 1);
  order.splice(targetIndex, 0, source);
  return { ...layout, order };
}

export function toggleHomeSection(layout: HomeLayout, id: HomeSectionId): HomeLayout {
  return {
    ...layout,
    hidden: layout.hidden.includes(id)
      ? layout.hidden.filter((item) => item !== id)
      : [...layout.hidden, id],
  };
}
