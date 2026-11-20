"""Create a consistent SQLite copy before upgrading local dependencies."""

from contextlib import closing
from datetime import datetime, timezone
import sqlite3
from uuid import uuid4

from .db import database_path


def backup():
    source = database_path()
    if not source.exists():
        return
    directory = source.parent / "backups"
    directory.mkdir(exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = directory / f"{source.stem}-{timestamp}-{uuid4().hex[:8]}.sqlite3"
    try:
        with (closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as original,
              closing(sqlite3.connect(target)) as copy):
            original.backup(copy)
            if copy.execute("PRAGMA integrity_check").fetchone() != ("ok",):
                raise RuntimeError("A verificação de integridade da cópia falhou.")
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    print(f"Backup: {target}")


if __name__ == "__main__":
    backup()
