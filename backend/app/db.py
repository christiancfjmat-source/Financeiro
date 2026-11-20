from pathlib import Path
import os

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event
from sqlalchemy.engine import URL

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "data" / "moradia.sqlite3"


def database_path() -> Path:
    return Path(os.environ.get("MORADIA_DB", DEFAULT_DB)).resolve()


def engine_for(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(URL.create("sqlite", database=str(path)))

    @event.listens_for(engine, "connect")
    def configure(connection, _):
        connection.execute("PRAGMA foreign_keys = ON")

    return engine


def migrate(engine):
    config = Config()
    config.set_main_option("script_location", str(ROOT / "backend" / "migrations").replace("%", "%%"))
    with engine.begin() as connection:
        connection.exec_driver_sql("BEGIN IMMEDIATE")
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
