from datetime import date, timedelta

import pytest
from conftest import register_user
from fastapi.testclient import TestClient
from test_auth import named
from test_sharing import share


def log_workout(test_client: TestClient, name: str, days_ago: int, notes: str | None = None):
    response = test_client.post(
        "/api/workouts",
        json={
            "name": name,
            "workout_date": (date.today() - timedelta(days=days_ago)).isoformat(),
            "category": "push",
            "notes": notes,
            "movements": [
                {
                    "exercise_id": named(test_client, "Barbell Bench Press")["id"],
                    "sets": [{"reps": 5, "weight_kg": 100, "completed": True}],
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def third_client(client):
    third = TestClient(client.app)
    third.user = register_user(third, "third", "Third")
    yield third
    third.close()


def test_feed_shows_each_followed_members_latest_session(client, other_client, third_client):
    share(other_client, "public")
    share(third_client, "followers")
    for days_ago in range(4):
        log_workout(other_client, f"Other {days_ago}", days_ago * 2 + 1, notes="Private note")
        log_workout(third_client, f"Third {days_ago}", days_ago * 2)
    log_workout(client, "Mine", 0)

    # Nobody followed yet; public profiles still need a follow to appear.
    assert client.get("/api/sharing/feed").json() == {"items": [], "following": 0}
    client.post(f"/api/sharing/follows/{other_client.user['id']}")
    client.post(f"/api/sharing/follows/{third_client.user['id']}")
    # The friends-only request is still pending, so only Other appears.
    feed = client.get("/api/sharing/feed").json()
    assert [item["workout"]["name"] for item in feed["items"]] == ["Other 0"]
    assert feed["following"] == 1

    third_client.post(f"/api/sharing/followers/{client.user['id']}")
    feed = client.get("/api/sharing/feed").json()
    # One latest session per friend, most recent first.
    assert [item["workout"]["name"] for item in feed["items"]] == ["Third 0", "Other 0"]
    assert feed["following"] == 2
    other = feed["items"][1]
    assert other["friend"] == {
        "id": other_client.user["id"],
        "display_name": "Other",
        "profile_photo_url": None,
    }
    # Notes stay hidden unless the owner shares them.
    assert other["workout"]["notes"] is None
    assert other["reactions"] == {"counts": [], "yours": None}


def test_feed_counts_friends_without_sessions_and_hides_private_ones(client, other_client):
    share(other_client, "public")
    client.post(f"/api/sharing/follows/{other_client.user['id']}")
    assert client.get("/api/sharing/feed").json() == {"items": [], "following": 1}
    log_workout(other_client, "First", 0)
    share(other_client, "private")
    assert client.get("/api/sharing/feed").json() == {"items": [], "following": 0}


def test_private_members_cannot_load_the_feed(client):
    share(client, "private")
    response = client.get("/api/sharing/feed")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "sharing_required"


def test_reactions_are_one_per_member_and_notify_the_owner(client, other_client, third_client):
    share(client, "public")
    workout = log_workout(client, "Leg day", 0)
    url = f"/api/sharing/workouts/{workout['id']}/reaction"
    for member in (other_client, third_client):
        member.post(f"/api/sharing/follows/{client.user['id']}")

    assert other_client.put(url, json={"reaction": "fire"}).json() == {
        "counts": [{"reaction": "fire", "count": 1}],
        "yours": "fire",
    }
    # Reacting again replaces the earlier reaction rather than adding another.
    other_client.put(url, json={"reaction": "strong"})
    assert third_client.put(url, json={"reaction": "fire"}).json() == {
        "counts": [{"reaction": "strong", "count": 1}, {"reaction": "fire", "count": 1}],
        "yours": "fire",
    }
    feed = other_client.get("/api/sharing/feed").json()["items"]
    assert feed[0]["reactions"]["yours"] == "strong"

    notices = client.get("/api/sharing/notifications").json()["reactions"]
    assert [(item["display_name"], item["reaction"]) for item in notices] == [
        ("Third", "fire"),
        ("Other", "strong"),
    ]
    assert notices[0]["workout_name"] == "Leg day"
    assert other_client.get("/api/sharing/notifications").json()["reactions"] == []

    # Dismissing one notice leaves the other; a stale dismissal does not hide a new reaction.
    stale = notices[1]
    dismiss = f"/api/sharing/reactions/{workout['id']}/{other_client.user['id']}/dismiss"
    assert client.post(dismiss, json={"since": stale["since"]}).status_code == 204
    assert [
        item["display_name"]
        for item in client.get("/api/sharing/notifications").json()["reactions"]
    ] == ["Third"]
    other_client.put(url, json={"reaction": "clap"})
    client.post(dismiss, json={"since": stale["since"]})
    assert len(client.get("/api/sharing/notifications").json()["reactions"]) == 2

    # Like and love are reactions too, listed before the others.
    other_client.put(url, json={"reaction": "love"})
    assert third_client.put(url, json={"reaction": "like"}).json() == {
        "counts": [{"reaction": "like", "count": 1}, {"reaction": "love", "count": 1}],
        "yours": "like",
    }
    third_client.put(url, json={"reaction": "fire"})

    assert other_client.delete(url).json() == {
        "counts": [{"reaction": "fire", "count": 1}],
        "yours": None,
    }
    assert len(client.get("/api/sharing/notifications").json()["reactions"]) == 1


def test_reactions_respect_profile_access(client, other_client):
    share(client, "followers")
    workout = log_workout(client, "Friends only", 0)
    url = f"/api/sharing/workouts/{workout['id']}/reaction"

    assert other_client.put(url, json={"reaction": "fire"}).status_code == 403
    assert other_client.put(url, json={"reaction": "wave"}).status_code == 422
    assert client.put(url, json={"reaction": "fire"}).status_code == 404
    assert (
        other_client.put(
            "/api/sharing/workouts/missing/reaction", json={"reaction": "fire"}
        ).status_code
        == 404
    )

    other_client.post(f"/api/sharing/follows/{client.user['id']}")
    client.post(f"/api/sharing/followers/{other_client.user['id']}")
    assert other_client.put(url, json={"reaction": "clap"}).status_code == 200
    # Deleting the workout removes its reactions and notifications.
    assert client.delete(f"/api/workouts/{workout['id']}").status_code == 204
    assert client.get("/api/sharing/notifications").json()["reactions"] == []
