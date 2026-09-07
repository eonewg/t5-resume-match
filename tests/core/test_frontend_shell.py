from fastapi.testclient import TestClient

from backend.core.config import Settings
from backend.main import create_app


def test_shell_assets_and_shared_fixture_are_available():
    with TestClient(
        create_app(Settings(_env_file=None, database_url="sqlite:///:memory:"))
    ) as client:
        page = client.get("/")
        assert page.status_code == 200
        assert 'id="workflow-form"' in page.text
        assert "/assets/app.js" in page.text
        script = client.get("/assets/app.js")
        assert script.status_code == 200
        assert "javascript" in script.headers["content-type"]
        assert client.get("/assets/styles.css").status_code == 200
        sample = client.get("/demo/sample.json").json()
        assert sample["resume"]["id"] == "resume_demo"
        # Serving the frontend must not expose files elsewhere in the project.
        assert client.get("/assets/%2e%2e/%2e%2e/.env.example").status_code == 404
        assert client.get("/assets/AGENTS.md").status_code == 404
        assert client.get("/openapi.json").status_code == 200
