from __future__ import annotations

import csv
import io
import math
import re
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .exercise_aliases import canonical_exercise_name
from .models import (
    BodyMeasurement,
    Exercise,
    ExerciseKind,
    SetType,
    TrainingWorkout,
    WorkoutCategory,
    WorkoutMovement,
    WorkoutSet,
)
from .workout_category import infer_workout_category

CSV_HEADERS = (
    "Date Lifted",
    "Exercise",
    "Weight (kg)",
    "Weight (lb)",
    "Reps",
    "Bodyweight (kg)",
    "Bodyweight (lb)",
    "Percentile (%)",
    "Warmup",
)
SESSION_HEADERS = ("Workout ID", "Workout name")
# Exports always write every column; hand-made files need only these.
REQUIRED_HEADERS = ("Date Lifted", "Exercise", "Reps")
WEIGHT_HEADERS = ("Weight (kg)", "Weight (lb)")
# Comma, tab (copied from a spreadsheet) or semicolon (spreadsheets in many locales).
DELIMITERS = (",", "\t", ";")
KG_TO_LB = 2.2046226218
IMPORTED_BODYWEIGHT_NOTE = "Imported from workout CSV."
# Some apps and spreadsheets add a time of day; the date part is used as written.
ISO_DATE = re.compile(r"(\d{4}-\d{2}-\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?")
# A decimal comma, such as 82,5. Three digits after a comma read as thousands, so are refused.
DECIMAL_COMMA = re.compile(r"[+-]?\d+,\d{1,2}")


def header_key(name: str) -> str:
    """Match column names regardless of case and spacing, such as `weight(kg)`."""
    return re.sub(r"\s+", "", name).casefold()


KNOWN_HEADERS = {header_key(header): header for header in (*CSV_HEADERS, *SESSION_HEADERS)}


class CsvImportError(ValueError):
    pass


@dataclass(frozen=True)
class ParsedRow:
    workout_date: date
    exercise_name: str
    weight_kg: float | None
    reps: int | None
    bodyweight_kg: float | None
    percentile: float | None
    warmup: bool
    session_id: str = ""
    session_name: str = ""
    weight_from_lb: bool = False
    bodyweight_from_lb: bool = False
    rpe: float | None = None
    duration_seconds: int | None = None
    distance_km: float | None = None
    set_type: SetType = SetType.NORMAL
    failed: bool = False
    exercise_notes: str | None = None
    workout_notes: str | None = None
    duration_minutes: int | None = None
    detailed: bool = False


@dataclass(frozen=True)
class ImportSession:
    workout_date: date
    name: str
    rows: list[ParsedRow]
    duplicate: bool


@dataclass(frozen=True)
class ImportPlan:
    sessions: list[ImportSession]
    new_exercises: list[str]
    warnings: list[str]
    bodyweights: dict[date, list[float]] = field(default_factory=dict)
    body_measurements_to_create: int = 0
    body_measurements_to_skip: int = 0


@dataclass(frozen=True)
class ImportSummary:
    workouts_created: int
    workouts_skipped: int
    exercises_created: int
    sets_imported: int
    body_measurements_created: int
    body_measurements_updated: int
    warnings: list[str]


def plural(count: int, noun: str) -> str:
    return f"{count:,} {noun}{'' if count == 1 else 's'}"


def optional_float(value: str | None, field: str, row_number: int) -> float | None:
    clean = (value or "").strip()
    if not clean:
        return None
    if DECIMAL_COMMA.fullmatch(clean):
        clean = clean.replace(",", ".")
    try:
        parsed = float(clean)
    except ValueError as error:
        raise CsvImportError(f"Row {row_number}: {field} must be a number.") from error
    if not math.isfinite(parsed):
        raise CsvImportError(f"Row {row_number}: {field} must be a finite number.")
    return parsed


def optional_int(value: str | None, field: str, row_number: int) -> int | None:
    parsed = optional_float(value, field, row_number)
    if parsed is None:
        return None
    if not parsed.is_integer():
        raise CsvImportError(f"Row {row_number}: {field} must be a whole number.")
    return int(parsed)


def parse_rows(raw: bytes) -> tuple[list[ParsedRow], list[str]]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise CsvImportError(
            "The file must be UTF-8 encoded. Save it as CSV UTF-8 and try again."
        ) from error
    if not text.strip():
        raise CsvImportError("The CSV file is empty.")
    first_line = text.splitlines()[0]
    delimiter = max(DELIMITERS, key=first_line.count)
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter, strict=True)
    fieldnames: list[str] = []
    ignored: list[str] = []
    for index, supplied in enumerate(reader.fieldnames or []):
        header = (supplied or "").strip()
        known = KNOWN_HEADERS.get(header_key(header))
        if known in fieldnames:
            raise CsvImportError(f"The CSV contains the {known} column more than once.")
        if known is None and header:
            ignored.append(header)
        # Unknown and blank headers, such as a spreadsheet's empty trailing columns, are skipped.
        fieldnames.append(known or f"\0ignored-{index}")
    reader.fieldnames = fieldnames
    missing = [header for header in REQUIRED_HEADERS if header not in fieldnames]
    if missing:
        raise CsvImportError(
            f"Missing required columns: {', '.join(missing)}. The first row must name the "
            "columns, such as Date Lifted, Exercise, Weight (kg) and Reps."
        )

    rows: list[ParsedRow] = []
    warnings: list[str] = []
    if ignored:
        shown = ", ".join(ignored[:8]) + (
            f" and {len(ignored) - 8} more" if len(ignored) > 8 else ""
        )
        warnings.append(f"These columns are not imported: {shown}.")
    if not any(header in fieldnames for header in WEIGHT_HEADERS):
        warnings.append(
            "There is no Weight (kg) or Weight (lb) column, so sets are imported without weights."
        )
    converted_weights = 0
    converted_bodyweights = 0
    legacy_dates: set[date] = set()
    session_dates: dict[str, date] = {}
    session_names: dict[tuple[date, str], str] = {}
    for row_number, row in enumerate(reader, start=2):
        if None in row:
            raise CsvImportError(f"Row {row_number}: there are more values than columns.")
        if not any((value or "").strip() for value in row.values()):
            continue
        exercise_name = (row.get("Exercise") or "").strip()
        if not exercise_name:
            raise CsvImportError(f"Row {row_number}: Exercise is required.")
        if len(exercise_name) > 200:
            raise CsvImportError(f"Row {row_number}: Exercise can be up to 200 characters.")
        raw_date = (row.get("Date Lifted") or "").strip()
        match = ISO_DATE.fullmatch(raw_date)
        try:
            workout_date = date.fromisoformat(match.group(1)) if match else None
        except ValueError:
            workout_date = None
        if workout_date is None:
            found = f' (found "{raw_date[:40]}")' if raw_date else ""
            raise CsvImportError(
                f"Row {row_number}: Date Lifted must use YYYY-MM-DD format, "
                f"such as 2026-10-17{found}."
            )
        session_id = (row.get("Workout ID") or "").strip()
        session_name = (row.get("Workout name") or "").strip()
        if len(session_id) > 128 or len(session_name) > 200:
            raise CsvImportError(f"Row {row_number}: Workout ID or name is too long.")
        if session_id:
            if session_dates.setdefault(session_id, workout_date) != workout_date:
                raise CsvImportError(f"Row {row_number}: Workout ID is used on different dates.")
        else:
            legacy_dates.add(workout_date)
        if session_name:
            key = (workout_date, session_id)
            if session_names.setdefault(key, session_name) != session_name:
                raise CsvImportError(f"Row {row_number}: Workout names disagree for one session.")
        weight_kg = optional_float(row.get("Weight (kg)"), "Weight (kg)", row_number)
        weight_lb = optional_float(row.get("Weight (lb)"), "Weight (lb)", row_number)
        weight_from_lb = weight_kg is None and weight_lb is not None
        if weight_from_lb:
            weight_kg = round(weight_lb / KG_TO_LB, 3)
            converted_weights += 1
        if weight_kg is not None and not 0 <= weight_kg <= 10_000:
            raise CsvImportError(f"Row {row_number}: Weight must be between 0 and 10000 kg.")
        bodyweight_kg = optional_float(row.get("Bodyweight (kg)"), "Bodyweight (kg)", row_number)
        bodyweight_lb = optional_float(row.get("Bodyweight (lb)"), "Bodyweight (lb)", row_number)
        bodyweight_from_lb = bodyweight_kg is None and bodyweight_lb is not None
        if bodyweight_from_lb:
            bodyweight_kg = round(bodyweight_lb / KG_TO_LB, 3)
            converted_bodyweights += 1
        if bodyweight_kg is not None and not 0 < bodyweight_kg <= 500:
            raise CsvImportError(f"Row {row_number}: Bodyweight must be between 0 and 500 kg.")
        percentile = optional_float(row.get("Percentile (%)"), "Percentile (%)", row_number)
        if percentile is not None and not 0 <= percentile <= 100:
            raise CsvImportError(f"Row {row_number}: Percentile (%) must be between 0 and 100.")
        warmup_value = (row.get("Warmup") or "").strip().casefold()
        if warmup_value not in {"", "0", "1", "false", "true", "no", "yes", "n", "y"}:
            raise CsvImportError(f"Row {row_number}: Warmup must be 1/0, true/false, or yes/no.")
        reps = optional_int(row.get("Reps"), "Reps", row_number)
        if reps is not None and not 0 <= reps <= 10_000:
            raise CsvImportError(f"Row {row_number}: Reps must be between 0 and 10000.")
        rows.append(
            ParsedRow(
                workout_date=workout_date,
                exercise_name=exercise_name,
                weight_kg=weight_kg,
                reps=reps,
                bodyweight_kg=bodyweight_kg,
                percentile=percentile,
                warmup=warmup_value in {"1", "true", "yes", "y"},
                session_id=session_id,
                session_name=session_name,
                weight_from_lb=weight_from_lb,
                bodyweight_from_lb=bodyweight_from_lb,
            )
        )
    if not rows:
        raise CsvImportError("The CSV contains no workout rows.")
    if converted_weights:
        warnings.append(
            f"Converted Weight (lb) to kilograms on {plural(converted_weights, 'row')}."
        )
    if converted_bodyweights:
        warnings.append(
            f"Converted Bodyweight (lb) to kilograms on {plural(converted_bodyweights, 'row')}."
        )
    if legacy_dates:
        warnings.insert(
            0,
            "Rows without a Workout ID are grouped into one session per date, so separate "
            "morning and evening workouts on one date are combined.",
        )
    return rows, warnings


def infer_exercise(name: str) -> tuple[WorkoutCategory, ExerciseKind, str, str | None]:
    lowered = name.casefold()
    if any(
        phrase in lowered
        for phrase in ("crunch", "sit up", "sit-up", "knee raise", "leg raise", "plank")
    ):
        return WorkoutCategory.FULL_BODY, ExerciseKind.STRENGTH, "Core", None
    if (
        re.search(
            r"\b(treadmill|run|running|jog|jogging|walk|walking|cycling|bike|bicycle|cardio|rowing)\b",
            lowered,
        )
        or "stair climber" in lowered
    ):
        return WorkoutCategory.CARDIO, ExerciseKind.CARDIO, "Cardio", None
    if any(word in lowered for word in ("reverse fly", "face pull", "rear delt")):
        return WorkoutCategory.PULL, ExerciseKind.STRENGTH, "Rear Delts", None
    if any(
        word in lowered
        for word in (
            "pulldown",
            "pull down",
            "pull-up",
            "pullup",
            "pull up",
            "chin-up",
            "chin up",
            "pullover",
            "pull over",
        )
    ):
        return WorkoutCategory.PULL, ExerciseKind.STRENGTH, "Lats", None
    if "row" in lowered:
        return WorkoutCategory.PULL, ExerciseKind.STRENGTH, "Mid / Upper Back", None
    if any(word in lowered for word in ("curl", "bicep", "grip squeezer")):
        return WorkoutCategory.PULL, ExerciseKind.STRENGTH, "Biceps", None
    if "tricep" in lowered:
        return WorkoutCategory.PUSH, ExerciseKind.STRENGTH, "Triceps", None
    if any(word in lowered for word in ("romanian deadlift", "leg curl", "hamstring")):
        return WorkoutCategory.LOWER, ExerciseKind.STRENGTH, "Hamstrings", None
    if any(word in lowered for word in ("hip thrust", "hip adduction", "hip abduction", "glute")):
        return WorkoutCategory.LOWER, ExerciseKind.STRENGTH, "Glutes", None
    if "back extension" in lowered:
        return WorkoutCategory.LOWER, ExerciseKind.STRENGTH, "Lower Back", None
    if "calf" in lowered:
        return WorkoutCategory.LOWER, ExerciseKind.STRENGTH, "Calves", None
    if any(word in lowered for word in ("squat", "leg press", "leg extension", "lunge")):
        return WorkoutCategory.LOWER, ExerciseKind.STRENGTH, "Quads", None
    if any(
        word in lowered
        for word in ("shoulder", "overhead press", "military press", "lateral raise")
    ):
        return WorkoutCategory.PUSH, ExerciseKind.STRENGTH, "Shoulders", None
    if any(
        word in lowered
        for word in (
            "bench",
            "chest",
            "pec ",
            "dumbbell fly",
            "machine fly",
            "push up",
            "push-up",
            "dips",
            "press",
        )
    ):
        return WorkoutCategory.PUSH, ExerciseKind.STRENGTH, "Chest", None
    if "deadlift" in lowered:
        return WorkoutCategory.PULL, ExerciseKind.STRENGTH, "Posterior chain", None
    if "external rotation" in lowered:
        return WorkoutCategory.UPPER, ExerciseKind.STRENGTH, "Shoulders", None
    return WorkoutCategory.OTHER, ExerciseKind.STRENGTH, "Other", None


def sync_imported_bodyweights(
    db: Session, user_id: str, bodyweights: dict[date, list[float]]
) -> tuple[int, int]:
    """Create missing graph check-ins without replacing any existing entries."""
    if not bodyweights:
        return 0, 0
    existing = {
        item.measurement_date: item
        for item in db.scalars(
            select(BodyMeasurement).where(
                BodyMeasurement.user_id == user_id,
                BodyMeasurement.measurement_date.in_(bodyweights),
            )
        )
    }
    created = 0
    updated = 0
    for measurement_date, values in sorted(bodyweights.items()):
        weight_kg = round(float(median(values)), 3)
        measurement = existing.get(measurement_date)
        if measurement is None:
            db.add(
                BodyMeasurement(
                    user_id=user_id,
                    measurement_date=measurement_date,
                    weight_kg=weight_kg,
                    body_fat_pct=None,
                    notes=IMPORTED_BODYWEIGHT_NOTE,
                    is_sample=False,
                )
            )
            created += 1
    return created, updated


def same_number(left: float | None, right: float | None, *, from_lb: bool = False) -> bool:
    if left is None or right is None:
        return left is right
    # Old pound-only exports round to 0.1 lb; allow only that conversion precision.
    return (
        math.isclose(left, right, rel_tol=0, abs_tol=0.0233)
        if from_lb
        else round(left, 3) == round(right, 3)
    )


def matching_session(rows: list[ParsedRow], workout: TrainingWorkout) -> bool:
    existing: dict[str, list[WorkoutSet]] = defaultdict(list)
    incoming: dict[str, list[ParsedRow]] = defaultdict(list)
    for movement in workout.movements:
        completed = [item for item in movement.sets if item.completed]
        if completed:
            existing[canonical_exercise_name(movement.exercise.name).casefold()].extend(completed)
    for row in rows:
        incoming[canonical_exercise_name(row.exercise_name).casefold()].append(row)
    if existing.keys() != incoming.keys():
        return False
    for name, set_rows in incoming.items():
        candidates = list(existing[name])
        if len(candidates) != len(set_rows):
            return False
        for row in set_rows:
            match = next(
                (
                    index
                    for index, item in enumerate(candidates)
                    if item.reps == row.reps
                    and item.warmup == row.warmup
                    and same_number(row.weight_kg, item.weight_kg, from_lb=row.weight_from_lb)
                    and same_number(
                        row.bodyweight_kg, item.bodyweight_kg, from_lb=row.bodyweight_from_lb
                    )
                    and same_number(row.percentile, item.percentile)
                    and (
                        not row.detailed
                        or (
                            same_number(row.rpe, item.rpe)
                            and row.duration_seconds == item.duration_seconds
                            and same_number(row.distance_km, item.distance_km)
                            and row.set_type == item.set_type
                            and row.failed == item.failed
                        )
                    )
                ),
                None,
            )
            if match is None:
                return False
            candidates.pop(match)
    return True


def plan_import(
    db: Session,
    user_id: str,
    raw: bytes,
    *,
    source: str = "gym",
    weight_unit: str = "kg",
    distance_unit: str = "km",
) -> ImportPlan:
    """Read and compare only; no pending database writes, even on a rejected file."""
    try:
        bodyweights: dict[date, list[float]] = {}
        if source in {"hevy", "strong"}:
            from .workout_app_csv import parse_app_export

            rows, warnings, bodyweights = parse_app_export(raw, source, weight_unit, distance_unit)
        else:
            rows, warnings = parse_rows(raw)
    except csv.Error as error:
        raise CsvImportError("The CSV has malformed quoting or an oversized field.") from error
    exercises = {
        canonical_exercise_name(item.name).casefold(): item
        for item in db.scalars(select(Exercise).where(Exercise.user_id == user_id))
    }
    grouped: dict[tuple[date, str], list[ParsedRow]] = defaultdict(list)
    for row in rows:
        grouped[(row.workout_date, row.session_id)].append(row)
    existing: dict[date, list[TrainingWorkout]] = defaultdict(list)
    for workout in db.scalars(
        select(TrainingWorkout)
        .where(
            TrainingWorkout.user_id == user_id,
            TrainingWorkout.workout_date.in_({row.workout_date for row in rows}),
        )
        .options(
            selectinload(TrainingWorkout.movements).selectinload(WorkoutMovement.exercise),
            selectinload(TrainingWorkout.movements).selectinload(WorkoutMovement.sets),
        )
        .order_by(TrainingWorkout.created_at, TrainingWorkout.id)
    ):
        existing[workout.workout_date].append(workout)
    sessions: list[ImportSession] = []
    new_exercises: dict[str, str] = {}
    for (workout_date, _), session_rows in sorted(grouped.items()):
        candidates = existing[workout_date]
        match = next(
            (
                index
                for index, workout in enumerate(candidates)
                if matching_session(session_rows, workout)
            ),
            None,
        )
        # Consume each match once to preserve intentionally distinct, identical sessions.
        duplicate = match is not None
        if match is not None:
            candidates.pop(match)
        name = next((row.session_name for row in session_rows if row.session_name), "")
        sessions.append(
            ImportSession(
                workout_date=workout_date,
                name=name or f"Imported workout · {workout_date.isoformat()}",
                rows=session_rows,
                duplicate=duplicate,
            )
        )
        if not duplicate:
            for row in session_rows:
                name = canonical_exercise_name(row.exercise_name)
                if name.casefold() not in exercises:
                    new_exercises.setdefault(name.casefold(), name)
    for session in sessions:
        if not session.duplicate:
            for row in session.rows:
                if row.bodyweight_kg is not None:
                    bodyweights.setdefault(row.workout_date, []).append(row.bodyweight_kg)
    existing_dates = (
        set(
            db.scalars(
                select(BodyMeasurement.measurement_date).where(
                    BodyMeasurement.user_id == user_id,
                    BodyMeasurement.measurement_date.in_(bodyweights),
                )
            )
        )
        if bodyweights
        else set()
    )
    return ImportPlan(
        sessions,
        list(new_exercises.values()),
        warnings[:50],
        bodyweights,
        len(bodyweights.keys() - existing_dates),
        len(existing_dates),
    )


def import_workouts(
    db: Session,
    user_id: str,
    raw: bytes,
    *,
    plan: ImportPlan | None = None,
    on_workout: Callable[[Session, TrainingWorkout], None] | None = None,
) -> ImportSummary:
    # Always build a fresh plan at commit, never accept a client-supplied preview.
    plan = plan or plan_import(db, user_id, raw)
    exercises = {
        canonical_exercise_name(item.name).casefold(): item
        for item in db.scalars(select(Exercise).where(Exercise.user_id == user_id))
    }
    exercises_created = 0
    bodyweights = plan.bodyweights
    sessions = [session for session in plan.sessions if not session.duplicate]
    for session in sessions:
        movement_groups: dict[str, list[ParsedRow]] = defaultdict(list)
        for row in session.rows:
            movement_groups[canonical_exercise_name(row.exercise_name).casefold()].append(row)
        movement_categories: list[WorkoutCategory] = []
        workout = TrainingWorkout(
            user_id=user_id,
            name=session.name,
            workout_date=session.workout_date,
            category=WorkoutCategory.OTHER,
            notes=next(
                (row.workout_notes for row in session.rows if row.workout_notes),
                "Imported from CSV.",
            ),
            duration_minutes=next(
                (row.duration_minutes for row in session.rows if row.duration_minutes is not None),
                None,
            ),
            is_sample=False,
        )
        db.add(workout)
        for movement_index, (exercise_key, set_rows) in enumerate(movement_groups.items()):
            exercise_name = canonical_exercise_name(set_rows[0].exercise_name)
            exercise = exercises.get(exercise_key)
            if not exercise:
                category, kind, muscle_group, equipment = infer_exercise(exercise_name)
                exercise = Exercise(
                    user_id=user_id,
                    name=exercise_name,
                    category=category,
                    kind=kind,
                    muscle_group=muscle_group,
                    equipment=equipment,
                    is_custom=True,
                )
                db.add(exercise)
                exercises[exercise_name.casefold()] = exercise
                exercises_created += 1
            movement_categories.append(exercise.category)
            movement = WorkoutMovement(
                exercise=exercise,
                order_index=movement_index,
                notes="\n".join(
                    dict.fromkeys(row.exercise_notes for row in set_rows if row.exercise_notes)
                )
                or None,
            )
            for set_index, row in enumerate(set_rows):
                movement.sets.append(
                    WorkoutSet(
                        order_index=set_index,
                        reps=row.reps,
                        weight_kg=row.weight_kg,
                        bodyweight_kg=row.bodyweight_kg,
                        percentile=row.percentile,
                        warmup=row.warmup,
                        rpe=row.rpe,
                        duration_seconds=row.duration_seconds,
                        distance_km=row.distance_km,
                        set_type=row.set_type,
                        failed=row.failed,
                        completed=True,
                    )
                )
            workout.movements.append(movement)
        workout.category = infer_workout_category(movement_categories) or WorkoutCategory.OTHER
        if on_workout and any(m.exercise.kind == ExerciseKind.CARDIO for m in workout.movements):
            db.flush()
            on_workout(db, workout)
    body_measurements_created, body_measurements_updated = sync_imported_bodyweights(
        db, user_id, bodyweights
    )
    db.flush()
    return ImportSummary(
        workouts_created=len(sessions),
        workouts_skipped=len(plan.sessions) - len(sessions),
        exercises_created=exercises_created,
        sets_imported=sum(len(session.rows) for session in sessions),
        body_measurements_created=body_measurements_created,
        body_measurements_updated=body_measurements_updated,
        warnings=plan.warnings,
    )


def format_number(value: float | int | None) -> str:
    if value is None:
        return ""
    return f"{value:.3f}".rstrip("0").rstrip(".") if isinstance(value, float) else str(value)


def export_workouts(workouts: list[TrainingWorkout]) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow((*CSV_HEADERS, *SESSION_HEADERS))
    for workout in workouts:
        for movement in sorted(workout.movements, key=lambda item: item.order_index):
            for item in sorted(movement.sets, key=lambda entry: entry.order_index):
                if not item.completed:
                    continue
                writer.writerow(
                    (
                        workout.workout_date.isoformat(),
                        movement.exercise.name,
                        format_number(item.weight_kg),
                        format_number(
                            round(item.weight_kg * KG_TO_LB, 1)
                            if item.weight_kg is not None
                            else None
                        ),
                        format_number(item.reps),
                        format_number(item.bodyweight_kg),
                        format_number(
                            round(item.bodyweight_kg * KG_TO_LB, 1)
                            if item.bodyweight_kg is not None
                            else None
                        ),
                        format_number(item.percentile),
                        "1" if item.warmup else "0",
                        workout.id,
                        workout.name,
                    )
                )
    return output.getvalue()
