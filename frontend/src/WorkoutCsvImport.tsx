import { useRef, useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import type { CsvImportPreview } from './types';

export function WorkoutImportReview({
  fileName,
  preview,
  saving,
  error,
  onCancel,
  onSave,
}: {
  fileName: string;
  preview: CsvImportPreview;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <PopupDialog title="Review workout import" kicker="CSV IMPORT" onClose={onCancel}>
      <div className="workout-import-review">
        <p className="workout-import-filename">{fileName}</p>
        <p>
          <strong>{preview.workouts_to_create} sessions</strong> and{' '}
          <strong>{preview.sets_to_import} sets</strong> will be added.
          {preview.workouts_to_skip > 0 && (
            <> {preview.workouts_to_skip} identical existing sessions will be skipped.</>
          )}
        </p>
        <p>
          {preview.new_exercises.length
            ? `New exercises: ${preview.new_exercises.join(', ')}.`
            : 'No new exercises.'}
        </p>
        <p className="workout-import-safety">
          Nothing is saved until you choose Save import. Existing workouts and body-weight check-ins
          are kept. Missing body-weight dates may be added from these sets. Duplicates and save
          limits are checked again when saving.
        </p>
        {preview.warnings.length > 0 && (
          <details className="workout-import-warnings" open>
            <summary>Warnings ({preview.warnings.length})</summary>
            <ul>
              {preview.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </details>
        )}
        <ul className="workout-import-sessions" aria-label="Sessions in this file">
          {preview.sessions.slice(0, 50).map((session, index) => (
            <li key={index}>
              <div>
                <strong>{session.name}</strong>
                <span>{session.duplicate ? 'Skip duplicate' : 'Add session'}</span>
              </div>
              <small>
                {session.workout_date} · {session.sets} sets · {session.exercises.join(', ')}
              </small>
            </li>
          ))}
        </ul>
        {preview.sessions.length > 50 && (
          <p>
            Showing the first 50 of {preview.sessions.length} sessions. Totals include all rows.
          </p>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="popup-dialog-actions">
          <button type="button" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="popup-primary-action"
            disabled={saving || preview.workouts_to_create === 0}
            onClick={onSave}
          >
            {saving ? 'Saving…' : 'Save import'}
          </button>
        </div>
      </div>
    </PopupDialog>
  );
}

export function WorkoutCsvImport({ onImport }: { onImport: (file: File) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<{ file: File; preview: CsvImportPreview } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectFile(file: File) {
    setError(null);
    setPreviewing(true);
    try {
      const preview = await api.previewWorkoutImport(file);
      setReview({ file, preview });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not review that CSV file.');
    } finally {
      setPreviewing(false);
    }
  }

  function cancel() {
    if (saving) return;
    setReview(null);
    setError(null);
  }

  async function save() {
    if (!review || saving || review.preview.workouts_to_create === 0) return;
    setError(null);
    setSaving(true);
    try {
      await onImport(review.file);
      setReview(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that import.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        className="sr-only"
        aria-label="Workout CSV file"
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void selectFile(file);
        }}
      />
      <button type="button" disabled={previewing || saving} onClick={() => input.current?.click()}>
        {previewing ? 'Reviewing…' : '↑ Import workout CSV'}
      </button>
      {error && !review && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {review && (
        <WorkoutImportReview
          fileName={review.file.name}
          preview={review.preview}
          saving={saving}
          error={error}
          onCancel={cancel}
          onSave={() => void save()}
        />
      )}
    </>
  );
}
