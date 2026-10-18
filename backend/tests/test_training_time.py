from __future__ import annotations

from datetime import date


def exercise_id(client, name: str) -> str:
    return next(item["id"] for item in client.get("/api/exercises").json() if item["name"] == name)


def save_workout(client, duration_minutes: int | None, movements: list[dict]) -> dict:
    response = client.post(
        "/api/workouts",
        json={
            "name": "Session",
            "workout_date": date.today().isoformat(),
            "category": "push",
            "notes": None,
            "duration_minutes": duration_minutes,
            "movements": movements,
        },
    )
    assert response.status_code == 201
    return response.json()


def strength(client) -> dict:
    return {
        "exercise_id": exercise_id(client, "Barbell Bench Press"),
        "notes": None,
        "sets": [{"reps": 5, "weight_kg": 80, "completed": True}],
    }


def cycling(client, seconds: int) -> dict:
    return {
        "exercise_id": exercise_id(client, "Cycling (Indoor)"),
        "notes": None,
        "sets": [{"duration_seconds": seconds, "completed": True}],
    }


def test_training_time_starts_empty(client):
    assert client.get("/api/training-time").json() == {
        "workout_minutes": 0,
        "workout_count": 0,
        "cardio_minutes": 0,
        "cardio_count": 0,
        "total_minutes": 0,
    }


def test_combined_time_counts_cardio_inside_a_workout_once(client, other_client):
    # 60-minute strength workout including a 40-minute ride.
    save_workout(client, 60, [strength(client), cycling(client, 2_400)])
    # Untimed strength workout: its 30-minute ride still counts towards the combined total.
    save_workout(client, None, [strength(client), cycling(client, 1_800)])
    # Cardio form session with an exercise creates its own cardio-only workout.
    treadmill = exercise_id(client, "Incline Treadmill Walking")
    for payload in (
        {"exercise_id": treadmill, "activity_type": "Incline Treadmill Walking"},
        {"activity_type": "Rowing"},
    ):
        assert (
            client.post(
                "/api/cardio",
                json={
                    "session_date": date.today().isoformat(),
                    "duration_minutes": 25,
                    "intensity": None,
                    "zone": None,
                    "qualifies_zone2": False,
                    "notes": None,
                    **payload,
                },
            ).status_code
            == 201
        )
    save_workout(other_client, 90, [strength(other_client)])

    assert client.get("/api/training-time").json() == {
        "workout_minutes": 60,
        "workout_count": 2,
        "cardio_minutes": 40 + 30 + 25 + 25,
        "cardio_count": 4,
        "total_minutes": 60 + 30 + 25 + 25,
    }


def test_training_time_excludes_sample_workouts(client):
    from app.database import SessionLocal
    from app.tracker_seed import seed_sample_workouts

    with SessionLocal() as db:
        assert seed_sample_workouts(db, client.user["id"]) > 0
    assert client.get("/api/workouts").json()

    assert client.get("/api/training-time").json()["total_minutes"] == 0
