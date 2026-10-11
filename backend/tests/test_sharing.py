from datetime import date, timedelta
from io import BytesIO

from conftest import TEST_PASSWORD, register_user
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select, update
from test_auth import named, upload_photo

from app.database import SessionLocal
from app.models import ProfileSharing, TrainingWorkout

ALL_CHOICES = {
    "enabled": True,
    "share_notes": True,
    "share_cardio": True,
    "share_body_weight": True,
    "share_goals": True,
    "share_profile_photo": True,
}


def share(test_client: TestClient, **choices: bool) -> dict:
    response = test_client.put("/api/sharing", json={"enabled": True, **choices})
    assert response.status_code == 200, response.text
    return response.json()


def detailed_workout(exercise_id: str, photo_id: str, name: str = "Push day") -> dict:
    return {
        "name": name,
        "workout_date": date.today().isoformat(),
        "category": "push",
        "notes": "Felt strong",
        "movements": [
            {
                "exercise_id": exercise_id,
                "notes": "Video - Bench @ 0:10: https://youtu.be/private",
                "machine_photo_ids": [photo_id],
                "sets": [
                    {
                        "reps": 5,
                        "weight_kg": 100,
                        "bodyweight_kg": 82.5,
                        "notes": "Paused",
                        "completed": True,
                    }
                ],
            }
        ],
    }


def add_training_history(test_client: TestClient) -> dict:
    bench = named(test_client, "Barbell Bench Press")["id"]
    photo = upload_photo(test_client, bench).json()
    workout = test_client.post("/api/workouts", json=detailed_workout(bench, photo["id"]))
    assert workout.status_code == 201, workout.text
    sample = test_client.post(
        "/api/workouts", json=detailed_workout(bench, photo["id"], name="Sample day")
    ).json()
    with SessionLocal() as db:
        db.execute(
            update(TrainingWorkout).where(TrainingWorkout.id == sample["id"]).values(is_sample=True)
        )
        db.commit()
    today = date.today()
    assert test_client.post(
        "/api/body-measurements",
        json={"measurement_date": today.isoformat(), "weight_kg": 82.5, "notes": "Morning"},
    ).is_success
    assert test_client.post(
        "/api/body-weight-goals",
        json={
            "start_date": today.isoformat(),
            "target_date": (today + timedelta(days=60)).isoformat(),
            "start_weight_kg": 82.5,
            "target_weight_kg": 78,
        },
    ).is_success
    assert test_client.post(
        "/api/cardio",
        json={
            "session_date": today.isoformat(),
            "activity_type": "Bike",
            "duration_minutes": 40,
            "qualifies_zone2": True,
            "notes": "Easy spin",
        },
    ).is_success
    buffer = BytesIO()
    Image.new("RGB", (300, 300), "#336699").save(buffer, format="JPEG")
    assert test_client.put(
        "/api/profile/photo", files={"file": ("me.jpg", buffer.getvalue(), "image/jpeg")}
    ).is_success
    return workout.json()


def test_sharing_starts_off_and_saves_each_choice(client):
    assert client.get("/api/sharing").json() == {key: False for key in ALL_CHOICES}
    saved = share(client, share_goals=True)
    assert saved == {key: key in {"enabled", "share_goals"} for key in ALL_CHOICES}
    assert client.get("/api/sharing").json() == saved

    # Choices are kept while sharing is off, so turning it back on restores them.
    off = client.put("/api/sharing", json={**saved, "enabled": False}).json()
    assert off["enabled"] is False and off["share_goals"] is True
    assert client.get("/api/sharing").headers["cache-control"] == "no-store"


def test_only_sharing_members_can_see_shared_profiles(client, other_client):
    assert other_client.get("/api/sharing/profiles").status_code == 403
    assert other_client.get("/api/sharing/profiles").json()["error"]["code"] == "sharing_required"

    share(client)
    profiles = client.get("/api/sharing/profiles").json()
    assert [(item["display_name"], item["is_you"]) for item in profiles] == [("Owner", True)]
    # A member who does not share is indistinguishable from one who does not exist.
    hidden = client.get(f"/api/sharing/profiles/{other_client.user['id']}")
    assert hidden.status_code == 404
    assert client.get("/api/sharing/profiles/missing").status_code == 404
    assert other_client.get(f"/api/sharing/profiles/{client.user['id']}").status_code == 403
    assert other_client.get(f"/api/sharing/profiles/{client.user['id']}/workouts").status_code == (
        403
    )

    share(other_client)
    names = [item["display_name"] for item in other_client.get("/api/sharing/profiles").json()]
    assert names == ["Other", "Owner"]
    assert "username" not in other_client.get("/api/sharing/profiles").json()[1]


def test_shared_profile_includes_only_the_chosen_parts(client, other_client):
    workout = add_training_history(client)
    share(client)
    share(other_client)
    owner_id = client.user["id"]

    profile = other_client.get(f"/api/sharing/profiles/{owner_id}").json()
    assert profile["is_you"] is False
    assert profile["workout_count"] == 1 and profile["recent_workout_count"] == 1
    assert profile["last_workout_date"] == date.today().isoformat()
    assert profile["shares"] == {
        "notes": False,
        "cardio": False,
        "body_weight": False,
        "goals": False,
    }
    assert profile["profile_photo_url"] is None
    assert profile["body_weight"] is None
    assert profile["goals"] is None
    assert profile["cardio_sessions"] is None
    assert other_client.get(f"/api/sharing/profiles/{owner_id}/photo").status_code == 404

    page = other_client.get(f"/api/sharing/profiles/{owner_id}/workouts").json()
    assert page["total"] == 1  # The sample workout is never shared.
    [shared] = page["workouts"]
    assert shared["id"] == workout["id"]
    assert shared["notes"] is None
    [movement] = shared["movements"]
    assert movement["notes"] is None
    assert movement["machine_photos"] == []
    assert movement["sets"][0]["notes"] is None
    assert movement["sets"][0]["bodyweight_kg"] is None
    assert movement["sets"][0]["weight_kg"] == 100
    assert {record["workout_id"] for record in page["personal_records"]} == {workout["id"]}

    share(client, **ALL_CHOICES)
    profile = other_client.get(f"/api/sharing/profiles/{owner_id}").json()
    assert profile["shares"] == {"notes": True, "cardio": True, "body_weight": True, "goals": True}
    assert profile["body_weight"] == [
        {"measurement_date": date.today().isoformat(), "weight_kg": 82.5, "body_fat_pct": None}
    ]
    assert profile["goals"]["body_weight"]["target_weight_kg"] == 78
    assert profile["goals"]["zone2"]["completed_minutes"] == 40
    assert [session["notes"] for session in profile["cardio_sessions"]] == ["Easy spin"]
    photo = other_client.get(profile["profile_photo_url"])
    assert photo.status_code == 200
    assert photo.headers["content-type"] == "image/webp"
    assert photo.headers["cache-control"] == "private, no-cache"

    [shared] = other_client.get(f"/api/sharing/profiles/{owner_id}/workouts").json()["workouts"]
    assert shared["notes"] == "Felt strong"
    assert shared["movements"][0]["notes"].startswith("Video - Bench")
    assert shared["movements"][0]["sets"][0]["notes"] == "Paused"
    assert shared["movements"][0]["sets"][0]["bodyweight_kg"] == 82.5
    assert shared["movements"][0]["machine_photos"] == []  # Machine photos stay private.


def test_workouts_are_paged_newest_first(client, other_client):
    bench = named(client, "Barbell Bench Press")["id"]
    for days_ago in range(3):
        payload = {
            "name": f"Day {days_ago}",
            "workout_date": (date.today() - timedelta(days=days_ago)).isoformat(),
            "category": "push",
            "movements": [{"exercise_id": bench, "sets": [{"reps": 5, "weight_kg": 60}]}],
        }
        assert client.post("/api/workouts", json=payload).status_code == 201
    share(client)
    share(other_client)
    path = f"/api/sharing/profiles/{client.user['id']}/workouts"

    first = other_client.get(path, params={"limit": 2}).json()
    rest = other_client.get(path, params={"limit": 2, "offset": 2}).json()
    assert first["total"] == rest["total"] == 3
    assert [item["name"] for item in first["workouts"] + rest["workouts"]] == [
        "Day 0",
        "Day 1",
        "Day 2",
    ]
    assert other_client.get(path, params={"limit": 51}).status_code == 422


def test_stopping_sharing_hides_the_profile_and_others(client, other_client):
    share(client)
    share(other_client)
    owner_id = client.user["id"]
    assert other_client.get(f"/api/sharing/profiles/{owner_id}").status_code == 200

    assert client.put("/api/sharing", json={"enabled": False}).status_code == 200
    assert other_client.get(f"/api/sharing/profiles/{owner_id}").status_code == 404
    assert [item["is_you"] for item in other_client.get("/api/sharing/profiles").json()] == [True]
    assert client.get("/api/sharing/profiles").status_code == 403


def test_disabled_and_deleted_accounts_are_not_shared(client, other_client):
    share(client)
    share(other_client)
    other_id = other_client.user["id"]
    assert client.patch(f"/api/admin/users/{other_id}", json={"disabled": True}).is_success
    assert client.get(f"/api/sharing/profiles/{other_id}").status_code == 404
    assert [item["id"] for item in client.get("/api/sharing/profiles").json()] == [
        client.user["id"]
    ]

    third = TestClient(client.app)
    register_user(third, "third", "Third")
    share(third)
    assert third.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD}).is_success
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(ProfileSharing)) == 2
    third.close()
