"""Make workout saves safe to retry and protect newer edits from stale devices.

Revision ID: 0034_workout_save_safety
Revises: 0033_profile_sharing

``revision`` starts at 1 for every existing workout and advances with each change, so a save from
an editor that loaded an older revision is refused instead of overwriting newer edits.
``client_request_id`` holds the idempotency key of the app save that created a workout. It is
unique per account, so a retried create returns the workout that was already saved. Existing,
imported and sample workouts keep it NULL; SQLite treats NULLs as distinct, so they never clash.
Downgrading drops both columns and the index.
"""

import sqlalchemy as sa
from alembic import op

revision = "0034_workout_save_safety"
down_revision = "0033_profile_sharing"
branch_labels = None
depends_on = None

INDEX = "uq_training_workout_client_request"


def upgrade() -> None:
    with op.batch_alter_table("training_workouts") as batch:
        batch.add_column(sa.Column("revision", sa.Integer(), server_default="1", nullable=False))
        batch.add_column(sa.Column("client_request_id", sa.String(36), nullable=True))
    op.create_index(INDEX, "training_workouts", ["user_id", "client_request_id"], unique=True)


def downgrade() -> None:
    op.drop_index(INDEX, table_name="training_workouts")
    with op.batch_alter_table("training_workouts") as batch:
        batch.drop_column("client_request_id")
        batch.drop_column("revision")
