import { Icon } from './Icon';
import type { BodyHistoryWeightChange as WeightChange } from './bodyMeasurementHistory';
import './bodyMeasurementHistory.css';

export function BodyHistoryWeightChange({
  change,
  comparison,
}: {
  change: WeightChange | null;
  comparison: string;
}) {
  if (!change) return null;
  const label = `Weight ${change.direction === 'up' ? 'increased' : 'decreased'} since ${comparison}${
    change.goalDirection
      ? `; ${change.status === 'favorable' ? 'in line with' : 'opposite to'} weight-${change.goalDirection} goal`
      : ''
  }`;
  return (
    <span
      className={`body-history-weight-change ${change.status}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon name={change.direction} />
    </span>
  );
}
