"""Exact nearest TRIANGLE surface checks for manually approved hair root candidates.

Does not infer curl roots, determine physical inside/outside of an open scalp,
move vertices, project UVs, or judge visible alpha coverage. It only measures
nearest source scalp triangles and local oriented-normal offsets. Caller must
use a single verified frame and known meters_per_unit.

Private mesh-derived inputs/outputs are NOT for a public repository.
Requires numpy and scipy for the deterministic centroid bounding-sphere search.
"""
from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree


def _validate(points, vertices, faces):
    p = np.asarray(points, dtype=np.float64)
    v = np.asarray(vertices, dtype=np.float64)
    f = np.asarray(faces)
    if p.ndim != 2 or p.shape[1] != 3 or v.ndim != 2 or v.shape[1] != 3:
        raise ValueError("Expected Nx3 points and Mx3 scalp vertices")
    if not len(p) or not len(v) or f.ndim != 2 or f.shape[1] != 3 or not len(f):
        raise ValueError("Need points, scalp vertices and triangle faces")
    if not np.isfinite(p).all() or not np.isfinite(v).all():
        raise ValueError("Nonfinite coordinates")
    if not np.issubdtype(f.dtype, np.integer):
        raise ValueError("Triangle indices must be integers")
    if np.min(f) < 0 or np.max(f) >= len(v):
        raise ValueError("Triangle indices outside the scalp mesh")
    tri = v[f]
    normals = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    lengths = np.linalg.norm(normals, axis=1)
    if np.any(lengths < 1e-12):
        raise ValueError("Degenerate scalp triangle; clean source selection")
    return p, tri, normals / lengths[:, None]


def _closest_on_triangles(point, triangles, normals):
    """Closest point on each nondegenerate triangle; includes edges/corners."""
    a, b, c = triangles[:, 0], triangles[:, 1], triangles[:, 2]
    # Plane projection; when projection is outside the triangle, an edge wins.
    projected = point - normals * np.einsum('ij,ij->i', point - a, normals)[:, None]
    ab, ac, ap = b - a, c - a, projected - a
    d00 = np.einsum('ij,ij->i', ab, ab)
    d01 = np.einsum('ij,ij->i', ab, ac)
    d11 = np.einsum('ij,ij->i', ac, ac)
    d20 = np.einsum('ij,ij->i', ap, ab)
    d21 = np.einsum('ij,ij->i', ap, ac)
    denom = d00 * d11 - d01 * d01
    if np.any(denom <= 1e-20):
        raise ValueError("Numerically degenerate triangle")
    vb = (d11 * d20 - d01 * d21) / denom
    wc = (d00 * d21 - d01 * d20) / denom
    inside = (vb >= 0) & (wc >= 0) & (vb + wc <= 1)
    options = []
    for start, end in ((a, b), (b, c), (c, a)):
        segment = end - start
        t = np.clip(np.einsum('ij,ij->i', point - start, segment) /
                    np.einsum('ij,ij->i', segment, segment), 0, 1)
        options.append(start + t[:, None] * segment)
    edges = np.stack(options, axis=1)
    edge_d2 = np.sum((edges - point) ** 2, axis=2)
    edge_best = edges[np.arange(len(triangles)), np.argmin(edge_d2, axis=1)]
    nearest = np.where(inside[:, None], projected, edge_best)
    dist2 = np.sum((nearest - point) ** 2, axis=1)
    return nearest, dist2


def measure_nearest_surface(points, scalp_vertices, scalp_triangles, *,
                            meters_per_unit, candidate_k=12):
    """Provably exact nearest triangle using a conservative sphere bound.

    Nearest K centroids seed an upper-bound distance. A global maximum triangle
    radius bounds every possible closer triangle's centroid; querying all
    centroids within (best distance + max radius) guarantees candidates cannot
    omit a closer triangle. Results are world-space and physical millimeters.
    Signed normal offset is local surface orientation ONLY, not watertight
    mesh inside/outside. Triangles must be oriented consistently outward.
    """
    if not np.isfinite(meters_per_unit) or meters_per_unit <= 0:
        raise ValueError("Verify meters_per_unit, including FBX import conversion")
    if candidate_k < 1:
        raise ValueError("candidate_k must be positive")
    pts, tri, norms = _validate(points, scalp_vertices, scalp_triangles)
    centroids = tri.mean(axis=1)
    radii = np.linalg.norm(tri - centroids[:, None, :], axis=2).max(axis=1)
    maximum_radius = float(radii.max())
    tree = cKDTree(centroids)
    output = []
    for point in pts:
        _, first = tree.query(point, k=min(candidate_k, len(tri)))
        first = np.atleast_1d(first).astype(int)
        _, d2 = _closest_on_triangles(point, tri[first], norms[first])
        upper_bound = float(np.sqrt(d2.min()))
        # Any triangle that might improve this upper bound has a centroid
        # within best_distance + its bounding radius <= upper+max_radius.
        ids = np.asarray(tree.query_ball_point(point, upper_bound + maximum_radius + 1e-9), dtype=int)
        nearest, dist2 = _closest_on_triangles(point, tri[ids], norms[ids])
        best = int(np.argmin(dist2))
        triangle_id = int(ids[best])
        closest = nearest[best]
        oriented = norms[triangle_id]
        unsigned_mm = float(np.sqrt(dist2[best]) * meters_per_unit * 1000)
        signed_mm = float(np.dot(point - closest, oriented) * meters_per_unit * 1000)
        output.append({"triangle_index": triangle_id,
                       "closest_xyz": closest.tolist(),
                       "normal_xyz": oriented.tolist(),
                       "distance_mm": unsigned_mm,
                       "local_normal_offset_mm": signed_mm,
                       "triangles_tested": len(ids)})
    return output


def summarize_contact(rows, *, max_root_gap_mm=10., min_root_offset_mm=-1.5):
    """Report candidate root gaps/possible penetration; no automatic approval."""
    if not rows or max_root_gap_mm <= 0 or min_root_offset_mm >= 0:
        raise ValueError("Provide rows and sensible positive/negative tolerances")
    distances = np.asarray([r['distance_mm'] for r in rows], dtype=float)
    signed = np.asarray([r['local_normal_offset_mm'] for r in rows], dtype=float)
    if not np.isfinite(distances).all() or not np.isfinite(signed).all():
        raise ValueError("Nonfinite contact samples")
    return {"samples": len(rows), "median_distance_mm": float(np.median(distances)),
            "p95_distance_mm": float(np.quantile(distances, .95)),
            "candidates_over_gap_limit": int(np.sum(distances > max_root_gap_mm)),
            "possible_surface_penetrations": int(np.sum(signed < min_root_offset_mm)),
            "status": "CANDIDATE_CONTACT_ONLY_NOT_VISUAL_COVERAGE",
            "warning": "Local signed normal distance is not a watertight inside/outside test; validate alpha, part lines and multi-view coverage separately."}
