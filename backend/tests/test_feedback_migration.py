import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_feedback_upgrade_preserves_accounts_and_supports_downgrade():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0031_app_feedback.py"
    spec = importlib.util.spec_from_file_location("feedback_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('sample-user')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert "app_feedback" in inspect(connection).get_table_names()
        assert len(inspect(connection).get_indexes("app_feedback")) == 2
        connection.execute(
            text(
                "INSERT INTO app_feedback (id, user_id, submission_id, message) "
                "VALUES ('sample-feedback', 'sample-user', 'sample-submission', 'Thanks!')"
            )
        )
        assert connection.scalar(text("SELECT message FROM app_feedback")) == "Thanks!"
        migration.downgrade()
        assert "app_feedback" not in inspect(connection).get_table_names()
        assert connection.scalar(text("SELECT id FROM users")) == "sample-user"
