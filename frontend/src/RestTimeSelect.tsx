import { formatSeconds } from './utils';

const REST_OPTIONS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300];

export function RestTimeSelect({
  seconds,
  label,
  onChange,
}: {
  seconds: number;
  label: string;
  onChange: (seconds: number) => void;
}) {
  const options = REST_OPTIONS.includes(seconds)
    ? REST_OPTIONS
    : [...REST_OPTIONS, seconds].sort((a, b) => a - b);
  return (
    <select
      value={seconds}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-label={label}
    >
      {options.map((value) => (
        <option key={value} value={value}>
          {formatSeconds(value)}
          {value === 0 ? ' (no rest)' : ''}
        </option>
      ))}
    </select>
  );
}
