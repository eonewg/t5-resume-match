"""Request-scoped public resources for optional transactional Jobs providers."""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from sqlalchemy.orm import Session

from backend.core.vectors import VectorRepository


@dataclass(frozen=True)
class MatchContext:
    _session: Session

    @contextmanager
    def vector_repository(self) -> Iterator[VectorRepository | None]:
        """Same request transaction; catch cache failures outside this scope.

        SQLite yields None. PostgreSQL errors propagate after savepoint rollback.
        The provider must not retain this context or repository beyond the call.
        """
        if self._session.get_bind().dialect.name != "postgresql":
            yield None
            return
        with self._session.begin_nested():
            yield VectorRepository(self._session)
