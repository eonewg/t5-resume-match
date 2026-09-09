"""Console entry point for the Windows onedir distribution."""

import asyncio
import json
import sys
import webbrowser


def main():
    # Dispatch before loading FastAPI: workers must only speak the private pipe protocol.
    if sys.argv[1:] == ["--diagnosis-worker"]:
        from backend.modules.diagnosis.transport import worker_main

        worker_main()
        return
    if sys.argv[1:] == ["--check-config"]:
        from backend.core.paths import ENV_FILE, RUNTIME_ROOT
        from backend.modules.diagnosis.config import DiagnosisSettings
        from backend.modules.resume.config import ResumeSettings

        # Verification only: never print secrets, their lengths, or hashes.
        print(
            json.dumps(
                {
                    "env_file": str(ENV_FILE),
                    "runtime_root": str(RUNTIME_ROOT),
                    "resume_key_configured": bool(ResumeSettings().llm_api_key.get_secret_value()),
                    "diagnosis_key_configured": bool(
                        DiagnosisSettings().api_key.get_secret_value()
                    ),
                }
            )
        )
        return
    if sys.argv[1:]:
        raise SystemExit("Usage: T5-Resume-Match.exe")

    import uvicorn

    from backend.main import app

    class BrowserServer(uvicorn.Server):
        async def startup(self, sockets=None):
            await super().startup(sockets)
            # Uvicorn has completed lifespan AND bound its own socket at this point.
            if self.started:
                await asyncio.to_thread(webbrowser.open, "http://127.0.0.1:8000/")

    BrowserServer(
        uvicorn.Config(app, host="127.0.0.1", port=8000, loop="asyncio", http="h11")
    ).run()


if __name__ == "__main__":
    main()
