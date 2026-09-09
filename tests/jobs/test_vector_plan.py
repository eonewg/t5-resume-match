import pytest

from backend.modules.jobs.vector_plan import source_hash, vector_space


def test_versioned_space_identity():
    space = vector_space()
    assert space == vector_space()
    assert space.dimensions == 384 and space.metric == "cosine"
    assert "t5-clauses-v2" in space.model
    assert vector_space(revision="changed").id != space.id
    assert vector_space(preprocessing="t5-clauses-v3").id != space.id


def test_exact_input_hash_preserves_boundaries_order_and_changes():
    assert source_hash(["中文", "Python"]) == source_hash(["中文", "Python"])
    assert len(source_hash(["中文"])) == 64
    assert (
        len({source_hash(value) for value in (["ab", "c"], ["a", "bc"], ["c", "ab"], ["ab ", "c"])})
        == 4
    )


@pytest.mark.parametrize("inputs", [[], [""], [" "], [None], [1]])
def test_hash_rejects_invalid_inputs(inputs):
    with pytest.raises(ValueError):
        source_hash(inputs)
