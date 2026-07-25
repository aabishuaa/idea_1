"""Face embedding + cosine matching (InsightFace / ArcFace).

This module handles gate 1 (ID face) and gate 3/4 (selfie match) of the
verification pipeline. It does NOT do liveness — liveness is proven on-device
(gate 2) and the two gates must stay separate (CLAUDE.md §5).

The engine loads lazily: if insightface/onnxruntime are unavailable (e.g. a
slim demo host), the API returns 503 face_engine_unavailable instead of
crashing the whole service.
"""

import io
import threading
from typing import Any

import numpy as np
from PIL import Image


class FaceEngineUnavailable(Exception):
    pass


class NoFaceDetected(Exception):
    pass


_lock = threading.Lock()
_engine: Any | None = None
_engine_error: str | None = None


def _get_engine() -> Any:
    global _engine, _engine_error
    with _lock:
        if _engine is not None:
            return _engine
        if _engine_error is not None:
            raise FaceEngineUnavailable(_engine_error)
        try:
            from insightface.app import FaceAnalysis

            engine = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
            engine.prepare(ctx_id=-1, det_size=(640, 640))
            _engine = engine
            return engine
        except Exception as exc:  # noqa: BLE001 — any import/model failure degrades to 503
            _engine_error = f"{exc.__class__.__name__}: {exc}"
            raise FaceEngineUnavailable(_engine_error) from exc


def engine_status() -> str:
    """'ready', 'unavailable', or 'cold' (not yet loaded)."""
    if _engine is not None:
        return "ready"
    if _engine_error is not None:
        return "unavailable"
    return "cold"


def _to_bgr(image_bytes: bytes) -> np.ndarray:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    # Downscale very large uploads to keep detection fast on free CPUs.
    image.thumbnail((1600, 1600))
    rgb = np.asarray(image)
    return rgb[:, :, ::-1].copy()  # RGB → BGR (cv2 convention used by insightface)


def extract_face_embedding(image_bytes: bytes) -> list[float]:
    """Detect the most prominent face and return its 512-dim ArcFace embedding."""
    engine = _get_engine()
    faces = engine.get(_to_bgr(image_bytes))
    if not faces:
        raise NoFaceDetected("no face detected in image")
    # Largest face wins — on an ID card that's the portrait, not the ghost image.
    def area(face: Any) -> float:
        x1, y1, x2, y2 = face.bbox
        return float((x2 - x1) * (y2 - y1))

    best = max(faces, key=area)
    embedding = np.asarray(best.normed_embedding, dtype=np.float32)
    return embedding.tolist()


def cosine_similarity(a: list[float], b: list[float]) -> float:
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    if denom == 0.0:
        return 0.0
    return float(np.dot(va, vb) / denom)
