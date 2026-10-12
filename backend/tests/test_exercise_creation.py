import pytest


def exercise_payload(**changes):
    return {
        "name": "  Custom lat exercise  ",
        "category": "pull",
        "kind": "strength",
        "muscle_group": " Lats ",
        "equipment": " Cable ",
        **changes,
    }


def test_create_exercise_persists_in_library(client):
    response = client.post("/api/exercises", json=exercise_payload())
    assert response.status_code == 201
    exercise = response.json()
    assert exercise["name"] == "Custom lat exercise"
    assert exercise["category"] == "pull"
    assert exercise["kind"] == "strength"
    assert exercise["muscle_group"] == "Lats"
    assert exercise["equipment"] == "Cable"
    assert exercise["is_custom"] is True
    assert exercise in client.get("/api/exercises").json()


def test_create_exercise_duplicate_does_not_add_another_entry(client):
    assert client.post("/api/exercises", json=exercise_payload()).status_code == 201
    response = client.post("/api/exercises", json=exercise_payload())
    assert response.status_code == 409
    assert "already exists" in response.json()["error"]["message"]
    assert (
        len(
            [
                item
                for item in client.get("/api/exercises").json()
                if item["name"] == "Custom lat exercise"
            ]
        )
        == 1
    )


def test_create_exercise_alias_does_not_duplicate_a_canonical_exercise(client):
    response = client.post(
        "/api/exercises",
        json=exercise_payload(
            name="Bench Press",
            category="push",
            muscle_group="Chest",
            equipment="Barbell",
        ),
    )

    assert response.status_code == 409
    assert "already exists" in response.json()["error"]["message"]
    names = [item["name"] for item in client.get("/api/exercises").json()]
    assert names.count("Barbell Bench Press") == 1
    assert "Bench Press" not in names


def test_create_cardio_exercise_without_equipment(client):
    response = client.post(
        "/api/exercises",
        json=exercise_payload(category="cardio", kind="cardio", equipment=None),
    )
    assert response.status_code == 201
    assert response.json()["equipment"] is None
    assert response.json()["kind"] == "cardio"


@pytest.mark.parametrize(
    "changes",
    [
        {"name": " "},
        {"muscle_group": " "},
        {"category": ""},
        {"name": "a" * 161},
    ],
)
def test_create_exercise_validates_required_fields(client, changes):
    assert client.post("/api/exercises", json=exercise_payload(**changes)).status_code == 422


def test_custom_exercise_is_private_to_its_creator(client, other_client):
    created = client.post("/api/exercises", json=exercise_payload()).json()

    assert created["is_custom"] is True
    assert created in client.get("/api/exercises", params={"search": "lat exercise"}).json()
    assert other_client.get("/api/exercises", params={"search": "lat exercise"}).json() == []
    other_names = [item["name"] for item in other_client.get("/api/exercises").json()]
    assert "Custom lat exercise" not in other_names
    assert other_client.get(f"/api/progress/{created['id']}").status_code == 404
    favorite = other_client.patch(
        f"/api/exercises/{created['id']}/favorite", json={"is_favorite": True}
    )
    assert favorite.status_code == 404
    # The same name stays available to the other account as its own custom exercise.
    assert other_client.post("/api/exercises", json=exercise_payload()).status_code == 201
