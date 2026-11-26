"""Summarize projected scalp visibility from linear Blender mask passes."""
import numpy as np


def measure_exposure(reference, visible):
    """Measure visible transmittance on the no-hair scalp footprint.

    Values are pixel-equivalents in this camera, not 3D surface area.
    A reference pixel may straddle a scalp boundary and have partial weight.
    """
    reference = np.asarray(reference, dtype=float)
    visible = np.asarray(visible, dtype=float)
    threshold = 0.5
    if (reference.ndim != 2 or reference.shape != visible.shape
            or not np.isfinite(reference).all() or not np.isfinite(visible).all()
            or np.any((reference < 0) | (reference > 1))
            or np.any((visible < 0) | (visible > 1))):
        raise ValueError("Expected matching finite 2D linear masks")
    total = float(reference.sum())
    residual = np.minimum(reference, visible)
    strong = (reference >= threshold) & (residual >= reference * threshold)
    return {
        "reference_pixel_equivalents": total,
        "visible_pixel_equivalents": float(residual.sum()),
        "visible_fraction": float(residual.sum() / total) if total else None,
        "pixels_at_least_half_visible": int(strong.sum()),
        "excess_pixel_equivalents": float(np.maximum(visible - reference, 0).sum()),
    }, residual
