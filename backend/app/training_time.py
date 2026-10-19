"""Lifetime training totals shared by account and viewable member profiles."""

from collections import defaultdict

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import CardioSession, Exercise, ExerciseKind, TrainingWorkout, WorkoutMovement
from .tracker_schemas import TrainingTimeRead


def training_time_totals(db: Session, user_id: str) -> TrainingTimeRead:
    """Exclude sample records and count cardio inside each workout once in Combined."""
    has_strength = (
        select(WorkoutMovement.id)
        .join(Exercise, WorkoutMovement.exercise_id == Exercise.id)
        .where(
            WorkoutMovement.workout_id == TrainingWorkout.id,
            Exercise.kind != ExerciseKind.CARDIO,
        )
        .exists()
    )
    workouts = db.execute(
        select(TrainingWorkout.id, TrainingWorkout.duration_minutes, has_strength).where(
            TrainingWorkout.user_id == user_id, TrainingWorkout.is_sample.is_(False)
        )
    ).all()
    sessions = db.execute(
        select(CardioSession.source_workout_id, CardioSession.duration_minutes)
        .outerjoin(TrainingWorkout, CardioSession.source_workout_id == TrainingWorkout.id)
        .where(
            CardioSession.user_id == user_id,
            or_(TrainingWorkout.id.is_(None), TrainingWorkout.is_sample.is_(False)),
        )
    ).all()
    cardio_by_workout: defaultdict[str | None, int] = defaultdict(int)
    for workout_id, minutes in sessions:
        cardio_by_workout[workout_id] += minutes
    strength = [minutes or 0 for _, minutes, strength_workout in workouts if strength_workout]
    return TrainingTimeRead(
        workout_minutes=sum(strength),
        workout_count=len(strength),
        cardio_minutes=sum(minutes for _, minutes in sessions),
        cardio_count=len(sessions),
        total_minutes=cardio_by_workout[None]
        + sum(
            max(minutes or 0, cardio_by_workout[workout_id]) for workout_id, minutes, _ in workouts
        ),
    )
