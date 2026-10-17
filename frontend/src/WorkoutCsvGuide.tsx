import { useEffect, useRef, useState } from 'react';
import { PopupDialog } from './PopupDialog';
import { useWeightUnit } from './trainingPreferencesContext';
import { downloadWorkoutCsvTemplate, workoutCsvTemplateRows } from './workoutCsvTemplate';
import './workoutCsvGuide.css';

const PAGE_TITLES = ['What gets imported', 'Shape your file', 'Before you choose a file'];

/** Recommendations shown before choosing a workout CSV, from onboarding or Settings. */
export function WorkoutCsvGuide({
  onClose,
  onFileSelected,
}: {
  onClose: () => void;
  onFileSelected: (file: File) => void;
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
      title="Import workout history"
      kicker={`CSV GUIDE · ${page + 1} OF ${PAGE_TITLES.length}`}
      className="workout-csv-guide"
      onClose={onClose}
    >
      <div className="workout-csv-guide-body">
        <h3 ref={titleRef} tabIndex={-1}>
          {PAGE_TITLES[page]}
        </h3>
        {page === 0 && (
          <>
            <p>
              Each row in your file is one completed set. Rows are grouped into workouts by date,
              and exercises you have not used before are added for you. Charts, personal records and
              next-set suggestions then include your imported training.
            </p>
            <div className="workout-csv-guide-lists">
              <section aria-labelledby="csv-guide-included">
                <h4 id="csv-guide-included">Imported</h4>
                <ul>
                  <li>Date, exercise, weight, reps and warmup sets</li>
                  <li>Workout names, keeping two sessions on one date apart</li>
                  <li>Body weight logged with a set, for dates without a check-in</li>
                </ul>
              </section>
              <section aria-labelledby="csv-guide-excluded">
                <h4 id="csv-guide-excluded">Not imported</h4>
                <ul>
                  <li>RPE, rest times and duration</li>
                  <li>Notes, machine photos and videos</li>
                  <li>Supersets, cardio metrics and goals</li>
                </ul>
              </section>
            </div>
            <p className="workout-csv-guide-note">
              Body-weight check-ins on their own use the separate Bodyweight data CSV in Settings.
            </p>
          </>
        )}
        {page === 1 && (
          <>
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
                <strong>Keep dates as YYYY-MM-DD.</strong> Spreadsheets can change them to
                13/10/2026 when saving, so format the date column as text first.
              </li>
              <li>
                <strong>Use plain numbers,</strong> such as 82.5, without kg or lb.
              </li>
              <li>
                <strong>Moving from another app?</strong> Exports from apps such as Strong or Hevy
                use different column names. Rename them to match this layout in a spreadsheet first;
                other columns are left out and listed as warnings.
              </li>
            </ul>
            <p className="workout-csv-guide-note">
              Next, you review the sessions, sets and new exercises. Nothing is saved until you
              choose Save import, and sessions identical to ones already in your account are
              skipped. Remove sample workouts from Workout data once your own history is in.
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
          if (file) onFileSelected(file);
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
