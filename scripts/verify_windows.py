"""Developer smoke check for a built EXE. Uses only a fake key; no paid AI calls."""

import json
import os
import re
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener


def verify(folder):
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 8000))
    urlopen = build_opener(ProxyHandler({})).open
    folder = folder.resolve()
    exe = folder / "Vitae.exe"
    env_file = folder / ".env"
    if env_file.exists() or (folder / "data/t5.db").exists():
        raise RuntimeError("Use a fresh distribution; verification creates a test database.")
    env = {k: v for k, v in os.environ.items() if not k.startswith(("T5_", "DEEPSEEK_", "PYTHON"))}
    env["PATH"] = str(Path(os.environ["SystemRoot"]) / "System32")
    options = dict(cwd=folder.parent, env=env, creationflags=subprocess.CREATE_NO_WINDOW)

    def config():
        return json.loads(
            subprocess.check_output([str(exe), "--check-config"], **options, timeout=30)
        )

    absent = config()
    assert not absent["resume_key_configured"] and not absent["diagnosis_key_configured"]
    try:
        env_file.write_text("DEEPSEEK_API_KEY=portable-test-placeholder\n", encoding="utf-8")
        present = config()
        assert present["resume_key_configured"] and present["diagnosis_key_configured"]
        assert Path(present["env_file"]) == env_file
        # Local refused connection proves the frozen Diagnosis worker runs its protocol.
        worker = subprocess.run(
            [str(exe), "--diagnosis-worker"],
            input=json.dumps(
                {
                    "url": "https://127.0.0.1:1/",
                    "headers": {},
                    "body": "e30=",
                    "connect_timeout": 1,
                    "read_timeout": 1,
                }
            ).encode(),
            capture_output=True,
            timeout=15,
            check=True,
            **options,
        )
        assert json.loads(worker.stdout.splitlines()[-1])["error"]["category"] in {
            "connection_error",
            "timeout",
        }
        with (folder.parent / (folder.name + "-smoke.log")).open("wb") as log:
            process = subprocess.Popen([str(exe)], stdout=log, stderr=log, **options)
            try:
                for _ in range(150):
                    if process.poll() is not None:
                        raise RuntimeError("EXE exited; see smoke log")
                    try:
                        with urlopen("http://127.0.0.1:8000/health", timeout=1) as response:
                            assert response.status == 200
                        break
                    except URLError:
                        time.sleep(0.2)
                else:
                    raise RuntimeError("EXE did not start")
                statuses = {}
                with urlopen("http://127.0.0.1:8000/", timeout=5) as response:
                    html = response.read().decode("utf-8")
                assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html)
                assert any(path.endswith(".js") for path in assets)
                assert any(path.endswith(".css") for path in assets)
                assert not (folder / "_internal/frontend/node_modules").exists()
                assert not (folder / "_internal/frontend/src").exists()
                for path in ["/health", "/ready", "/", "/demo/sample.json", *assets]:
                    with urlopen("http://127.0.0.1:8000" + path, timeout=5) as response:
                        statuses[path] = response.status
                        assert response.status == 200
                with urlopen("http://127.0.0.1:8000/api/v1/modules", timeout=5) as response:
                    modules = json.load(response)
                assert len(modules) == 4 and all(not m["is_mock"] for m in modules.values())
                assert (folder / "data/t5.db").is_file()
                print(
                    json.dumps(
                        {
                            "folder": str(folder),
                            "config": present,
                            "http": statuses,
                            "modules": modules,
                        }
                    )
                )
            finally:
                process.terminate()
                process.wait(timeout=15)
    finally:
        env_file.unlink(missing_ok=True)


if __name__ == "__main__":
    verify(Path(sys.argv[1]))
