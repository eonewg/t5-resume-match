from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.pool import StaticPool

from backend.core.paths import RUNTIME_ROOT


def build_engine(database_url: str):
    url = make_url(database_url)
    options = {}
    if url.get_backend_name() == "sqlite":
        options["connect_args"] = {"check_same_thread": False}
        if url.database in (None, "", ":memory:"):
            options["poolclass"] = StaticPool
        else:
            path = (RUNTIME_ROOT / url.database).resolve()
            path.parent.mkdir(parents=True, exist_ok=True)
            url = url.set(database=str(path))
    engine = create_engine(url, **options)
    if url.get_backend_name() == "sqlite":

        @event.listens_for(engine, "connect")
        def configure_sqlite(connection, _):
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine
