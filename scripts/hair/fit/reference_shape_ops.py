"""Non-destructive authoring math for matching existing hair cards to a visual reference.

Does NOT infer root identity or compute a fit from a photo. All coordinates
must share verified import units; targets and root directions require manual
approval. No FBX, UV, materials or source mesh gets edited here.
"""
from __future__ import annotations
import numpy as np


def trim_lower_tips(points, *, up_axis=1, knee, transition, fraction):
    """Smoothly shorten only lengths BELOW knee; preserve crown/root vertices."""
    p = np.asarray(points, dtype=float)
    if p.ndim != 2 or p.shape[1] != 3 or not np.isfinite(p).all():
        raise ValueError("Expected finite Nx3 points")
    if up_axis not in (0, 1, 2) or not np.isfinite(knee) or not np.isfinite(transition) or transition <= 0:
        raise ValueError("Invalid axis, knee or transition")
    if not np.isfinite(fraction) or not 0 <= fraction <= .35:
        raise ValueError("Conservative preview fraction must be within [0,.35]")
    result = p.copy()
    below = np.maximum(0, knee - result[:, up_axis])
    t = np.clip(below / transition, 0, 1)
    fade = t*t*(3-2*t)
    result[:, up_axis] += fraction * below * fade
    return result


def rotate_card_about_root(points, current_root, target_root, *, head_origin_xz):
    """Rotate a reviewed card rigidly about Y and relocate to an approved root.

    Relative distances, curl volume and all card tips are preserved.
    Assumes Y-up source frame; caller must convert Blender/FBX units/axes.
    """
    p = np.asarray(points, dtype=float)
    current = np.asarray(current_root, dtype=float)
    target = np.asarray(target_root, dtype=float)
    center = np.asarray(head_origin_xz, dtype=float)
    if p.ndim != 2 or p.shape[1] != 3 or current.shape != (3,) or target.shape != (3,) or center.shape != (2,):
        raise ValueError("Expected Nx3 card, XYZ root points and XZ head center")
    if not all(np.isfinite(arr).all() for arr in (p, current, target, center)):
        raise ValueError("Nonfinite reference geometry")
    sx, sz = current[0] - center[0], current[2] - center[1]
    tx, tz = target[0] - center[0], target[2] - center[1]
    if min(np.hypot(sx, sz), np.hypot(tx, tz)) < 1e-5:
        raise ValueError("Cannot infer radial direction at head center")
    theta = np.arctan2(tx, tz) - np.arctan2(sx, sz)
    cs, sn = np.cos(theta), np.sin(theta)
    delta = p - current
    return np.stack((cs*delta[:, 0] + sn*delta[:, 2],
                     delta[:, 1],
                     -sn*delta[:, 0] + cs*delta[:, 2]), axis=1) + target


def root_clearance_shift(points, weights, normal, signed_clearance, *,
                         desired_clearance, max_displacement):
    """Conform an AUTHOR-APPROVED root to a real triangle normal, not a fake cap.

    Zero-weight tips remain identical. This helper requires reliable,
    independently verified actual scalp signed-clearance measurements.
    It refuses an oversized lift rather than silently applying it.
    """
    p = np.asarray(points, dtype=float)
    w = np.asarray(weights, dtype=float)
    n = np.asarray(normal, dtype=float)
    if p.ndim != 2 or p.shape[1] != 3 or w.shape != (len(p),) or n.shape != (3,):
        raise ValueError("Shape mismatch")
    if not all(np.isfinite(arr).all() for arr in (p, w, n)):
        raise ValueError("Nonfinite point, weight or normal")
    if not all(np.isfinite(v) for v in (signed_clearance, desired_clearance, max_displacement)):
        raise ValueError("Nonfinite clearance")
    if np.any((w < 0) | (w > 1)) or np.linalg.norm(n) < 1e-8:
        raise ValueError("Invalid normal or unapproved root weights")
    if desired_clearance < 0 or max_displacement <= 0:
        raise ValueError("Invalid safety limit")
    move = max(0, float(desired_clearance - signed_clearance))
    if move > max_displacement:
        raise ValueError("Root clearance exceeds the approved maximum")
    return p + w[:, None] * (n / np.linalg.norm(n))[None, :] * move
