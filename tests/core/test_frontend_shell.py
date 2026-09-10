import re

from fastapi.testclient import TestClient

from backend.core.config import Settings
from backend.main import create_app


def test_shell_assets_and_shared_fixture_are_available():
    with TestClient(
        create_app(Settings(_env_file=None, database_url="sqlite:///:memory:"))
    ) as client:
        page = client.get("/")
        assert page.status_code == 200
        assert 'id="root"' in page.text
        scripts = re.findall(r'src="(/assets/[^\"]+\.js)"', page.text)
        styles = re.findall(r'href="(/assets/[^\"]+\.css)"', page.text)
        assert scripts and styles, "Run npm --prefix frontend run build before pytest"
        script = client.get(scripts[0])
        assert script.status_code == 200
        assert "javascript" in script.headers["content-type"]
        assert client.get(styles[0]).status_code == 200
        assert page.headers["cache-control"] == "no-cache"
        assert client.get("/assets/main.tsx").status_code == 404
        sample = client.get("/demo/sample.json").json()
        assert sample["resume"]["id"] == "resume_demo"
        # Serving the frontend must not expose files elsewhere in the project.
        assert client.get("/assets/%2e%2e/%2e%2e/.env.example").status_code == 404
        assert client.get("/assets/AGENTS.md").status_code == 404
        assert client.get("/openapi.json").status_code == 200
