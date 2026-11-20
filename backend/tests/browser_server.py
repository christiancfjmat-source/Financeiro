from pathlib import Path
import sys
from tempfile import TemporaryDirectory

import uvicorn

from backend.app.main import create_app


if __name__ == "__main__":
    with TemporaryDirectory(prefix="moradia-test-") as directory:
        app = create_app(Path(directory) / "test.sqlite3")
        uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]))
