"""Let accounts share their profile with other sharing members.

Revision ID: 0033_profile_sharing
Revises: 0032_profile_photos

Accounts without a row do not share. Downgrading drops only the sharing choices.
"""

import sqlalchemy as sa
from alembic import op

revision = "0033_profile_sharing"
down_revision = "0032_profile_photos"
branch_labels = None
depends_on = None

CHOICES = (
    "enabled",
    "share_notes",
    "share_cardio",
    "share_body_weight",
    "share_goals",
    "share_profile_photo",
)


def upgrade() -> None:
    op.create_table(
        "profile_sharing",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        *(sa.Column(name, sa.Boolean(), server_default="0", nullable=False) for name in CHOICES),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("profile_sharing")
