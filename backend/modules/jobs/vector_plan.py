"""Versioned inputs for the pending public fragment cache; no database bypass."""

import hashlib
import json

from backend.core.vectors import VectorSpace

from .embedding import DIMENSION, MODEL, REVISION
from .evidence_filter import PREPROCESSING_VERSION


def vector_space(*, revision=REVISION, preprocessing=PREPROCESSING_VERSION) -> VectorSpace:
    model = f"{MODEL}@{revision}|{preprocessing}"
    identity = f"{model}|cosine|{DIMENSION}"
    return VectorSpace(
        id="t5-clauses-" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:48],
        model=model,
        dimensions=DIMENSION,
        metric="cosine",
    )


def source_hash(texts: list[str]) -> str:
    """Hash exact ordered embedding inputs, AFTER filtering/chunking, not raw source.

    JSON preserves fragment boundaries and order. No further normalization occurs here.
    Model/preprocessing identity is carried separately by the immutable vector space.
    """
    if not texts or any(not isinstance(text, str) or not text.strip() for text in texts):
        raise ValueError("expected non-empty embedding fragments")
    payload = json.dumps(texts, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
