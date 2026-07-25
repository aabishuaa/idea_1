import math

from app.services.faces import cosine_similarity


def test_cosine_identical_vectors() -> None:
    v = [0.1, 0.5, -0.3, 0.8]
    assert math.isclose(cosine_similarity(v, v), 1.0, abs_tol=1e-6)


def test_cosine_orthogonal_vectors() -> None:
    assert math.isclose(cosine_similarity([1, 0], [0, 1]), 0.0, abs_tol=1e-6)


def test_cosine_opposite_vectors() -> None:
    assert math.isclose(cosine_similarity([1, 2], [-1, -2]), -1.0, abs_tol=1e-6)


def test_cosine_zero_vector_is_zero_not_nan() -> None:
    assert cosine_similarity([0, 0], [1, 2]) == 0.0
