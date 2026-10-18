import pytest


def test_weekly_muscle_set_goal_defaults_persists_and_is_account_owned(client, other_client):
    preferences = client.get("/api/training-preferences").json()
    assert preferences["weekly_muscle_set_goal"] == 10
    updated = client.put(
        "/api/training-preferences", json={**preferences, "weekly_muscle_set_goal": 14}
    )
    assert updated.status_code == 200
    assert updated.json()["weekly_muscle_set_goal"] == 14
    assert client.get("/api/training-preferences").json()["weekly_muscle_set_goal"] == 14
    assert other_client.get("/api/training-preferences").json()["weekly_muscle_set_goal"] == 10

    # An older client updating units or the start day must not reset the saved goal.
    preferences.pop("weekly_muscle_set_goal")
    assert client.put("/api/training-preferences", json=preferences).status_code == 200
    assert client.get("/api/training-preferences").json()["weekly_muscle_set_goal"] == 14


@pytest.mark.parametrize("goal", [0, -1, 1001, 2.5])
def test_weekly_muscle_set_goal_rejects_invalid_values(client, goal):
    preferences = client.get("/api/training-preferences").json()
    response = client.put(
        "/api/training-preferences", json={**preferences, "weekly_muscle_set_goal": goal}
    )
    assert response.status_code == 422
    assert client.get("/api/training-preferences").json()["weekly_muscle_set_goal"] == 10
