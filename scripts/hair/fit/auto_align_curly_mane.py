"""Blender prototype: align whole Curly Mane to Vesper's actual textured scalp.

Requires ORIGINAL Face4 with Face_BaseColor and an artist-approved
AV_ScalpRegion, and correctly imported donor axes/units. No per-root
deformation occurs. Default is read-only; --write requires a NEW .blend.
Never export to the live game from this script.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fit_math import islands_from_edges
from coarse_scalp_alignment import candidate_anchors, estimate_coarse_alignment


def parse_args():
    args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--head", default="Face4")
    p.add_argument("--hair", default="Curly_Mane")
    p.add_argument("--scalp-group", default="AV_ScalpRegion")
    p.add_argument("--up", required=True, help="Verified WORLD up direction, e.g. 0,0,1")
    p.add_argument("--meters-per-unit", required=True, type=float)
    p.add_argument("--report", required=True, type=Path)
    p.add_argument("--write", action="store_true")
    p.add_argument("--output-blend", type=Path)
    return p.parse_args(args)


def ensure_original_skin(head):
    for material in head.data.materials:
        if material and material.use_nodes:
            for node in material.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    filename = Path(bpy.path.abspath(node.image.filepath)).name
                    if filename == "T_Villager_Lady_Face_BaseColor.tga":
                        return
    raise ValueError("Original Face BaseColor is not mapped; do not fit using a synthetic cap")


def approved_scalp_points(head, group_name):
    group = head.vertex_groups.get(group_name)
    if group is None:
        raise ValueError("Approve AV_ScalpRegion on Face4 before alignment")
    points = []
    for vertex in head.data.vertices:
        try:
            if group.weight(vertex.index) >= .5:
                points.append(tuple(head.matrix_world @ vertex.co))
        except RuntimeError:
            pass
    if len(points) < 32:
        raise ValueError("Not enough approved real scalp points; refusing alignment")
    return np.asarray(points, dtype=float)


def donor_geometry(obj):
    pts = np.asarray([tuple(obj.matrix_world @ v.co) for v in obj.data.vertices], dtype=float)
    if not obj.data.uv_layers:
        raise ValueError("Donor hair source has no UV layer")
    layer = obj.data.uv_layers.active or obj.data.uv_layers[0]
    uv = np.zeros((len(pts), 2), dtype=float)
    count = np.zeros(len(pts), dtype=float)
    for loop in obj.data.loops:
        vertex = loop.vertex_index
        uv[vertex] += np.asarray(layer.data[loop.index].uv)
        count[vertex] += 1
    if np.any(count == 0):
        raise ValueError("Unmapped donor vertices; inspect hair source UVs")
    uv /= count[:, None]
    islands = islands_from_edges(len(pts), [tuple(edge.vertices) for edge in obj.data.edges])
    return pts, uv, islands


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    a = parse_args()
    scene = Path(bpy.data.filepath)
    if not scene.is_file():
        raise ValueError("Open a saved PRIVATE original-Vesper + Curly Mane .blend scene")
    if not math.isfinite(a.meters_per_unit) or a.meters_per_unit <= 0:
        raise ValueError("Confirm meters per Blender WORLD unit first")
    output = None
    if a.write:
        if not a.output_blend:
            raise ValueError("--write requires --output-blend")
        output = a.output_blend.resolve()
        if output == scene.resolve() or output.exists() or output.suffix.lower() != ".blend":
            raise ValueError("Output must be a NEW .blend distinct from source")
    head = bpy.data.objects.get(a.head)
    donor = bpy.data.objects.get(a.hair)
    if not head or head.type != "MESH" or not donor or donor.type != "MESH":
        raise ValueError("Missing original Face4 or Curly_Mane mesh")
    ensure_original_skin(head)
    scalp = approved_scalp_points(head, a.scalp_group)
    pts, uv, islands = donor_geometry(donor)
    up = tuple(float(value) for value in a.up.split(","))
    # Vesper-specific dimensional sanity check catches common cm/m mistakes.
    head_world = np.asarray([tuple(head.matrix_world @ v.co) for v in head.data.vertices])
    measured_m = np.ptp(head_world, axis=0) * a.meters_per_unit
    if min(measured_m) < .10 or max(measured_m) > .40:
        raise ValueError("Vesper head bounds implausible; check imported units")
    roots, records = candidate_anchors(pts, uv, islands, up,
                                        min_vertical_span=.07/a.meters_per_unit)
    alignment = estimate_coarse_alignment(roots, scalp, up,
                                          meters_per_unit=a.meters_per_unit)
    ratio = sum(record.get("higher_uv_end") == 1 for record in records
                if record["status"] == "CANDIDATE_ONLY") / len(roots)
    report = {
        "kind": "Vesper-CurlyMane-GLOBAL-ALIGNMENT-ONLY",
        "status": "UNAPPROVED_PREVIEW_ONLY",
        "source_blend": str(scene.resolve()),
        "source_sha256": sha256(scene),
        "source_head": head.name,
        "source_hair": donor.name,
        "original_face_basecolor_verified": True,
        "scalp_group": a.scalp_group,
        "world_up": list(up),
        "meters_per_unit": a.meters_per_unit,
        "total_curl_islands": len(islands),
        "high_uv_end_1_fraction": ratio,
        "candidate_records": records,
        "global_alignment": alignment,
        "individual_root_deformation": False,
        "game_glb_exported": False,
        "original_source_files_modified": False,
        "visual_review_required": ["front hairline", "crown", "back/nape",
                                   "face clearance", "donor Curls opacity",
                                   "head animation", "phone rendering"]
    }
    if a.write:
        if bpy.data.objects.get("AVFIT_CurlyMane_GLOBAL_PREVIEW"):
            raise ValueError("Fit already present; use the original scene as input")
        fitted = donor.copy()
        fitted.data = donor.data.copy()
        fitted.name = "AVFIT_CurlyMane_GLOBAL_PREVIEW"
        bpy.context.scene.collection.objects.link(fitted)
        scale = alignment["scale"]
        pivot = Vector(alignment["pivot"])
        displacement = Vector(alignment["displacement_xyz_world"])
        transform = Matrix.Diagonal((scale, scale, scale, 1.))
        transform.translation = pivot*(1.-scale) + displacement
        fitted.matrix_world = transform @ donor.matrix_world
        fitted["avensky_status"] = "GLOBAL_FIT_UNREVIEWED_NO_ROOT_EDITS"
        fitted["avensky_approved_for_release"] = False
        donor.hide_render = True
        donor.hide_set(True)
        output.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True)
        report["output_blend"] = str(output)
    a.report.parent.mkdir(parents=True, exist_ok=True)
    a.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("[Avensky Hair] Global alignment candidate only:", a.report, flush=True)


if __name__ == "__main__":
    main()
