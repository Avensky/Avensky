"""Non-destructive inventory for a vendor hairstyle inside a Vesper Blender scene.

Run with:
blender -b /private/vesper_neutral.blend --python scripts/hair/fit/inspect_source.py -- \\
  --source "/private/CURLY 01.FBX" \\
  --config scripts/hair/fit/styles/curly_mane.json \\
  --report /private/fit/inspection.json

This script imports a source asset INTO MEMORY but never saves a .blend or exports.
It intentionally cannot fit hair or infer scalp/roots automatically.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, type=Path)
    ap.add_argument("--config", required=True, type=Path)
    ap.add_argument("--report", required=True, type=Path)
    return ap.parse_args(argv)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def vertex_bounds(obj):
    # Source object-local units are unverified; do not label these as meters.
    points = [vertex.co[:] for vertex in obj.data.vertices]
    if not points:
        return None
    return {
        "min": [min(point[i] for point in points) for i in range(3)],
        "max": [max(point[i] for point in points) for i in range(3)],
    }


def describe_mesh(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    degenerate_faces = 0
    for triangle in mesh.loop_triangles:
        if triangle.area < 1e-12:
            degenerate_faces += 1
    uvsets = [
        {"name": uv.name, "loop_count": len(uv.data)}
        for uv in mesh.uv_layers
    ]
    return {
        "object": obj.name,
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "triangles": len(mesh.loop_triangles),
        "degenerate_triangles": degenerate_faces,
        "uv_sets": uvsets,
        "materials": [material.name if material else None for material in mesh.materials],
        "vertex_groups": [group.name for group in obj.vertex_groups],
        "armature": obj.find_armature().name if obj.find_armature() else None,
        "shape_keys": [
            key.name for key in mesh.shape_keys.key_blocks
        ] if mesh.shape_keys else [],
        "bounds_source_local": vertex_bounds(obj),
        "matrix_world": [[float(v) for v in row] for row in obj.matrix_world],
    }


def main():
    args = parse_args()
    if not args.source.is_file():
        raise FileNotFoundError(args.source)
    config = json.loads(args.config.read_text(encoding="utf-8"))
    source = args.source.resolve()
    current = set(bpy.data.objects.keys())
    warnings = []
    suffix = source.suffix.lower()
    if suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(source))
    elif suffix in (".gltf", ".glb"):
        bpy.ops.import_scene.gltf(filepath=str(source))
    else:
        raise ValueError("Only FBX, GLB and glTF are supported by the inspector")
    imported = [obj for obj in bpy.data.objects if obj.name not in current]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("No hair meshes in the imported source")
    if config.get("source_units") == "UNVERIFIED":
        warnings.append("Source units unverified; do not apply fit scaling")
    if config.get("source_up_axis") == "UNVERIFIED":
        warnings.append("Source axis convention unverified")
    if any(value is None for value in config.get("source_landmarks", {}).values()):
        warnings.append("Source landmark correspondences not yet annotated")
    report = {
        "schema_version": 1,
        "type": "hair-source-inspection-only",
        "source_file": str(source),
        "source_sha256": sha256(source),
        "style_id": config["style_id"],
        "scene_file": bpy.data.filepath,
        "scene_units": {
            "system": bpy.context.scene.unit_settings.system,
            "scale_length": bpy.context.scene.unit_settings.scale_length,
        },
        "objects": [
            {"name": obj.name, "type": obj.type} for obj in imported
        ],
        "meshes": [describe_mesh(obj) for obj in meshes],
        "warnings": warnings,
        "fitting_performed": False,
        "source_file_modified": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("[Avensky Hair Fit] Inspection only:", args.report)
    for warning in warnings:
        print("[Avensky Hair Fit] WARN:", warning)


if __name__ == "__main__":
    main()
