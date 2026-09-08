"""Request-local cache scorer using only A's public vector repository."""

from backend.core.vectors import FragmentSetWrite

from .embedding import DIMENSION, encode_batches, score_vectors, unit
from .vector_plan import source_hash, vector_space


def cached_comparator(vectors, resume, jd, events, *, space=None):
    specification = space or vector_space()

    def compare(provider, requirements, evidence):
        if specification.metric != "cosine" or specification.dimensions != DIMENSION:
            raise ValueError("incompatible pair scoring space")
        expected_model = specification.model.rsplit("|", 1)[0]
        if provider.model != expected_model or provider.dimension != specification.dimensions:
            raise ValueError("provider identity mismatch")
        if vectors.register_space(specification) != specification:
            raise ValueError("registered space mismatch")

        def document(kind, identifier, texts):
            digest = source_hash(texts)
            cached = vectors.get_fragments(
                specification, kind=kind, document_id=identifier, source_hash=digest
            )
            if cached is None:
                generated = encode_batches(provider, texts)
                cached = vectors.replace_fragments(
                    FragmentSetWrite(
                        space=specification,
                        kind=kind,
                        document_id=identifier,
                        source_hash=digest,
                        fragments=generated,
                    )
                )
                events.append(f"{kind}:miss")
            else:
                events.append(f"{kind}:hit")
            if len(cached) != len(texts):
                raise ValueError("fragment count mismatch")
            for index, fragment in enumerate(cached):
                if (
                    fragment.space_id,
                    fragment.kind,
                    fragment.document_id,
                    fragment.source_hash,
                    fragment.index,
                ) != (specification.id, kind, identifier, digest, index):
                    raise ValueError("fragment identity mismatch")
            return [unit(fragment.values, DIMENSION) for fragment in cached]

        # Public lock ordering: Resume first, then JD. Never hold repository after this call.
        resume_values = document("resume", resume.id, evidence)
        jd_values = document("jd", jd.id, requirements)
        return score_vectors(requirements, evidence, jd_values + resume_values)

    return compare
