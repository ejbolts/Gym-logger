import { Icon } from './Icon';
import { CATEGORY_LABELS } from './trainingSummary';
import type {
  SharedWorkoutFilters as Filters,
  SharedWorkoutFilterOptions,
  WorkoutCategory,
} from './types';

export function SharedWorkoutFilters({
  filters,
  options,
  open,
  onToggle,
  onChange,
}: {
  filters: Filters;
  options: SharedWorkoutFilterOptions;
  open: boolean;
  onToggle: (open: boolean) => void;
  onChange: (next: Filters) => void;
}) {
  const active = Object.values(filters).filter(Boolean).length;
  return (
    <details
      className="shared-workout-filters"
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
    >
      <summary>
        <Icon name="filter" /> Filter workouts {active > 0 && <span>{active}</span>}
      </summary>
      <div className="shared-workout-filter-fields">
        <label>
          Workout type
          <select
            aria-label="Workout type"
            value={filters.workout_type_id ? `custom:${filters.workout_type_id}` : filters.category}
            onChange={(event) => {
              const value = event.target.value;
              if (value.startsWith('custom:')) {
                onChange({ ...filters, category: '', workout_type_id: value.slice(7) });
              } else {
                const next = { ...filters, category: value as WorkoutCategory | '' };
                delete next.workout_type_id;
                onChange(next);
              }
            }}
          >
            <option value="">All types</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
            {options.workout_types
              ?.filter((type) => type.is_custom)
              .map((type) => (
                <option value={`custom:${type.id}`} key={type.id}>
                  {type.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Exercise
          <select
            aria-label="Exercise"
            value={filters.exercise_id}
            onChange={(event) => onChange({ ...filters, exercise_id: event.target.value })}
          >
            <option value="">All exercises</option>
            {options.exercises.map((exercise) => (
              <option value={exercise.id} key={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </select>
        </label>
        {options.machines.length > 0 && (
          <label>
            Machine
            <select
              aria-label="Machine"
              value={filters.machine_photo_id}
              onChange={(event) => onChange({ ...filters, machine_photo_id: event.target.value })}
            >
              <option value="">All shared machines</option>
              {options.machines.map((machine) => (
                <option value={machine.id} key={machine.id}>
                  {machine.caption}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          From
          <input
            aria-label="From"
            type="date"
            value={filters.start_date}
            onChange={(event) => onChange({ ...filters, start_date: event.target.value })}
          />
        </label>
        <label>
          To
          <input
            aria-label="To"
            type="date"
            value={filters.end_date}
            onChange={(event) => onChange({ ...filters, end_date: event.target.value })}
          />
        </label>
        {active > 0 && (
          <button
            className="text-link"
            type="button"
            onClick={() =>
              onChange({
                category: '',
                exercise_id: '',
                machine_photo_id: '',
                start_date: '',
                end_date: '',
              })
            }
          >
            Reset filters
          </button>
        )}
      </div>
    </details>
  );
}
