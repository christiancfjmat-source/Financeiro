import asyncio
import json
import webbrowser
from urllib.request import urlopen

import uvicorn

from .main import app


def already_running(url: str) -> bool:
    try:
        with urlopen(f"{url}openapi.json", timeout=1) as response:
            spec = json.load(response)
            info = spec.get("info") if isinstance(spec, dict) else None
            return isinstance(info, dict) and info.get("title") == app.title
    except (OSError, ValueError):
        return False


def open_browser(url: str):
    try:
        if webbrowser.open(url):
            return
    except (OSError, webbrowser.Error):
        pass
    print(f"Abra {url} no navegador.", flush=True)


class BrowserServer(uvicorn.Server):
    async def startup(self, sockets=None):
        await super().startup(sockets)
        if self.started:
            await asyncio.to_thread(open_browser, f"http://{self.config.host}:{self.config.port}/")


def main() -> int:
    config = uvicorn.Config(app, host="127.0.0.1", port=8000)
    url = f"http://{config.host}:{config.port}/"
    if already_running(url):
        open_browser(url)
        return 0
    server = BrowserServer(config)
    server.run()
    return 0 if server.started else 1


if __name__ == "__main__":
    raise SystemExit(main())
