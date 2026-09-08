"""Optional local embedding; no downloads, remote calls or database access at runtime."""

import math
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
REVISION = "e8f8c211226b894fcb81acc59f3b34ba3efd5f42"
DIMENSION = 384


class EmbeddingProvider(Protocol):
    model: str
    dimension: int

    def encode(self, texts: list[str]) -> list[list[float]]: ...


class LocalMiniLM:
    model = f"{MODEL}@{REVISION}"
    dimension = DIMENSION

    def encode(self, texts: list[str]) -> list[list[float]]:
        model = local_model()
        lengths = model.tokenizer(texts, truncation=False)["input_ids"]
        if any(len(tokens) > 128 for tokens in lengths):
            raise ValueError("token budget")
        return model.encode(texts, batch_size=16, normalize_embeddings=True).tolist()


@lru_cache(maxsize=1)
def local_model():
    # Optional environment owned by A; root dependencies remain unchanged.
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL, revision=REVISION, local_files_only=True, device="cpu")


def chunks(texts: list[str]) -> list[str]:
    """NFKC + collapsed whitespace; sentence boundaries, then 80-character windows."""
    result = []
    for text in texts:
        for sentence in re.split(r"[。！？!?；;\n]+", unicodedata.normalize("NFKC", text)):
            sentence = " ".join(sentence.split()).strip()
            for offset in range(0, len(sentence), 80):
                value = sentence[offset : offset + 80]
                if value and value not in result:
                    result.append(value)
    if len(result) > 32:
        raise ValueError("segment budget")
    return result


def unit(vector: list[float], dimension: int) -> list[float]:
    if len(vector) != dimension or not all(
        isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in vector
    ):
        raise ValueError("invalid embedding")
    norm = math.hypot(*vector)
    if not math.isfinite(norm) or norm < 1e-12:
        raise ValueError("zero embedding")
    return [x / norm for x in vector]


@dataclass(frozen=True)
class SemanticEvidence:
    requirement: str
    evidence: str
    cosine: float


def compare(provider: EmbeddingProvider, requirements: list[str], evidence: list[str]):
    if not requirements or not evidence:
        raise ValueError("empty semantic input")
    texts = requirements + evidence
    vectors = provider.encode(texts)
    if len(vectors) != len(texts) or provider.dimension != DIMENSION:
        raise ValueError("incompatible embedding batch")
    vectors = [unit(v, DIMENSION) for v in vectors]
    pairs = []
    for requirement, query in zip(requirements, vectors[: len(requirements)], strict=True):
        scores = [
            sum(a * b for a, b in zip(query, v, strict=True)) for v in vectors[len(requirements) :]
        ]
        best = max(range(len(scores)), key=scores.__getitem__)
        pairs.append(
            SemanticEvidence(requirement, evidence[best], max(-1.0, min(1.0, scores[best])))
        )
    score = 100 * sum(max(0.0, pair.cosine) for pair in pairs) / len(pairs)
    return score, tuple(pairs)
