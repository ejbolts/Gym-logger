import { useId, type ReactNode } from 'react';
export function ConsistencyCard({
  streak,
  trainingDays,
  children,
}: {
  streak: number;
  trainingDays: number;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className="calendar-panel pulse-card" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>Consistency</h2>
        <span>Last 12 weeks</span>
      </header>
      <div className="consistency-stats">
        <div>
          <span>Streak</span>
          <b>
            {streak} {streak === 1 ? 'day' : 'days'}
          </b>
        </div>
        <div>
          <span>Training days</span>
          <b>{trainingDays}</b>
        </div>
        <div>
          <span>Avg / week</span>
          <b>{(trainingDays / 12).toFixed(1)}</b>
        </div>
      </div>
      {children}
    </section>
  );
}
