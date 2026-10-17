import { api } from './api';
import type { BodyMeasurement } from './types';

export type UndoBodyweightCheckIn = () => Promise<void>;

/** Save immediately; undo restores the complete previous entry or removes a new one. */
export async function saveBodyweightCheckIn(
  previous: BodyMeasurement | null,
  date: string,
  weight: number,
): Promise<UndoBodyweightCheckIn> {
  const original = previous
    ? {
        measurement_date: previous.measurement_date,
        weight_kg: previous.weight_kg,
        body_fat_pct: previous.body_fat_pct,
        notes: previous.notes,
      }
    : null;
  const saved = await api.saveBodyMeasurement({
    measurement_date: date,
    weight_kg: weight,
    body_fat_pct: original?.body_fat_pct ?? null,
    notes: original?.notes ?? null,
  });
  return async () => {
    if (original) await api.saveBodyMeasurement(original);
    else await api.deleteBodyMeasurement(saved.id);
  };
}
