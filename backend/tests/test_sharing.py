from datetime import UTC, date, datetime, timedelta
from io import BytesIO

from conftest import TEST_PASSWORD, register_user
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select, update
from test_auth import named, upload_photo

from app.database import SessionLocal
from app.models import ProfileFollow, ProfileSharing, TrainingWorkout

NOTHING_EXTRA = {
    "share_notes": False,
    "share_cardio": False,
    "share_body_weight": False,
    "share_goals": False,
    "share_machine_photos": False,
}
EVERYTHING = {key: True for key in NOTHING_EXTRA}


def share(test_client: TestClient, visibility: str = "public", **choices: bool) -> dict:
    response = test_client.put("/api/sharing", json={"visibility": visibility, **choices})
    assert response.status_code == 200, response.text
    return response.json()


def profile(test_client: TestClient, owner: TestClient):
    return test_client.get(f"/api/sharing/profiles/{owner.user['id']}")


def jpeg() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (300, 300), "#336699").save(buffer, format="JPEG")
    return buffer.getvalue()


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
                    },
                    {
                        # A first set establishes the baseline; improving it earns a Volume PR.
                        "reps": 6,
                        "weight_kg": 100,
                        "bodyweight_kg": 82.5,
                        "completed": True,
                    },
                ],
            }
        ],
    }


def add_training_history(test_client: TestClient) -> dict:
    bench = named(test_client, "Barbell Bench Press")["id"]
    photo = upload_photo(test_client, bench).json()
    sample_only_photo = upload_photo(test_client, bench, "Sample bench").json()
    workout = test_client.post("/api/workouts", json=detailed_workout(bench, photo["id"]))
    assert workout.status_code == 201, workout.text
    sample = test_client.post(
        "/api/workouts", json=detailed_workout(bench, sample_only_photo["id"], name="Sample day")
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
    assert test_client.put(
        "/api/profile/photo", files={"file": ("me.jpg", jpeg(), "image/jpeg")}
    ).is_success
    return {"workout": workout.json(), "photo": photo, "sample_only_photo": sample_only_photo}


def test_sharing_starts_private_and_keeps_choices(client):
    assert client.get("/api/sharing").json() == {
        "visibility": "private",
        **NOTHING_EXTRA,
        "pending_requests": 0,
    }
    saved = share(client, "followers", share_goals=True)
    assert saved == {
        "visibility": "followers",
        **NOTHING_EXTRA,
        "share_goals": True,
        "pending_requests": 0,
    }
    assert client.get("/api/sharing").json() == saved

    # Choices are kept while private, so sharing again restores them.
    private = share(client, "private", share_goals=True)
    assert private["visibility"] == "private" and private["share_goals"] is True
    assert client.put("/api/sharing", json={"visibility": "everyone"}).status_code == 422
    assert client.get("/api/sharing").headers["cache-control"] == "no-store"


def test_private_members_neither_see_others_nor_appear(client, other_client):
    share(client)
    response = other_client.get("/api/sharing/profiles")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "sharing_required"
    assert profile(other_client, client).status_code == 403

    # A private member is indistinguishable from one who does not exist.
    assert [item["is_you"] for item in client.get("/api/sharing/profiles").json()] == [True]
    assert profile(client, other_client).status_code == 404
    assert client.get("/api/sharing/profiles/missing").status_code == 404
    assert client.post(f"/api/sharing/follows/{other_client.user['id']}").status_code == 404
    assert client.post(f"/api/sharing/follows/{client.user['id']}").status_code == 422


def test_public_profiles_are_open_to_sharing_members_and_follows_are_instant(client, other_client):
    add_training_history(client)
    share(client, "public")
    share(other_client, "followers")

    [owner] = [
        item for item in other_client.get("/api/sharing/profiles").json() if not item["is_you"]
    ]
    assert owner["visibility"] == "public" and owner["can_view"] is True
    assert owner["workout_count"] == 1
    assert owner["follow_status"] == "none"
    assert "username" not in owner

    followed = other_client.post(f"/api/sharing/follows/{client.user['id']}")
    assert followed.json() == {"status": "accepted"}
    assert profile(other_client, client).json()["follow_status"] == "accepted"
    followers = client.get("/api/sharing/followers").json()
    assert [item["display_name"] for item in followers["followers"]] == ["Other"]
    assert followers["requests"] == []
    assert profile(client, other_client).json()["follows_you"] is True


def test_follow_dates_describe_each_direction_and_exclude_pending_requests(client, other_client):
    share(client, "public")
    share(other_client, "followers")
    client.post(f"/api/sharing/follows/{other_client.user['id']}")
    other_client.post(f"/api/sharing/follows/{client.user['id']}")
    started = datetime(2026, 10, 6, 12, tzinfo=UTC)
    with SessionLocal() as db:
        follow = db.get(ProfileFollow, (other_client.user["id"], client.user["id"]))
        follow.created_at = datetime(2026, 10, 1, 12, tzinfo=UTC)
        follow.accepted_at = started
        db.commit()
    expected = started.isoformat().replace("+00:00", "Z")
    detail = profile(client, other_client).json()
    assert detail["follow_status"] == "pending"
    assert detail["following_since"] is None
    assert detail["follows_you_since"] == expected
    listed = next(
        item
        for item in client.get("/api/sharing/profiles").json()
        if item["id"] == other_client.user["id"]
    )
    assert listed["follows_you_since"] == expected
    assert listed["following_since"] is None
    reverse = profile(other_client, client).json()
    assert reverse["following_since"] == expected
    assert reverse["follows_you_since"] is None
    # Approval starts the relationship now, rather than on the request or signup date.
    other_client.post(f"/api/sharing/followers/{client.user['id']}")
    accepted = profile(client, other_client).json()["following_since"]
    connections = other_client.get("/api/sharing/followers").json()
    assert accepted == connections["followers"][0]["since"]
    assert profile(other_client, client).json()["follows_you_since"] == accepted
    other_client.delete(f"/api/sharing/follows/{client.user['id']}")
    assert profile(client, other_client).json()["follows_you_since"] is None


def test_friends_only_profiles_need_an_approved_follow_request(client, other_client):
    add_training_history(client)
    share(client, "followers", **EVERYTHING)
    share(other_client, "public")
    owner_id = client.user["id"]

    # Before approval: name and photo only.
    locked = profile(other_client, client).json()
    assert locked["visibility"] == "followers"
    assert locked["can_view"] is False
    assert locked["workout_count"] is None and locked["shares"] is None
    assert locked["body_weight"] is None and locked["goals"] is None
    assert locked["profile_photo_url"].startswith(f"/api/sharing/profiles/{owner_id}/photo")
    assert other_client.get(locked["profile_photo_url"]).status_code == 200
    blocked = other_client.get(f"/api/sharing/profiles/{owner_id}/workouts")
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "follow_required"

    assert other_client.post(f"/api/sharing/follows/{owner_id}").json() == {"status": "pending"}
    assert other_client.post(f"/api/sharing/follows/{owner_id}").json() == {"status": "pending"}
    assert profile(other_client, client).json()["can_view"] is False
    assert client.get("/api/sharing").json()["pending_requests"] == 1
    requests = client.get("/api/sharing/followers").json()["requests"]
    assert [item["display_name"] for item in requests] == ["Other"]

    # Declining removes the request; approving a new one opens the profile.
    assert client.delete(f"/api/sharing/followers/{other_client.user['id']}").status_code == 204
    assert profile(other_client, client).json()["follow_status"] == "none"
    other_client.post(f"/api/sharing/follows/{owner_id}")
    assert client.post(f"/api/sharing/followers/{other_client.user['id']}").status_code == 204
    opened = profile(other_client, client).json()
    assert opened["can_view"] is True and opened["follow_status"] == "accepted"
    assert opened["body_weight"] is not None
    assert other_client.get(f"/api/sharing/profiles/{owner_id}/workouts").status_code == 200
    assert client.get("/api/sharing").json()["pending_requests"] == 0

    # Removing a follower locks the profile again.
    assert client.delete(f"/api/sharing/followers/{other_client.user['id']}").status_code == 204
    assert profile(other_client, client).json()["can_view"] is False
    missing = client.post(f"/api/sharing/followers/{other_client.user['id']}")
    assert missing.status_code == 404


def test_making_a_profile_public_approves_waiting_requests(client, other_client):
    share(client, "followers")
    share(other_client, "public")
    other_client.post(f"/api/sharing/follows/{client.user['id']}")
    assert share(client, "public")["pending_requests"] == 0
    assert profile(other_client, client).json()["follow_status"] == "accepted"

    # Followers stay followers when the profile becomes friends-only again.
    share(client, "followers")
    assert profile(other_client, client).json()["can_view"] is True


def test_shared_profile_includes_only_the_chosen_parts(client, other_client):
    history = add_training_history(client)
    share(client, "public")
    share(other_client, "public")
    owner_id = client.user["id"]

    view = profile(other_client, client).json()
    assert view["workout_count"] == 1 and view["recent_workout_count"] == 1
    assert view["last_workout_date"] == date.today().isoformat()
    assert view["shares"] == {
        key: False for key in ("notes", "cardio", "body_weight", "goals", "machine_photos")
    }
    # The profile photo is always shared.
    assert other_client.get(view["profile_photo_url"]).headers["cache-control"] == (
        "private, no-cache"
    )
    assert view["body_weight"] is None and view["goals"] is None
    assert view["cardio_sessions"] is None
    photo_path = f"/api/sharing/profiles/{owner_id}/machine-photos/{history['photo']['id']}"
    assert other_client.get(photo_path).status_code == 404

    page = other_client.get(f"/api/sharing/profiles/{owner_id}/workouts").json()
    assert page["total"] == 1  # The sample workout is never shared.
    [shared] = page["workouts"]
    assert shared["id"] == history["workout"]["id"]
    assert shared["notes"] is None
    [movement] = shared["movements"]
    assert movement["notes"] is None
    assert movement["machine_photos"] == []
    assert movement["sets"][0]["notes"] is None
    assert movement["sets"][0]["bodyweight_kg"] is None
    assert movement["sets"][0]["weight_kg"] == 100
    assert {record["workout_id"] for record in page["personal_records"]} == {shared["id"]}
    [record] = page["personal_records"]
    assert record["record_type"] == "reps_at_weight"
    assert record["value"] == 6 and record["weight_kg"] == 100

    share(client, "public", **EVERYTHING)
    view = profile(other_client, client).json()
    assert all(view["shares"].values())
    assert view["body_weight"] == [
        {"measurement_date": date.today().isoformat(), "weight_kg": 82.5, "body_fat_pct": None}
    ]
    assert view["goals"]["body_weight"]["target_weight_kg"] == 78
    assert view["goals"]["zone2"]["completed_minutes"] == 40
    assert [session["notes"] for session in view["cardio_sessions"]] == ["Easy spin"]

    [shared] = other_client.get(f"/api/sharing/profiles/{owner_id}/workouts").json()["workouts"]
    assert shared["notes"] == "Felt strong"
    [movement] = shared["movements"]
    assert movement["notes"].startswith("Video - Bench")
    assert movement["sets"][0]["notes"] == "Paused"
    assert movement["sets"][0]["bodyweight_kg"] == 82.5
    [photo] = movement["machine_photos"]
    assert photo["thumbnail_url"] == f"{photo_path}?variant=thumbnail"
    for url in (photo["thumbnail_url"], photo["full_url"]):
        image = other_client.get(url)
        assert image.status_code == 200 and image.headers["content-type"] == "image/webp"
    # A photo used only by sample workouts stays private.
    sample_only = (
        f"/api/sharing/profiles/{owner_id}/machine-photos/{history['sample_only_photo']['id']}"
    )
    assert other_client.get(sample_only).status_code == 404


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


def test_shared_workout_filters_cover_full_history_and_filtered_pagination(client, other_client):
    history = add_training_history(client)
    bench = history["workout"]["movements"][0]["exercise"]["id"]
    squat = named(client, "Back Squat")["id"]
    older = detailed_workout(bench, history["photo"]["id"], "Older push")
    older["workout_date"] = (date.today() - timedelta(days=45)).isoformat()
    assert client.post("/api/workouts", json=older).status_code == 201
    lower = {
        "name": "Lower",
        "workout_date": (date.today() - timedelta(days=5)).isoformat(),
        "category": "lower",
        "movements": [{"exercise_id": squat, "sets": [{"reps": 5, "weight_kg": 60}]}],
    }
    assert client.post("/api/workouts", json=lower).status_code == 201
    share(client, "public", share_machine_photos=True)
    share(other_client)
    base = f"/api/sharing/profiles/{client.user['id']}"
    options = other_client.get(base + "/workout-filters").json()
    assert {item["id"] for item in options["exercises"]} == {bench, squat}
    assert [item["id"] for item in options["machines"]] == [history["photo"]["id"]]
    assert options["machines"][0]["thumbnail_url"].startswith(base + "/machine-photos/")
    first = other_client.get(base + "/workouts", params={"category": "push", "limit": 1}).json()
    rest = other_client.get(
        base + "/workouts", params={"category": "push", "limit": 1, "offset": 1}
    ).json()
    assert first["total"] == rest["total"] == 2
    assert first["workouts"][0]["name"] == "Push day"
    assert rest["workouts"][0]["name"] == "Older push"
    assert other_client.get(base + "/workouts", params={"exercise_id": squat}).json()["total"] == 1
    assert (
        other_client.get(
            base + "/workouts", params={"machine_photo_id": history["photo"]["id"]}
        ).json()["total"]
        == 2
    )
    page = other_client.get(
        base + "/workouts",
        params={
            "category": "push",
            "start_date": date.today().isoformat(),
            "end_date": date.today().isoformat(),
        },
    ).json()
    assert page["total"] == 1 and page["workouts"][0]["name"] == "Push day"
    assert (
        other_client.get(
            base + "/workouts", params={"exercise_id": "another-members-exercise"}
        ).json()["total"]
        == 0
    )
    assert (
        other_client.get(
            base + "/workouts", params={"machine_photo_id": history["sample_only_photo"]["id"]}
        ).json()["total"]
        == 0
    )
    assert (
        other_client.get(
            base + "/workouts", params={"start_date": "2026-10-10", "end_date": "2026-10-01"}
        ).status_code
        == 422
    )


def test_shared_filter_options_respect_profile_access_and_photo_sharing(client, other_client):
    history = add_training_history(client)
    share(client, "public")
    share(other_client)
    base = f"/api/sharing/profiles/{client.user['id']}"
    assert other_client.get(base + "/workout-filters").json()["machines"] == []
    assert (
        other_client.get(
            base + "/workouts", params={"machine_photo_id": history["photo"]["id"]}
        ).status_code
        == 403
    )
    share(client, "followers")
    assert other_client.get(base + "/workout-filters").status_code == 403
    assert other_client.get(base + "/workouts", params={"category": "push"}).status_code == 403
    share(client, "private")
    assert other_client.get(base + "/workout-filters").status_code == 404


def test_going_private_hides_the_profile_and_others(client, other_client):
    share(client)
    share(other_client)
    other_client.post(f"/api/sharing/follows/{client.user['id']}")
    assert profile(other_client, client).status_code == 200

    share(client, "private")
    assert profile(other_client, client).status_code == 404
    assert [item["is_you"] for item in other_client.get("/api/sharing/profiles").json()] == [True]
    assert client.get("/api/sharing/profiles").status_code == 403
    # Unfollowing is always possible.
    assert other_client.delete(f"/api/sharing/follows/{client.user['id']}").status_code == 204
    share(client)
    assert profile(other_client, client).json()["follow_status"] == "none"


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
    third.user = register_user(third, "third", "Third")
    share(third, "followers")
    third.post(f"/api/sharing/follows/{client.user['id']}")
    client.post(f"/api/sharing/follows/{third.user['id']}")
    assert third.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD}).is_success
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(ProfileSharing)) == 2
        assert db.scalar(select(func.count()).select_from(ProfileFollow)) == 0
    third.close()
