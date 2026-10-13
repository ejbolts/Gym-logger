"""F15/F16: retried creates do not duplicate workouts, and stale editors cannot overwrite."""

from __future__ import annotations

import importlib.util
import uuid
from datetime import date
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.exc import IntegrityError
from test_account_limits import set_limits
from test_cardio_energy import cardio_payload
from test_tracker import workout_payload

import app.tracker as tracker
from app.database import Base, SessionLocal
from app.models import TrainingWorkout


def bench_id(test_client) -> str:
    return next(
        item["id"]
        for item in test_client.get("/api/exercises").json()
        if item["name"] == "Barbell Bench Press"
    )


def workout_count(user_id: str) -> int:
    with SessionLocal() as db:
        return db.scalar(
            select(func.count(TrainingWorkout.id)).where(TrainingWorkout.user_id == user_id)
        )


def without_timestamps(workout: dict) -> dict:
    return {key: value for key, value in workout.items() if not key.endswith("_at")}


def keyed(test_client, key: str | None = None, **changes) -> dict:
    return {
        **workout_payload(bench_id(test_client)),
        "client_request_id": key or str(uuid.uuid4()),
        **changes,
    }


def test_retrying_a_create_with_the_same_key_returns_the_saved_workout(client):
    payload = keyed(client)
    first = client.post("/api/workouts", json=payload)
    assert first.status_code == 201
    assert first.json()["revision"] == 1
    assert "client_request_id" not in first.json()

    # The reply to the first attempt was lost, so the app retries the same logical save.
    retry = client.post("/api/workouts", json={**payload, "name": "Renamed while retrying"})
    assert retry.status_code == 200
    # The same workout, unchanged; timestamps read back from SQLite lose their UTC marker.
    assert without_timestamps(retry.json()) == without_timestamps(first.json())
    assert retry.json()["movements"][0]["sets"] == first.json()["movements"][0]["sets"]
    assert workout_count(client.user["id"]) == 1


def test_different_keys_and_requests_without_a_key_create_separate_workouts(client):
    assert client.post("/api/workouts", json=keyed(client)).status_code == 201
    assert client.post("/api/workouts", json=keyed(client)).status_code == 201
    # Older app versions send no key and keep creating a workout per request.
    unkeyed = workout_payload(bench_id(client))
    assert client.post("/api/workouts", json=unkeyed).status_code == 201
    assert client.post("/api/workouts", json=unkeyed).status_code == 201
    assert workout_count(client.user["id"]) == 4


def test_keys_are_scoped_to_each_account(client, other_client):
    key = str(uuid.uuid4())
    mine = client.post("/api/workouts", json=keyed(client, key))
    theirs = other_client.post("/api/workouts", json=keyed(other_client, key))
    assert (mine.status_code, theirs.status_code) == (201, 201)
    assert mine.json()["id"] != theirs.json()["id"]
    assert (
        other_client.post("/api/workouts", json=keyed(other_client, key)).json()["id"]
        == (theirs.json()["id"])
    )
    assert workout_count(client.user["id"]) == workout_count(other_client.user["id"]) == 1


def test_keys_must_be_uuids(client):
    for key in ("not-a-uuid", "x" * 37, 42):
        response = client.post("/api/workouts", json=keyed(client, client_request_id=key))
        assert response.status_code == 422
    assert workout_count(client.user["id"]) == 0


def test_retry_is_answered_even_when_the_saved_workout_reached_the_account_limit(
    client, other_client
):
    set_limits(client, workouts_per_account=1)
    payload = keyed(other_client)
    assert other_client.post("/api/workouts", json=payload).status_code == 201
    retry = other_client.post("/api/workouts", json=payload)
    assert retry.status_code == 200
    assert other_client.post("/api/workouts", json=keyed(other_client)).status_code == 422


def test_concurrent_attempts_with_one_key_save_a_single_workout(client, monkeypatch):
    payload = keyed(client)
    first = client.post("/api/workouts", json=payload)
    lookup = tracker.workout_for_client_request
    calls = []

    def missed_first_lookup(db, user_id, client_request_id):
        # The racing attempt checked before the first attempt committed, then inserts.
        calls.append(client_request_id)
        return None if len(calls) == 1 else lookup(db, user_id, client_request_id)

    monkeypatch.setattr(tracker, "workout_for_client_request", missed_first_lookup)
    second = client.post("/api/workouts", json=payload)
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert len(calls) == 2
    assert workout_count(client.user["id"]) == 1


def test_stale_base_revision_is_refused_without_changing_the_workout(client):
    created = client.post("/api/workouts", json=keyed(client)).json()
    payload = workout_payload(bench_id(client))
    on_phone = client.put(
        f"/api/workouts/{created['id']}",
        json={**payload, "name": "Edited on phone", "base_revision": 1},
    )
    assert on_phone.status_code == 200
    assert on_phone.json()["revision"] == 2
    before = client.get(f"/api/workouts/{created['id']}").json()

    stale = client.put(
        f"/api/workouts/{created['id']}",
        json={**payload, "name": "Stale laptop edit", "notes": "Old", "base_revision": 1},
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "workout_conflict"
    assert "another device" in stale.json()["error"]["message"]
    assert client.get(f"/api/workouts/{created['id']}").json() == before

    current = client.put(
        f"/api/workouts/{created['id']}",
        json={**payload, "name": "Kept laptop edit", "base_revision": 2},
    )
    assert current.status_code == 200
    assert (current.json()["name"], current.json()["revision"]) == ("Kept laptop edit", 3)


def test_update_without_base_revision_still_replaces_the_workout(client):
    created = client.post("/api/workouts", json=keyed(client)).json()
    payload = {**workout_payload(bench_id(client)), "name": "Old app version"}
    response = client.put(f"/api/workouts/{created['id']}", json=payload)
    assert response.status_code == 200
    assert (response.json()["name"], response.json()["revision"]) == ("Old app version", 2)
    assert client.get("/api/workouts").json()[0]["revision"] == 2


def test_editing_imported_cardio_metrics_advances_the_workout_revision(client):
    cycling = next(
        item["id"] for item in client.get("/api/exercises").json() if item["name"] == "Cycling"
    )
    session = client.post("/api/cardio", json=cardio_payload(exercise_id=cycling)).json()
    workout = client.get("/api/workouts").json()[0]
    assert workout["revision"] == 1
    response = client.patch(f"/api/cardio/{session['id']}/calories", json={"calories_kcal": 320})
    assert response.status_code == 200
    assert client.get(f"/api/workouts/{workout['id']}").json()["revision"] == 2
    stale = client.put(
        f"/api/workouts/{workout['id']}",
        json={
            "name": workout["name"],
            "workout_date": workout["workout_date"],
            "category": workout["category"],
            "movements": [
                {"exercise_id": cycling, "sets": [{"duration_seconds": 1800, "completed": True}]}
            ],
            "base_revision": 1,
        },
    )
    assert stale.status_code == 409


def load_migration():
    path = Path(__file__).parents[1] / "migrations/versions/0034_workout_save_safety.py"
    spec = importlib.util.spec_from_file_location("workout_save_safety_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_upgrades_existing_workouts_and_downgrades():
    migration = load_migration()
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        Base.metadata.create_all(connection)
        # Recreate the 0033 shape of the table from the current one.
        connection.execute(text("DROP INDEX uq_training_workout_client_request"))
        connection.execute(text("ALTER TABLE training_workouts DROP COLUMN client_request_id"))
        connection.execute(text("ALTER TABLE training_workouts DROP COLUMN revision"))
        connection.execute(
            text(
                "INSERT INTO users (id, username, display_name, password_hash) VALUES "
                "('sample-user', 'sample', 'Sample', 'hash')"
            )
        )
        for workout_id in ("sample-one", "sample-two"):
            connection.execute(
                text(
                    "INSERT INTO training_workouts "
                    "(id, user_id, name, workout_date, category, is_sample) "
                    "VALUES (:id, 'sample-user', 'Sample', :day, 'push', 0)"
                ),
                {"id": workout_id, "day": date(2026, 10, 1)},
            )

        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        rows = connection.execute(
            text("SELECT id, revision, client_request_id FROM training_workouts ORDER BY id")
        ).all()
        assert rows == [("sample-one", 1, None), ("sample-two", 1, None)]
        indexes = {
            index["name"]: index for index in inspect(connection).get_indexes("training_workouts")
        }
        assert indexes["uq_training_workout_client_request"]["unique"]
        connection.execute(
            text("UPDATE training_workouts SET client_request_id = 'key' WHERE id = 'sample-one'")
        )
        try:
            with connection.begin_nested():
                connection.execute(
                    text(
                        "UPDATE training_workouts SET client_request_id = 'key' "
                        "WHERE id = 'sample-two'"
                    )
                )
            raise AssertionError("A key must be unique within one account.")
        except IntegrityError:
            pass

        migration.downgrade()
        columns = {
            column["name"] for column in inspect(connection).get_columns("training_workouts")
        }
        assert {"revision", "client_request_id"}.isdisjoint(columns)
        assert connection.scalar(text("SELECT COUNT(*) FROM training_workouts")) == 2
