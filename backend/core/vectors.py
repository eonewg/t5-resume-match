"""Public transactional vector repository. No embedding generation or match scoring."""

import hashlib
import math
import struct
from typing import Annotated, Literal

from pgvector.sqlalchemy import Vector
from pydantic import Field, StringConstraints
from sqlalchemy import cast, delete, select, text
from sqlalchemy.dialects.postgresql import insert

from backend.models.entities import JDRow, ResumeRow
from backend.models.vectors import FragmentVectorRow, VectorRow, VectorSpaceRow
from backend.schemas.contracts import Contract, Label

SpaceId = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_-]{1,64}$")]
Hash = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]


class VectorSpace(Contract):
    id: SpaceId
    model: Label
    dimensions: int = Field(ge=1, le=16000, strict=True)
    metric: Literal["cosine", "l2", "inner_product"]


class VectorWrite(Contract):
    space_id: SpaceId
    kind: Literal["resume", "jd"]
    document_id: Label
    source_hash: Hash
    values: list[float] = Field(min_length=1, max_length=16000)


class FragmentSetWrite(Contract):
    space: VectorSpace
    kind: Literal["resume", "jd"]
    document_id: Label
    source_hash: Hash
    fragments: list[list[float]]


class FragmentVector(VectorWrite):
    index: int = Field(ge=0, strict=True)


class VectorHit(Contract):
    document_id: str
    source_hash: str
    distance: float = Field(allow_inf_nan=False)


class VectorRepository:
    """Caller owns the SQLAlchemy Session transaction; no implicit commit."""

    def __init__(self, session):
        if session.get_bind().dialect.name != "postgresql":
            raise ValueError("VectorRepository requires PostgreSQL + pgvector")
        self.session = session

    def register_space(self, specification: VectorSpace) -> VectorSpace:
        specification = VectorSpace.model_validate(specification.model_dump())
        self.session.execute(
            insert(VectorSpaceRow)
            .values(**specification.model_dump())
            .on_conflict_do_nothing(index_elements=["id"])
        )
        current = self.space(specification.id)
        if current != specification:
            raise ValueError("space already exists with a different model, dimension or metric")
        return current

    def space(self, identifier: str) -> VectorSpace:
        row = self.session.get(VectorSpaceRow, identifier)
        if row is None:
            raise ValueError("unknown vector space")
        return VectorSpace.model_validate(row)

    @staticmethod
    def _values(space, values):
        if len(values) != space.dimensions:
            raise ValueError("vector dimension mismatch")
        # PostgreSQL vector uses float32; reject nonfinite and out-of-range input early.
        if any(not math.isfinite(v) or abs(v) > 3.402823466e38 for v in values):
            raise ValueError("vector values must be finite float32 numbers")
        values = [struct.unpack("f", struct.pack("f", v))[0] for v in values]
        if space.metric == "cosine" and not any(values):
            raise ValueError("cosine distance is undefined for zero vectors")
        return values

    def upsert(self, value: VectorWrite):
        value = VectorWrite.model_validate(value.model_dump())
        space = self.space(value.space_id)
        values = self._values(space, value.values)
        table = ResumeRow if value.kind == "resume" else JDRow
        if self.session.get(table, value.document_id) is None:
            raise ValueError("unknown source document")
        key = "resume_id" if value.kind == "resume" else "jd_id"
        statement = insert(VectorRow).values(
            space_id=space.id,
            dimensions=space.dimensions,
            **{key: value.document_id},
            source_hash=value.source_hash,
            embedding=values,
        )
        self.session.execute(
            statement.on_conflict_do_update(
                index_elements=["space_id", key],
                set_={
                    "source_hash": statement.excluded.source_hash,
                    "embedding": statement.excluded.embedding,
                },
            )
        )

    def replace_fragments(self, batch: FragmentSetWrite) -> list[FragmentVector]:
        """Replace the complete ordered set; empty input deletes it. Never commit."""
        batch = FragmentSetWrite.model_validate(batch.model_dump())
        space = self.space(batch.space.id)
        if space != batch.space:
            raise ValueError("vector space specification mismatch")
        fragments = [
            FragmentVector(
                space_id=space.id,
                kind=batch.kind,
                document_id=batch.document_id,
                source_hash=batch.source_hash,
                index=index,
                values=self._values(space, values),
            )
            for index, values in enumerate(batch.fragments)
        ]
        table = ResumeRow if batch.kind == "resume" else JDRow
        key = "resume_id" if batch.kind == "resume" else "jd_id"
        # Serialize even the first cache write. The source row outlives cache rows.
        # Savepoint also protects callers who catch a database error and continue.
        with self.session.begin_nested():
            source = self.session.scalar(
                select(table.id).where(table.id == batch.document_id).with_for_update()
            )
            if source is None:
                raise ValueError("unknown source document")
            self.session.execute(
                delete(FragmentVectorRow).where(
                    FragmentVectorRow.space_id == space.id,
                    getattr(FragmentVectorRow, key) == batch.document_id,
                )
            )
            if fragments:
                self.session.execute(
                    insert(FragmentVectorRow),
                    [
                        dict(
                            space_id=space.id,
                            dimensions=space.dimensions,
                            **{key: batch.document_id},
                            source_hash=batch.source_hash,
                            index=f.index,
                            embedding=f.values,
                        )
                        for f in fragments
                    ],
                )
        return fragments

    def get_fragments(
        self,
        space: VectorSpace,
        *,
        kind: Literal["resume", "jd"],
        document_id: str,
        source_hash: str,
    ) -> list[FragmentVector] | None:
        """Read one snapshot; mismatched hash is a miss, corrupt sets are rejected."""
        request = FragmentSetWrite(
            space=space, kind=kind, document_id=document_id, source_hash=source_hash, fragments=[]
        )
        if self.space(request.space.id) != request.space:
            raise ValueError("vector space specification mismatch")
        key = FragmentVectorRow.resume_id if kind == "resume" else FragmentVectorRow.jd_id
        rows = self.session.execute(
            select(
                FragmentVectorRow.space_id,
                key,
                FragmentVectorRow.source_hash,
                FragmentVectorRow.index,
                FragmentVectorRow.embedding,
            )
            .where(FragmentVectorRow.space_id == space.id, key == document_id)
            .order_by(FragmentVectorRow.index)
        ).all()
        if not rows:
            return None
        # Validate the whole set before returning anything (never filter individual hashes).
        if len({row[2] for row in rows}) != 1:
            raise ValueError("inconsistent fragment hashes")
        if rows[0][2] != source_hash:
            return None
        result = []
        for index, row in enumerate(rows):
            if row[3] != index:
                raise ValueError("non-contiguous fragment indices")
            result.append(
                FragmentVector(
                    space_id=row[0],
                    kind=kind,
                    document_id=row[1],
                    source_hash=row[2],
                    index=row[3],
                    values=self._values(space, row[4]),
                )
            )
        return result

    def nearest(
        self,
        space_id: str,
        values: list[float],
        *,
        kind: Literal["resume", "jd"],
        limit: int = 10,
        approximate: bool = False,
    ) -> list[VectorHit]:
        if kind not in {"resume", "jd"} or type(limit) is not int or not 1 <= limit <= 100:
            raise ValueError("invalid kind or limit")
        space = self.space(space_id)
        values = self._values(space, values)
        column = VectorRow.resume_id if kind == "resume" else VectorRow.jd_id
        source_hash = VectorRow.source_hash
        embedding = VectorRow.embedding
        predicates = [VectorRow.space_id == space.id, column.is_not(None)]
        if not approximate:
            # An explicit materialization keeps default exact recall even after ANN indexing.
            candidates = (
                select(column.label("document_id"), source_hash, embedding)
                .where(*predicates)
                .cte("candidates")
                .prefix_with("MATERIALIZED")
            )
            column, source_hash, embedding = (
                candidates.c.document_id,
                candidates.c.source_hash,
                candidates.c.embedding,
            )
            predicates = []
        vector = cast(embedding, Vector(space.dimensions))
        distances = {
            "cosine": vector.cosine_distance,
            "l2": vector.l2_distance,
            "inner_product": vector.max_inner_product,
        }
        distance = distances[space.metric](values)
        rows = self.session.execute(
            select(column, source_hash, distance.label("distance"))
            .where(*predicates)
            .order_by(distance)
            .limit(limit)
        )
        return [VectorHit(document_id=r[0], source_hash=r[1], distance=r[2]) for r in rows]

    def ensure_hnsw_index(self, space_id: str) -> str:
        """Explicit administrative step; ANN recall must be evaluated by D."""
        space = self.space(space_id)
        if space.dimensions > 2000:
            raise ValueError(
                "vector HNSW supports at most 2000 dimensions; exact search remains available"
            )
        name = "ix_vector_hnsw_" + hashlib.sha256(space.id.encode()).hexdigest()[:24]
        operator = {
            "cosine": "vector_cosine_ops",
            "l2": "vector_l2_ops",
            "inner_product": "vector_ip_ops",
        }[space.metric]
        # Identifier is generated; space id is validated and dimensions/ops are bounded above.
        self.session.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS {name} ON document_vectors USING hnsw "
                f"((embedding::vector({space.dimensions})) {operator}) WHERE space_id = '{space.id}'"
            )
        )
        return name
