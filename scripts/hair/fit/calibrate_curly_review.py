"""Prepare a private, provisional Face4 scalp group and reviewed donor unit hypothesis.

Run on the output of prepare_curly_mane_workbench.py in Blender. The UV
boundary is traced on the real Face BaseColor. This is a review proposal,
and replacing an existing painted group is deliberately refused.
"""
import argparse
import json
from pathlib import Path
import sys

import bpy
from mathutils import Matrix
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_curly_fit_probe import digest, ensure_actual_texture

# Conservative lower edge of the speckling across the central face UV island.
# The other two high-V islands contain the back of the skull and nape.
HAIRLINE_U = (.105, .16, .20, .26, .33, .42, .58, .67, .74, .80, .84, .895)
HAIRLINE_V = (.57, .52, .53, .57, .65, .66, .66, .65, .57, .53, .52, .57)


def propose_scalp(head):
    mesh = head.data
    mesh.calc_loop_triangles()
    uv = mesh.uv_layers.active
    if len(mesh.vertices) != 6330 or len(mesh.loop_triangles) != 8915 or uv is None:
        raise ValueError("Expected the original imported Face4 topology and source UV")
    proposal = set()
    face_triangles = []
    for tri in mesh.loop_triangles:
        material = mesh.materials[tri.material_index]
        if material is None or material.name.split(".")[0] != "Face":
            continue
        ids = tuple(tri.vertices)
        face_triangles.append(ids)
        u, v = np.array([tuple(uv.data[i].uv) for i in tri.loops]).T
        central = ((u >= HAIRLINE_U[0]) & (u <= HAIRLINE_U[-1])
                   & (v >= np.interp(u, HAIRLINE_U, HAIRLINE_V)))
        back = ((u < .245) | (u > .755)) & (v >= .78)
        if np.all(central | back):
            proposal.update(ids)
    selected = sum(all(i in proposal for i in tri.vertices) for tri in mesh.loop_triangles)
    selected_face = sum(all(i in proposal for i in tri) for tri in face_triangles)
    if selected < 64 or selected != selected_face:
        raise ValueError("Provisional scalp insufficient or leaked outside the Face material")
    return sorted(proposal), selected


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assume-donor-centimeter-authoring", required=True, action="store_true",
                        help="Explicitly test donor coordinates as centimeters despite 2.54 FBX metadata")
    parser.add_argument("--out-blend", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    a = parser.parse_args(args)
    if (a.out_blend.exists() or a.report.exists() or a.out_blend.suffix.lower() != ".blend"
            or a.out_blend.resolve() == a.report.resolve()):
        raise ValueError("Use new private output paths")
    head = bpy.data.objects["Face4"]
    donor = bpy.data.objects["Curly_Mane"]
    if len(donor.data.vertices) != 42685 or not np.allclose(donor.matrix_world.to_scale(), .0254):
        raise ValueError("Expected unmodified CURLY 01 Blender import at 0.0254 meters per raw unit")
    if not np.allclose(head.matrix_world.to_scale(), .01):
        raise ValueError("Expected original Face4 Blender import at 0.01 meters per raw unit")
    texture = ensure_actual_texture(head)
    group = head.vertex_groups.get("AV_ScalpRegion")
    if group is not None and any(g.group == group.index and g.weight > 0
                                 for v in head.data.vertices for g in v.groups):
        raise ValueError("Use an empty AV_ScalpRegion group or keep the existing painted group")
    vertices, triangles = propose_scalp(head)
    if group is None:
        group = head.vertex_groups.new(name="AV_ScalpRegion")
    group.add(vertices, 1.0, "REPLACE")
    head["avensky_scalp_status"] = "PROVISIONAL_FACE4_TEXTURE_TRACE"
    original_transform = donor.matrix_world.copy()
    had_object_animation = donor.animation_data is not None
    # The donor FBX imports a transform take that would restore the old scale on reload.
    donor.animation_data_clear()
    imported_matrix = [list(row) for row in original_transform]
    # Change the private scene's object transform only. Local source mesh/UV stays untouched.
    donor.matrix_world = Matrix.Scale(1 / 2.54, 4) @ original_transform
    donor["avensky_units_status"] = "REVIEW_ONLY_CENTIMETER_AUTHORING_HYPOTHESIS"
    bpy.context.view_layer.update()
    receipt = {
        "status": "PROVISIONAL_SCALP_AND_DONOR_UNIT_HYPOTHESIS",
        "source_blend_sha256": digest(Path(bpy.data.filepath)),
        "face_basecolor_sha256": digest(texture),
        "blender_version": bpy.app.version_string,
        "world_up": [0, 0, 1],
        "meters_per_world_unit": 1.0,
        "face_local_to_world": [list(row) for row in head.matrix_world],
        "donor_fbx_import_local_to_world": imported_matrix,
        "cleared_donor_object_animation_for_neutral_review": had_object_animation,
        "donor_hypothesis_local_to_world": [list(row) for row in donor.matrix_world],
        "scalp_vertices": len(vertices),
        "scalp_triangles": triangles,
    }
    a.out_blend.parent.mkdir(parents=True, exist_ok=True)
    a.report.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(a.out_blend.resolve()), compress=True)
    a.report.write_text(json.dumps(receipt, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
