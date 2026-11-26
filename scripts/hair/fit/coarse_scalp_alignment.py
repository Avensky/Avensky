"""Source-independent FIRST-PASS hair registration, not a root fitter.

Use a verified common coordinate frame and artist-approved real scalp points.
For each long curl UV ribbon this module selects the higher longitudinal end
as a ROOT CANDIDATE. It never selects an end merely for being nearest the skull.
The resulting global transform preserves the curl mesh internally and requires
visual approval before any local root changes or GLB export.
"""
from __future__ import annotations
import numpy as np
from scipy.optimize import differential_evolution
from scipy.spatial import cKDTree


def unit(vector):
    v = np.asarray(vector, dtype=float)
    if v.shape != (3,) or not np.isfinite(v).all():
        raise ValueError("Expected finite XYZ up vector")
    size = np.linalg.norm(v)
    if size < 1e-9:
        raise ValueError("Head up vector must be nonzero")
    return v / size


def candidate_anchors(points, uv, islands, up, *, min_vertical_span,
                      min_uv_span=.025, band=.14):
    xyz = np.asarray(points, dtype=float)
    uv = np.asarray(uv, dtype=float)
    up = unit(up)
    if xyz.ndim != 2 or xyz.shape[1] != 3 or uv.shape != (len(xyz), 2):
        raise ValueError("Expected Nx3 hair points and Nx2 original UVs")
    if not np.isfinite(xyz).all() or not np.isfinite(uv).all():
        raise ValueError("Nonfinite hair geometry/UV")
    if not min_vertical_span > 0 or not 0 < min_uv_span < 1 or not 0 < band < .3:
        raise ValueError("Invalid root-candidate thresholds")
    anchors, records = [], []
    seen = set()
    for index, group in enumerate(islands):
        ids = np.asarray(group, dtype=int)
        if not len(ids):
            continue
        if (np.any(ids < 0) or np.any(ids >= len(xyz))
                or len(set(ids)) != len(ids)
                or any(int(v) in seen for v in ids)):
            raise ValueError("Invalid or overlapping curl island")
        seen.update(map(int, ids))
        v = uv[ids, 1]
        span = float(np.ptp(v))
        rec = {"island": index, "vertices": int(len(ids)), "status": "REVIEW"}
        if span <= min_uv_span:
            rec["reason"] = "UV V span too small"
            records.append(rec)
            continue
        normalized = (v - np.min(v)) / span
        low = xyz[ids[normalized <= band]]
        high = xyz[ids[normalized >= 1 - band]]
        if len(low) < 2 or len(high) < 2:
            rec["reason"] = "Too few vertices at one UV end"
            records.append(rec)
            continue
        lower_end = np.median(low, axis=0)
        upper_end = np.median(high, axis=0)
        delta = float((upper_end - lower_end) @ up)
        if abs(delta) < min_vertical_span:
            rec["reason"] = "Insufficient vertical curl length"
            records.append(rec)
            continue
        anchor = upper_end if delta > 0 else lower_end
        rec.update({"status": "CANDIDATE_ONLY",
                    "higher_uv_end": 1 if delta > 0 else 0,
                    "height_span": abs(delta),
                    "center_xyz": anchor.tolist()})
        anchors.append(anchor)
        records.append(rec)
    if len(anchors) < 12:
        raise ValueError("Too few eligible curl-end candidates")
    return np.asarray(anchors), records


def transform_points(xyz, pivot, scale, displacement):
    xyz = np.asarray(xyz, dtype=float)
    pivot = np.asarray(pivot, dtype=float)
    displacement = np.asarray(displacement, dtype=float)
    if xyz.ndim != 2 or xyz.shape[1] != 3 or pivot.shape != (3,) or displacement.shape != (3,):
        raise ValueError("Expected XYZ points, pivot and displacement")
    if not np.isfinite(xyz).all() or not np.isfinite(pivot).all() or not np.isfinite(displacement).all():
        raise ValueError("Nonfinite transform")
    if not np.isfinite(scale) or scale <= 0:
        raise ValueError("Scale must be positive")
    return (xyz - pivot) * scale + pivot + displacement


def estimate_coarse_alignment(anchors, scalp_points, up, *,
                              meters_per_unit, scale_range=(.92, 1.08),
                              max_lateral_m=.035, vertical_window_m=.09,
                              distance_clip_m=.05, seed=29, maxiter=80):
    roots = np.asarray(anchors, dtype=float)
    scalp = np.asarray(scalp_points, dtype=float)
    up = unit(up)
    if (roots.ndim != 2 or roots.shape[1] != 3 or len(roots) < 12
            or scalp.ndim != 2 or scalp.shape[1] != 3 or len(scalp) < 32):
        raise ValueError("Need >=12 root candidates and >=32 approved scalp points")
    if not np.isfinite(roots).all() or not np.isfinite(scalp).all():
        raise ValueError("Nonfinite anchor/scalp points")
    if not np.isfinite(meters_per_unit) or meters_per_unit <= 0:
        raise ValueError("Confirm meters-per-world-unit")
    if not (.5 <= scale_range[0] < 1 <= scale_range[1] <= 1.5):
        raise ValueError("Invalid narrow uniform-scale search bounds")
    if min(max_lateral_m, vertical_window_m, distance_clip_m) <= 0:
        raise ValueError("Metric limits must be positive")
    lateral = max_lateral_m / meters_per_unit
    vertical = vertical_window_m / meters_per_unit
    clip = distance_clip_m / meters_per_unit
    pivot = np.median(roots, axis=0)
    ref = np.array([1., 0., 0.]) if abs(up @ [1., 0., 0.]) < .9 else np.array([0., 0., 1.])
    right = unit(np.cross(ref, up))
    forward = np.cross(up, right)
    center_height_shift = float(np.quantile(scalp @ up, .85)
                                - np.quantile(roots @ up, .75))
    target_tree = cKDTree(scalp)

    def displacement(params):
        _, dx, dy, dz = params
        return dx * right + dy * up + dz * forward

    def objective(params):
        points = transform_points(roots, pivot, params[0], displacement(params))
        distances = target_tree.query(points)[0]
        score = np.mean(np.minimum(distances, clip)**2)
        score += 4 * clip**2 * (params[0] - 1)**2
        score += .04 * (params[1]**2 + params[3]**2)
        score += .006 * (params[2] - center_height_shift)**2
        return float(score)

    bounds = [(float(scale_range[0]), float(scale_range[1])),
              (-lateral, lateral),
              (center_height_shift - vertical, center_height_shift + vertical),
              (-lateral, lateral)]
    solution = differential_evolution(objective, bounds, seed=seed,
                                      popsize=10, maxiter=maxiter,
                                      tol=1e-6, polish=True)
    scale = float(solution.x[0])
    shift = displacement(solution.x)
    original_distances = target_tree.query(roots)[0]
    fitted_distances = target_tree.query(transform_points(roots, pivot, scale, shift))[0]
    clearance = .02 / meters_per_unit
    boundary_hit = (abs(scale - scale_range[0]) < .002
                    or abs(scale - scale_range[1]) < .002)
    return {
        "status": "CANDIDATE_REQUIRES_VISUAL_QA",
        "scale": scale,
        "pivot": pivot.tolist(),
        "displacement_xyz_world": shift.tolist(),
        "vertical_offset_local": float(solution.x[2]),
        "horizontal_offsets_local": [float(solution.x[1]), float(solution.x[3])],
        "bounds": {"scale": list(scale_range),
                   "horizontal_limit_m": max_lateral_m,
                   "vertical_window_m": vertical_window_m},
        "root_candidates": int(len(roots)),
        "target_scalp_samples": int(len(scalp)),
        "median_root_distance_before_m": float(np.median(original_distances) * meters_per_unit),
        "median_root_distance_after_m": float(np.median(fitted_distances) * meters_per_unit),
        "within_2cm_before": int((original_distances <= clearance).sum()),
        "within_2cm_after": int((fitted_distances <= clearance).sum()),
        "boundary_hit_warning": bool(boundary_hit),
        "source_geometry_modified": False,
        "note": "UV upper ends are candidates, not proven roots. Verify units, hairline, crown, ears and face occlusion before approval."
    }
