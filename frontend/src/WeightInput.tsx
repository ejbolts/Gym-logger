import { useState, type InputHTMLAttributes } from 'react';
import { useWeightUnit } from './trainingPreferencesContext';
import { weightInputKg, weightInputValue, type WeightUnit } from './weightUnits';

/** The parent owns canonical kg; only the focused input owns a temporary display string. */
export function WeightInput({
  weightKg,
  onWeightChange,
  selectOnFocus = false,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  weightKg: number | null;
  onWeightChange: (kg: number | null) => void;
  selectOnFocus?: boolean;
}) {
  const unit = useWeightUnit();
  const [draft, setDraft] = useState<{ value: string; unit: WeightUnit } | null>(null);
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={draft?.unit === unit ? draft.value : weightInputValue(weightKg, unit)}
      onFocus={(event) => {
        setDraft({ value: event.currentTarget.value, unit });
        if (selectOnFocus && weightKg !== null) event.currentTarget.select();
        props.onFocus?.(event);
      }}
      onClick={(event) => {
        if (selectOnFocus && weightKg !== null) event.currentTarget.select();
        props.onClick?.(event);
      }}
      onChange={(event) => {
        const value = event.target.value.replace(',', '.');
        if (!/^\d*(?:\.\d*)?$/.test(value)) return;
        setDraft({ value, unit });
        const kg = weightInputKg(value, unit, weightKg);
        if (kg !== weightKg) onWeightChange(kg);
      }}
      onBlur={(event) => {
        if (draft?.unit === unit) {
          const kg = weightInputKg(draft.value, unit, weightKg);
          if (kg !== weightKg) onWeightChange(kg);
        }
        setDraft(null);
        props.onBlur?.(event);
      }}
    />
  );
}
