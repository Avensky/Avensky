"""Extract a scalp foundation from the REAL Face4 head, not a sphere.

Author a single vertex group named AV_ScalpRegion on the original neutral
Face4 head in a PRIVATE Blender scene (include crown, sides and nape, exclude
face/ears). Run this script in background. Default is REPORT ONLY.

Blender 5.2:
 blender -b /private/vesper-head-guides.blend --python scripts/hair/fit/extract_source_scalp.py -- \
   --head-object Face4 --region-group AV_ScalpRegion --face-material Face \
   --meters-per-world-unit 1 --report /private/scalp/inspect.json

Only after visual approval of the painted region add:
 --write --output-blend /private/scalp/vesper-source-scalp-v2.blend

This script does NOT create hairstyle volume, fit curly roots, export GLB, or
overwrite the source. It retains the source head's existing rig / weights.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source-fbx", type=Path, help="Optional original Face4 FBX instead of an opened .blend")
    ap.add_argument("--head-object", default="Face4")
    ap.add_argument("--region-group", default="AV_ScalpRegion")
    ap.add_argument("--face-material", default="Face")
    ap.add_argument("--min-weight", type=float, default=0.5)
    ap.add_argument("--meters-per-world-unit", type=float, required=True)
    ap.add_argument("--offset-mm", type=float, default=1.0)
    ap.add_argument("--root-color", default="#38271f")
    ap.add_argument("--report", type=Path, required=True)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--output-blend", type=Path)
    return ap.parse_args(argv)


def hash_file(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def source_head(args):
    if args.source_fbx:
        path = args.source_fbx.resolve()
        if not path.is_file() or path.suffix.lower() != ".fbx":
            raise ValueError("--source-fbx must be a real binary or ASCII FBX")
        bpy.ops.import_scene.fbx(filepath=str(path))
        return path
    source = Path(bpy.data.filepath)
    if not source.is_file():
        raise ValueError("Open a saved PRIVATE .blend or specify --source-fbx")
    return source


def find_head(name):
    mesh = bpy.data.objects.get(name)
    if mesh and mesh.type == "MESH":
        return mesh
    candidates = [o for o in bpy.data.objects if o.type == "MESH"
                  and (o.name == name or o.name.endswith(":" + name))]
    if len(candidates) != 1:
        raise ValueError(f"Expected exactly one source head mesh '{name}', found {len(candidates)}; inspect source object names")
    return candidates[0]


def color_rgb(hexvalue):
    if len(hexvalue) != 7 or not hexvalue.startswith("#"):
        raise ValueError("root-color must be #RRGGBB")
    try:
        srgb = [int(hexvalue[i:i+2], 16)/255.0 for i in (1, 3, 5)]
    except ValueError as exc:
        raise ValueError("Invalid root-color") from exc
    # Blender BSDF inputs store linear values; convert from sRGB.
    return tuple(v / 12.92 if v <= .04045 else ((v + .055)/1.055)**2.4 for v in srgb)


def marked_faces(head, groupname, face_material, min_weight):
    group = head.vertex_groups.get(groupname)
    if group is None:
        raise ValueError(f"Missing manually approved vertex group '{groupname}' on {head.name}")
    materials = [mat.name if mat else "" for mat in head.data.materials]
    allowed = [i for i, name in enumerate(materials) if name == face_material or name.startswith(face_material + ".")]
    if not allowed:
        raise ValueError(f"Face-only material {face_material!r} not found; found {materials}")
    def selected(vindex):
        try:
            return group.weight(vindex) >= min_weight
        except RuntimeError:
            return False
    choice = [poly.index for poly in head.data.polygons
              if poly.material_index in allowed and all(selected(vi) for vi in poly.vertices)]
    if len(choice) < 32:
        raise ValueError(f"Only {len(choice)} source scalp triangles were selected; verify that the vertex group covers the full crown")
    return choice, materials, allowed


def region_bounds(head, selection):
    included = sorted({vi for fi in selection for vi in head.data.polygons[fi].vertices})
    positions = [head.matrix_world @ head.data.vertices[vi].co for vi in included]
    low = [min(float(p[i]) for p in positions) for i in range(3)]
    high = [max(float(p[i]) for p in positions) for i in range(3)]
    return included, low, high


def boundary_stats(head, selection):
    counter = collections.Counter()
    for fi in selection:
        poly = head.data.polygons[fi]
        for edge in poly.edge_keys:
            counter[tuple(sorted(edge))] += 1
    return sum(v == 1 for v in counter.values()), sum(v > 2 for v in counter.values())


def output_guard(args, source):
    if not args.write:
        return None
    if args.output_blend is None:
        raise ValueError("--write requires --output-blend")
    output = args.output_blend.resolve()
    if output.suffix.lower() != ".blend" or output == source.resolve() or output.exists():
        raise ValueError("Output must be a NEW .blend path; never overwrite a source or previous prototype")
    return output


def clone_selected(head, selection, args):
    if bpy.data.objects.get("AVSK_SourceScalp_Face4_V2"):
        raise ValueError("V2 scalp already exists in the scene; use a fresh source file")
    cloned = head.copy()
    cloned.data = head.data.copy()
    cloned.name = "AVSK_SourceScalp_Face4_V2"
    bpy.context.scene.collection.objects.link(cloned)
    cloned.matrix_world = head.matrix_world.copy()
    # The cloned object keeps its existing armature modifier, vertex groups,
    # bind matrix, source shape keys and skin weights. Never parent it again.
    bm = bmesh.new()
    try:
        bm.from_mesh(cloned.data)
        bm.faces.ensure_lookup_table()
        bm.faces.index_update()
        selected = set(selection)
        unwanted = [f for f in bm.faces if f.index not in selected]
        bmesh.ops.delete(bm, geom=unwanted, context="FACES")
        unused = [v for v in bm.verts if not v.link_faces]
        if unused:
            bmesh.ops.delete(bm, geom=unused, context="VERTS")
        bm.to_mesh(cloned.data)
    finally:
        bm.free()
    cloned.data.update()
    if not cloned.data.polygons:
        raise RuntimeError("Scalp extraction generated no polygons")
    # Source UVs and original facial skin weights remain copied. A separate
    # matte root-color material is diagnostic only; a true follicle texture,
    # style masks and hairline wisps are separate authoring stages.
    pigment = bpy.data.materials.new("AVSK_RootFoundation_Debug")
    pigment.use_nodes = True
    rgb = color_rgb(args.root_color)
    pigment.diffuse_color = (*rgb, 1)
    bsdf = pigment.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Roughness"].default_value = .91
        bsdf.inputs["Metallic"].default_value = 0
    cloned.data.materials.clear()
    cloned.data.materials.append(pigment)
    for face in cloned.data.polygons:
        face.material_index = 0
    # Small outward offset, converted through explicit scene and object scale.
    # Refuse nonuniform scaling, which would distort the normal offset.
    sx, sy, sz = (abs(float(s)) for s in head.matrix_world.to_scale())
    if min(sx, sy, sz) < 1e-9 or max(sx, sy, sz) / min(sx, sy, sz) > 1.001:
        raise ValueError("Head transform is nonuniform or degenerate: fix and re-inspect its scale")
    offset = (args.offset_mm / 1000) / args.meters_per_world_unit / sx
    if offset:
        cloned.data.calc_normals_split() if hasattr(cloned.data, "calc_normals_split") else None
        displacements = [vert.normal.copy() * offset for vert in cloned.data.vertices]
        for vert, displacement in zip(cloned.data.vertices, displacements):
            vert.co += displacement
        cloned.data.update()
    cloned["avensky_role"] = "head_surface_derived_scalp"
    cloned["avensky_original_source"] = head.name
    cloned["avensky_approved_for_release"] = False
    cloned["avensky_hair_root_geometry_fitted"] = False
    return cloned


def main():
    args = parse_args()
    if not (0 < args.min_weight <= 1) or not math.isfinite(args.min_weight):
        raise ValueError("--min-weight must be in (0,1]")
    if not math.isfinite(args.meters_per_world_unit) or args.meters_per_world_unit <= 0:
        raise ValueError("--meters-per-world-unit must be finite and positive")
    if not math.isfinite(args.offset_mm) or not 0 <= args.offset_mm <= 3:
        raise ValueError("--offset-mm must be between 0 and 3")
    color_rgb(args.root_color)
    source = source_head(args)
    output = output_guard(args, source)
    head = find_head(args.head_object)
    original_vertices = len(head.data.vertices)
    original_faces = len(head.data.polygons)
    selection, materials, allowed = marked_faces(head, args.region_group, args.face_material, args.min_weight)
    used, low, high = region_bounds(head, selection)
    boundary, nonmanifold = boundary_stats(head, selection)
    if nonmanifold:
        raise ValueError(f"Selected source region is nonmanifold: {nonmanifold} edges")
    if not (0.03 <= len(selection) / max(1,original_faces) <= .70):
        raise ValueError("Selected scalp fraction implausible; must not include the entire face or a tiny bald patch")
    if not head.find_armature():
        raise ValueError("Original Face4 source has no armature binding; do not export an unrigged cap")
    report = {
        "schema_version":1,"kind":"Face4-source-derived-scalp",
        "source":str(source),"source_sha256":hash_file(source),
        "head_mesh":head.name,"head_armature":head.find_armature().name,
        "face_material":args.face_material, "available_materials":materials,
        "region_group":args.region_group, "selected_faces":len(selection),
        "selected_vertices":len(used), "boundary_edges":boundary,
        "world_bounds": {"min":low,"max":high},
        "head_vertices_unchanged":original_vertices, "head_faces_unchanged":original_faces,
        "meters_per_world_unit":args.meters_per_world_unit,"offset_mm":args.offset_mm,
        "source_modified":False,"geometry_from_original_face":True,
        "status":"PREFLIGHT_ONLY", "release_approved":False,
        "qa_required":["forehead hairline","temple and ear exclusion",
                       "back nape coverage","hairline seams","head animations",
                       "source UV/material","fit with Curly Mane clumps"],
    }
    if output:
        cap = clone_selected(head,selection,args)
        if len(head.data.vertices) != original_vertices or len(head.data.polygons) != original_faces:
            raise AssertionError("Original Face4 geometry changed during extraction")
        output.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
        report["status"] = "AUTHORING_PROTOTYPE_NOT_RELEASE_READY"
        report["output_blend"] = str(output)
        report["cap_mesh"] = cap.name
        report["output_cap_faces"] = len(cap.data.polygons)
        report["output_cap_vertices"] = len(cap.data.vertices)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report,indent=2),encoding="utf-8")
    print("[Avensky] Face4 scalp:",report["status"],args.report,flush=True)


if __name__ == "__main__":
    main()
