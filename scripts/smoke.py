"""Run against a real HTTP server: uv run python scripts/smoke.py [base_url]."""

import json
import sys
from urllib.request import Request, urlopen

base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"


def call(path, data=None):
    body = None if data is None else json.dumps(data).encode()
    request = Request(base + path, data=body, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=15) as response:
        return json.load(response)


assert call("/health")["status"] == "ok"
resume = call("/api/v1/resumes/parse", {"raw_text": "Demo resume: Python, SQL project"})
job = call("/api/v1/jobs", {"title": "Data analyst", "jd_text": "Python and SQL"})
result = call("/api/v1/workflow", {"resume_id": resume["id"], "jd_id": job["id"]})
assert call("/api/v1/matches/" + result["match"]["id"]) == result["match"]
assert call("/api/v1/diagnoses/" + result["diagnosis"]["id"]) == result["diagnosis"]
call("/api/v1/analytics")
print(json.dumps({"status": "passed", "result": result}, ensure_ascii=True))
