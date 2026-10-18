import { useEffect, useRef, useState } from 'react';
import { PopupDialog } from './PopupDialog';
import { useWeightUnit } from './trainingPreferencesContext';
import { downloadWorkoutCsvTemplate, workoutCsvTemplateRows } from './workoutCsvTemplate';
import { WorkoutImportSource } from './WorkoutImportSource';
import type { WorkoutImportOptions } from './types';
import './workoutCsvGuide.css';

const PAGE_TITLES = ['What gets imported', 'Shape your file', 'Before you choose a file'];

/** Recommendations shown before choosing a workout CSV, from onboarding or Settings. */
export function WorkoutCsvGuide({
  onClose,
  onFileSelected,
  options,
  onOptionsChange,
}: {
  onClose: () => void;
  onFileSelected: (file: File, options: WorkoutImportOptions) => void;
  options: WorkoutImportOptions;
  onOptionsChange: (options: WorkoutImportOptions) => void;
}) {
  const [page, setPage] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const unit = useWeightUnit();
  const [header, ...examples] = workoutCsvTemplateRows(unit);
  const last = page === PAGE_TITLES.length - 1;

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    document.querySelector('.workout-csv-guide')?.scrollTo(0, 0);
  }, [page]);

  return (
    <PopupDialog
      title="Import workouts & bodyweight"
      kicker={`CSV GUIDE · ${page + 1} OF ${PAGE_TITLES.length}`}
      className="workout-csv-guide"
      onClose={onClose}
    >
      <div className="workout-csv-guide-body">
        <h3 ref={titleRef} tabIndex={-1}>
          {page === 1 && options.source !== 'gym' ? 'Use your original export' : PAGE_TITLES[page]}
        </h3>
        {page === 0 && (
          <>
            <WorkoutImportSource value={options} onChange={onOptionsChange} />
            <p>
              Each workout row is one completed set. Rows are grouped into sessions, and exercises
              you have not used before are added for you. Charts, personal records and next-set
              suggestions then include your imported training.
            </p>
            <div className="workout-csv-guide-lists">
              <section aria-labelledby="csv-guide-included">
                <h4 id="csv-guide-included">Imported</h4>
                <ul>
                  <li>Date, exercise, weight, reps and warmup sets</li>
                  <li>Hevy / Strong: RPE, notes, duration, distance and drop sets</li>
                  <li>Workout names, keeping two sessions on one date apart</li>
                  <li>Body weight logged with a set, for dates without a check-in</li>
                </ul>
              </section>
              <section aria-labelledby="csv-guide-excluded">
                <h4 id="csv-guide-excluded">Not imported</h4>
                <ul>
                  <li>Rest timers, machine photos and videos</li>
                  <li>Superset grouping and goals</li>
                  <li>Fields absent from the original export</li>
                </ul>
              </section>
            </div>
            <p className="workout-csv-guide-note">
              Strong measurement exports and Gym Logger bodyweight CSVs use the same file picker.
              Upload one file at a time. Existing check-ins are kept.
            </p>
          </>
        )}
        {page === 1 && options.source !== 'gym' && (
          <>
            <p>
              No column renaming or spreadsheet editing is needed. Export a CSV from your chosen app
              and upload that file.
            </p>
            <ol className="workout-csv-guide-tips">
              <li>
                Save the CSV export from{' '}
                {options.source === 'strengthlevel'
                  ? 'Strength Level'
                  : options.source === 'hevy'
                    ? 'Hevy'
                    : 'Strong'}{' '}
                to your device.
              </li>
              <li>
                {options.source === 'strong'
                  ? 'For workouts, match the kg/lb and km/miles choices to Strong’s export settings. Measurement files supply their own units; import these separately from workouts.'
                  : options.source === 'hevy'
                    ? 'Keep the original start_time and weight_kg columns. Separate workouts on one date stay separate.'
                    : 'Keep Date Lifted, Exercise and Reps. Kilogram or pound columns work. The export has dates only, so sets on one date are combined.'}
              </li>
              <li>
                Choose the file, review totals and warnings, then Save import. Upload one file at a
                time.
              </li>
            </ol>
            <p className="workout-csv-guide-note">
              Exercise names match the library where recognised; other names become custom
              exercises. Weights are kept as recorded, including each app’s per-dumbbell or
              assisted-load conventions. Existing workouts and check-ins are preserved.
            </p>
          </>
        )}
        {page === 1 && options.source === 'gym' && (
          <>
            <p className="workout-csv-guide-note">
              Bodyweight CSVs are detected automatically: Date and Weight (kg) are required; Body
              Fat (%) and Notes are optional. Existing check-in dates are skipped. For workout CSVs,
              use the columns below.
            </p>
            <p>
              Put column names in the first row, then add one row for every set. Repeat the date and
              exercise on each row. Column order does not matter.
            </p>
            <dl className="workout-csv-guide-columns">
              <div>
                <dt>Date Lifted</dt>
                <dd>Required. Year-month-day, such as 2026-10-13.</dd>
              </div>
              <div>
                <dt>Exercise</dt>
                <dd>
                  Required. Names from the exercise library match your existing exercises; new names
                  become custom exercises.
                </dd>
              </div>
              <div>
                <dt>Reps</dt>
                <dd>Required column. Whole numbers; leave a set blank if reps were not counted.</dd>
              </div>
              <div>
                <dt>Weight (kg) or Weight (lb)</dt>
                <dd>Numbers only. Leave blank for bodyweight exercises.</dd>
              </div>
              <div>
                <dt>Warmup</dt>
                <dd>Optional. 1 for a warmup set, otherwise 0. Yes/no also works.</dd>
              </div>
              <div>
                <dt>Workout ID and Workout name</dt>
                <dd>
                  Optional. Give rows of one session the same ID, such as w1, and a name to show in
                  History.
                </dd>
              </div>
              <div>
                <dt>Bodyweight (kg) or Bodyweight (lb)</dt>
                <dd>Optional. Your body weight on that date.</dd>
              </div>
            </dl>
            <div className="workout-csv-guide-example">
              <table>
                <caption>Example rows</caption>
                <thead>
                  <tr>
                    {header.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {examples.slice(0, 4).map((row, index) => (
                    <tr key={index}>
                      {row.map((value, column) => (
                        <td key={column}>{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="workout-csv-guide-template"
              onClick={() => downloadWorkoutCsvTemplate(unit)}
            >
              ↓ Download template CSV
            </button>
          </>
        )}
        {last && (
          <>
            <ul className="workout-csv-guide-tips">
              <li>
                <strong>Save as CSV UTF-8.</strong> Comma-separated is best; semicolons and text
                copied from a spreadsheet with tabs also work. Files can be up to 20 MB.
              </li>
              <li>
                <strong>Keep the export unchanged.</strong> App-specific dates are read
                automatically. Your own spreadsheet should use YYYY-MM-DD dates.
              </li>
              <li>
                <strong>Use plain numbers,</strong> such as 82.5, without kg or lb.
              </li>
              <li>
                <strong>Check the selected app and units.</strong> Choose Strength Level, Hevy or
                Strong for that app’s original export. Warnings explain skipped or unsupported data.
              </li>
            </ul>
            <p className="workout-csv-guide-note">
              Next, you review the sessions, sets and new exercises. Nothing is saved until you
              choose Save import, and sessions identical to ones already in your account are
              skipped. Remove sample workouts from Workouts &amp; bodyweight once your own history
              is in.
            </p>
          </>
        )}
      </div>
      <input
        ref={input}
        className="sr-only"
        aria-label="Workout CSV file"
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) onFileSelected(file, options);
        }}
      />
      <footer className="popup-dialog-actions workout-csv-guide-actions">
        <button type="button" className="workout-csv-guide-close" onClick={onClose}>
          Close
        </button>
        {page > 0 && (
          <button type="button" onClick={() => setPage(page - 1)}>
            Back
          </button>
        )}
        {last ? (
          <button
            type="button"
            className="popup-primary-action"
            onClick={() => input.current?.click()}
          >
            Choose CSV file
          </button>
        ) : (
          <button type="button" className="popup-primary-action" onClick={() => setPage(page + 1)}>
            Next <span aria-hidden="true">→</span>
          </button>
        )}
      </footer>
    </PopupDialog>
  );
}
