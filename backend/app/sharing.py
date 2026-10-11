"""Profile sharing between members.

Sharing is reciprocal: an account sees other members' profiles only while it shares its own,
and shared workouts are the minimum. Notes, cardio, body weight, goals and the profile photo are
optional. A profile that is not shared, belongs to a disabled account, or does not exist gives
the same "not found" answer. Sample data, machine photos and videos are never shared.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from .account_limits import limit_save_rate
from .accounts import no_store
from .auth import AppSettings, CurrentUser, as_utc, get_current_user
from .database import get_db
from .errors import api_error
from .models import (
    BodyMeasurement,
    BodyWeightGoal,
    CardioSession,
    PersonalRecord,
    ProfileSharing,
    TrainingWorkout,
    User,
)
from .photo_storage import profile_photo_path
from .tracker import training_preferences, workout_options, zone2_week
from .tracker_schemas import PersonalRecordRead, TrainingWorkoutRead, Zone2WeekRead
from .training_metrics import start_of_week

Db = Annotated[Session, Depends(get_db)]
sharing_router = APIRouter(
    prefix="/api/sharing",
    tags=["sharing"],
    dependencies=[Depends(no_store), Depends(get_current_user), Depends(limit_save_rate)],
)
MAX_WORKOUT_PAGE = 50
RECENT_CARDIO_SESSIONS = 20
RECENT_DAYS = 30


class SharingChoices(BaseModel):
    """An account's sharing choices. Workouts are always shared while ``enabled`` is on."""

    model_config = ConfigDict(from_attributes=True)

    enabled: bool = False
    share_notes: bool = False
    share_cardio: bool = False
    share_body_weight: bool = False
    share_goals: bool = False
    share_profile_photo: bool = False


class SharedContent(BaseModel):
    notes: bool
    cardio: bool
    body_weight: bool
    goals: bool


class SharedProfileSummary(BaseModel):
    id: str
    display_name: str
    profile_photo_url: str | None
    member_since: datetime
    is_you: bool
    workout_count: int
    recent_workout_count: int
    last_workout_date: date | None
    shares: SharedContent


class SharedBodyMeasurement(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    measurement_date: date
    weight_kg: float
    body_fat_pct: float | None


class SharedBodyWeightGoal(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    start_date: date
    target_date: date
    start_weight_kg: float
    target_weight_kg: float


class SharedGoals(BaseModel):
    body_weight: SharedBodyWeightGoal | None
    zone2: Zone2WeekRead


class SharedCardioSession(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_date: date
    activity_type: str
    duration_minutes: int
    calories_kcal: int | None
    average_heart_rate_bpm: int | None
    distance_km: float | None
    average_speed_kph: float | None
    incline_percent: float | None
    average_power_watts: int | None
    average_mets: float | None
    zone: str | None
    qualifies_zone2: bool
    notes: str | None


class SharedProfileRead(SharedProfileSummary):
    # None when the profile does not share that part.
    body_weight: list[SharedBodyMeasurement] | None
    goals: SharedGoals | None
    cardio_sessions: list[SharedCardioSession] | None


class SharedWorkoutPage(BaseModel):
    total: int
    workouts: list[TrainingWorkoutRead]
    personal_records: list[PersonalRecordRead]


def sharing_choices(db: Session, user_id: str) -> ProfileSharing:
    """The account's stored choices, or unsaved defaults (not sharing) when it has none."""
    return db.get(ProfileSharing, user_id) or ProfileSharing(
        user_id=user_id,
        enabled=False,
        share_notes=False,
        share_cardio=False,
        share_body_weight=False,
        share_goals=False,
        share_profile_photo=False,
    )


def require_sharing(db: Session, viewer: User) -> None:
    if not sharing_choices(db, viewer.id).enabled:
        raise api_error(
            403, "sharing_required", "Share your profile to see other members' profiles."
        )


def load_shared_profile(db: Session, viewer: User, user_id: str) -> tuple[User, ProfileSharing]:
    require_sharing(db, viewer)
    user = db.get(User, user_id)
    sharing = db.get(ProfileSharing, user_id)
    if user is None or user.disabled_at is not None or sharing is None or not sharing.enabled:
        raise api_error(404, "profile_not_found", "That profile is not shared.")
    return user, sharing


def shared_photo_url(user: User, sharing: ProfileSharing) -> str | None:
    if not (sharing.share_profile_photo and user.profile_photo_filename):
        return None
    version = user.profile_photo_filename.removesuffix(".webp")
    return f"/api/sharing/profiles/{user.id}/photo?v={version}"


def workout_stats(db: Session, user_ids: list[str]) -> dict[str, tuple[int, int, date | None]]:
    """Per account: shared workouts, those in the last 30 days, and the latest workout date."""
    if not user_ids:
        return {}
    cutoff = date.today() - timedelta(days=RECENT_DAYS)
    rows = db.execute(
        select(
            TrainingWorkout.user_id,
            func.count(TrainingWorkout.id),
            func.sum(case((TrainingWorkout.workout_date >= cutoff, 1), else_=0)),
            func.max(TrainingWorkout.workout_date),
        )
        .where(TrainingWorkout.user_id.in_(user_ids), TrainingWorkout.is_sample.is_(False))
        .group_by(TrainingWorkout.user_id)
    )
    return {user_id: (count, recent or 0, latest) for user_id, count, recent, latest in rows}


def profile_summary(
    viewer: User,
    user: User,
    sharing: ProfileSharing,
    stats: tuple[int, int, date | None] | None,
) -> SharedProfileSummary:
    count, recent, latest = stats or (0, 0, None)
    return SharedProfileSummary(
        id=user.id,
        display_name=user.display_name,
        profile_photo_url=shared_photo_url(user, sharing),
        member_since=as_utc(user.created_at),
        is_you=user.id == viewer.id,
        workout_count=count,
        recent_workout_count=recent,
        last_workout_date=latest,
        shares=SharedContent(
            notes=sharing.share_notes,
            cardio=sharing.share_cardio,
            body_weight=sharing.share_body_weight,
            goals=sharing.share_goals,
        ),
    )


def sample_workout_ids():
    return select(TrainingWorkout.id).where(TrainingWorkout.is_sample.is_(True))


def shared_workout(workout: TrainingWorkout, sharing: ProfileSharing) -> TrainingWorkoutRead:
    """A workout with only what the owner shares: no photos, and notes or body weight on request."""
    shared = TrainingWorkoutRead.model_validate(workout)
    if not sharing.share_notes:
        shared.notes = None
    for movement in shared.movements:
        movement.machine_photos = []
        movement.exercise.is_favorite = False
        if not sharing.share_notes:
            movement.notes = None
        for item in movement.sets:
            if not sharing.share_notes:
                item.notes = None
            if not sharing.share_body_weight:
                item.bodyweight_kg = None
    return shared


def shared_goals(db: Session, user_id: str) -> SharedGoals:
    goal = db.scalar(
        select(BodyWeightGoal)
        .where(BodyWeightGoal.user_id == user_id, BodyWeightGoal.active.is_(True))
        .order_by(BodyWeightGoal.created_at.desc())
        .limit(1)
    )
    preferences = training_preferences(db, user_id)
    week = start_of_week(date.today(), preferences.week_start)
    sessions = list(
        db.scalars(
            select(CardioSession).where(
                CardioSession.user_id == user_id,
                CardioSession.session_date >= week,
                CardioSession.session_date <= week + timedelta(days=6),
            )
        )
    )
    return SharedGoals(
        body_weight=SharedBodyWeightGoal.model_validate(goal) if goal else None,
        zone2=zone2_week(sessions, week, preferences.zone2_goal_minutes),
    )


def shared_cardio(db: Session, user_id: str, sharing: ProfileSharing) -> list[SharedCardioSession]:
    sessions = db.scalars(
        select(CardioSession)
        .where(
            CardioSession.user_id == user_id,
            or_(
                CardioSession.source_workout_id.is_(None),
                CardioSession.source_workout_id.not_in(sample_workout_ids()),
            ),
        )
        .order_by(CardioSession.session_date.desc(), CardioSession.created_at.desc())
        .limit(RECENT_CARDIO_SESSIONS)
    )
    shared = [SharedCardioSession.model_validate(session) for session in sessions]
    if not sharing.share_notes:
        for session in shared:
            session.notes = None
    return shared


@sharing_router.get("", response_model=SharingChoices)
def get_sharing(user: CurrentUser, db: Db) -> ProfileSharing:
    return sharing_choices(db, user.id)


@sharing_router.put("", response_model=SharingChoices)
def update_sharing(payload: SharingChoices, user: CurrentUser, db: Db) -> ProfileSharing:
    sharing = db.get(ProfileSharing, user.id)
    if sharing is None:
        sharing = ProfileSharing(user_id=user.id)
        db.add(sharing)
    for key, value in payload.model_dump().items():
        setattr(sharing, key, value)
    db.commit()
    db.refresh(sharing)
    return sharing


@sharing_router.get("/profiles", response_model=list[SharedProfileSummary])
def list_shared_profiles(user: CurrentUser, db: Db) -> list[SharedProfileSummary]:
    require_sharing(db, user)
    rows = db.execute(
        select(User, ProfileSharing)
        .join(ProfileSharing, ProfileSharing.user_id == User.id)
        .where(ProfileSharing.enabled.is_(True), User.disabled_at.is_(None))
    ).all()
    stats = workout_stats(db, [member.id for member, _sharing in rows])
    profiles = [
        profile_summary(user, member, sharing, stats.get(member.id)) for member, sharing in rows
    ]
    # You first, then whoever trained most recently.
    profiles.sort(key=lambda item: item.display_name.casefold())
    profiles.sort(key=lambda item: item.last_workout_date or date.min, reverse=True)
    profiles.sort(key=lambda item: not item.is_you)
    return profiles


@sharing_router.get("/profiles/{user_id}", response_model=SharedProfileRead)
def get_shared_profile(user_id: str, user: CurrentUser, db: Db) -> SharedProfileRead:
    member, sharing = load_shared_profile(db, user, user_id)
    summary = profile_summary(user, member, sharing, workout_stats(db, [member.id]).get(member.id))
    body_weight = (
        [
            SharedBodyMeasurement.model_validate(measurement)
            for measurement in db.scalars(
                select(BodyMeasurement)
                .where(BodyMeasurement.user_id == member.id, BodyMeasurement.is_sample.is_(False))
                .order_by(BodyMeasurement.measurement_date.desc())
            )
        ]
        if sharing.share_body_weight
        else None
    )
    return SharedProfileRead(
        **summary.model_dump(),
        body_weight=body_weight,
        goals=shared_goals(db, member.id) if sharing.share_goals else None,
        cardio_sessions=shared_cardio(db, member.id, sharing) if sharing.share_cardio else None,
    )


@sharing_router.get("/profiles/{user_id}/workouts", response_model=SharedWorkoutPage)
def list_shared_workouts(
    user_id: str,
    user: CurrentUser,
    db: Db,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=MAX_WORKOUT_PAGE)] = 10,
) -> SharedWorkoutPage:
    member, sharing = load_shared_profile(db, user, user_id)
    owned = (TrainingWorkout.user_id == member.id, TrainingWorkout.is_sample.is_(False))
    total = db.scalar(select(func.count(TrainingWorkout.id)).where(*owned)) or 0
    workouts = list(
        db.scalars(
            select(TrainingWorkout)
            .where(*owned)
            .options(*workout_options())
            .order_by(TrainingWorkout.workout_date.desc(), TrainingWorkout.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    records = (
        db.scalars(
            select(PersonalRecord)
            .where(PersonalRecord.workout_id.in_([workout.id for workout in workouts]))
            .options(selectinload(PersonalRecord.exercise))
        )
        if workouts
        else []
    )
    return SharedWorkoutPage(
        total=total,
        workouts=[shared_workout(workout, sharing) for workout in workouts],
        personal_records=[PersonalRecordRead.model_validate(record) for record in records],
    )


@sharing_router.get("/profiles/{user_id}/photo")
def get_shared_profile_photo(
    user_id: str, user: CurrentUser, db: Db, settings: AppSettings
) -> FileResponse:
    member, sharing = load_shared_profile(db, user, user_id)
    filename = member.profile_photo_filename if sharing.share_profile_photo else None
    path = profile_photo_path(settings, filename) if filename else None
    if path is None or not path.is_file():
        raise api_error(404, "profile_photo_not_found", "This profile has no shared photo.")
    # Revalidated on every use, so it disappears as soon as the owner stops sharing it.
    return FileResponse(
        path, media_type="image/webp", headers={"Cache-Control": "private, no-cache"}
    )
