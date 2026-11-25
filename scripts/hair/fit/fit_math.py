"""Safe, unit-tested geometry helpers for root-only hairstyle fitting.

All input coordinates must share a confirmed unit (normally Blender world
units). This module computes transforms and NEW vertex arrays only.
"""
from __future__ import annotations
import numpy as np


def similarity_transform(source, target, *, max_rms=None):
    """Proper-rotation + uniform-scale landmark fit; reflections forbidden."""
    src = np.asarray(source, dtype=np.float64)
    dst = np.asarray(target, dtype=np.float64)
    if src.shape != dst.shape or src.ndim != 2 or src.shape[1] != 3 or len(src) < 3:
        raise ValueError("Need at least three XYZ source/target landmark pairs")
    if not np.isfinite(src).all() or not np.isfinite(dst).all():
        raise ValueError("Landmarks contain nonfinite coordinates")
    a, b = src - src.mean(axis=0), dst - dst.mean(axis=0)
    if np.linalg.matrix_rank(a, tol=1e-9) < 2 or np.linalg.matrix_rank(b, tol=1e-9) < 2:
        raise ValueError("Landmark geometry is degenerate; use non-collinear points")
    u, sig, vt = np.linalg.svd(a.T @ b)
    parity = np.linalg.det(vt.T @ u.T)
    guard = np.diag([1., 1., 1. if parity >= 0 else -1.])
    rot = vt.T @ guard @ u.T
    scale = np.trace(np.diag(sig) @ guard) / float(np.sum(a*a))
    if not np.isfinite(scale) or scale <= 0:
        raise ValueError("Invalid similarity scale")
    offset = dst.mean(axis=0) - scale * rot @ src.mean(axis=0)
    residual = np.linalg.norm((scale * (rot @ src.T)).T + offset - dst, axis=1)
    rms = float(np.sqrt(np.mean(residual ** 2)))
    if max_rms is not None and rms > max_rms:
        raise ValueError(f"Landmark fit RMS {rms:.5g} exceeds {max_rms:.5g}")
    transform = np.eye(4, dtype=np.float64)
    transform[:3, :3] = scale * rot
    transform[:3, 3] = offset
    return transform, {"rms": rms, "max_residual": float(max(residual)),
                       "scale": float(scale), "reflected": False,
                       "landmarks": int(len(src))}


def islands_from_edges(num_vertices, edges):
    """Return connected clumps, including isolated vertices."""
    if num_vertices <= 0:
        raise ValueError("Cannot fit empty hair geometry")
    roots = list(range(num_vertices))
    def find(i):
        while roots[i] != i:
            roots[i] = roots[roots[i]]
            i = roots[i]
        return i
    for i, j in edges:
        if min(i, j) < 0 or max(i, j) >= num_vertices:
            raise ValueError("Invalid vertex index in hair edges")
        a, b = find(int(i)), find(int(j))
        roots[a] = b
    groups = {}
    for i in range(num_vertices):
        groups.setdefault(find(i), []).append(i)
    return list(groups.values())


def translate_root_islands(points, weights, islands, project, *,
                           max_root_move, min_root_weight=0.75,
                           max_projection_distance=None):
    """Move approved root-weighted vertices by a single shift per connected curl.

    Unmarked vertices and untouched tips keep their exact positions; no
    whole-hairstyle shrinkwrap, no UV/topology/material changes.
    """
    xyz = np.asarray(points, dtype=np.float64)
    weight = np.asarray(weights, dtype=np.float64)
    if xyz.ndim != 2 or xyz.shape[1] != 3 or weight.shape != (len(xyz),):
        raise ValueError("Expected Nx3 points and matching root weights")
    if not np.isfinite(xyz).all() or not np.isfinite(weight).all():
        raise ValueError("Nonfinite geometry/root weights")
    if np.any(weight < 0) or np.any(weight > 1) or max_root_move <= 0:
        raise ValueError("Out-of-range root weights or max_root_move")
    new = xyz.copy()
    receipts = []
    marked = 0
    for index, island in enumerate(islands):
        ids = np.asarray(island, dtype=int)
        if not len(ids):
            continue
        if len(np.unique(ids)) != len(ids) or np.any(ids < 0) or np.any(ids >= len(xyz)):
            raise ValueError("Invalid island indices")
        candidates = ids[weight[ids] >= min_root_weight]
        if not len(candidates):
            receipts.append({"island":index,"status":"UNMARKED","size":len(ids)})
            continue
        marked += 1
        shifts = []
        for vi in candidates:
            point = project(xyz[vi])
            if point is None:
                continue
            point = np.asarray(point, dtype=np.float64)
            if point.shape != (3,) or not np.isfinite(point).all():
                raise ValueError("Invalid projected scalp coordinate")
            shift = point - xyz[vi]
            if max_projection_distance is None or np.linalg.norm(shift) <= max_projection_distance:
                shifts.append(shift)
        if not shifts:
            receipts.append({"island":index,"status":"NO_SAFE_TARGET","size":len(ids)})
            continue
        delta = np.median(np.asarray(shifts), axis=0)
        magnitude = float(np.linalg.norm(delta))
        if magnitude > max_root_move:
            receipts.append({"island":index,"status":"EXCESSIVE_ROOT_SHIFT",
                             "size":len(ids),"meters":magnitude})
            continue
        new[ids] = xyz[ids] + weight[ids,None] * delta[None,:]
        receipts.append({"island":index,"status":"FITTED","size":len(ids),
                         "roots":len(candidates),"meters":magnitude})
    if not marked:
        raise ValueError("No approved roots found. Paint AV_RootWeight first.")
    if not any(r["status"] == "FITTED" for r in receipts):
        raise ValueError("None of the marked roots had a safe scalp projection")
    return new, receipts
