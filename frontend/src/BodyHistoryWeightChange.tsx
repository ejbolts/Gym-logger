import { Icon } from './Icon';
import {
  weightChangeAmount,
  type BodyHistoryWeightChange as WeightChange,
} from './bodyMeasurementHistory';
import type { WeightUnit } from './weightUnits';
import './bodyMeasurementHistory.css';

export function BodyHistoryWeightChange({
  change,
  comparison,
  unit,
  decimals,
  fixed = false,
}: {
  change: WeightChange | null;
  comparison: string;
  unit: WeightUnit;
  /** Decimal places the row's weight is shown with. */
  decimals: number;
  /** Whether the row's weight keeps trailing zeros, such as 90.0 kg. */
  fixed?: boolean;
}) {
  if (!change) return null;
  const amount = weightChangeAmount(change, unit, decimals, fixed);
  const label = `Weight ${change.direction === 'up' ? 'increased' : 'decreased'} by ${amount} ${unit} since ${comparison}${
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
      <span className="body-history-weight-change-amount num" aria-hidden="true">
        {amount}
      </span>
    </span>
  );
}
