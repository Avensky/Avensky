"""Apply a private per-curl rigid-edit plan to a new Blender review scene."""
import argparse
import json
from pathlib import Path
import sys

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_curly_fit_probe import digest, groups_from_edges


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hair", default="AVFIT_CurlyMane_GLOBAL_PREVIEW")
    parser.add_argument("--output-name", default="AVFIT_CurlyMane_LOCAL_REVIEW")
    parser.add_argument("--fore-aft-only", action="store_true",
                        help="Allow pitch about world X and fore-aft world Y translation only")
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--out-blend", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    a = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    source = Path(bpy.data.filepath)
    out, report = a.out_blend.resolve(), a.report.resolve()
    if not source.is_file() or out.exists() or report.exists() or out == report or out.suffix.lower() != ".blend":
        raise ValueError("Open a saved private scene and choose two new output paths")
    hair = bpy.context.scene.objects.get(a.hair)
    name = a.output_name
    if not hair or hair.type != "MESH" or hair.animation_data or bpy.data.objects.get(name):
        raise ValueError("Use a static comparison object and a new review object name")
    plan = json.loads(a.plan.read_text(encoding="utf-8"))
    if not isinstance(plan, list) or not plan:
        raise ValueError("Expected a nonempty private edit plan")
    mesh = hair.data
    groups = groups_from_edges(len(mesh.vertices), [tuple(edge.vertices) for edge in mesh.edges])
    local = np.array([tuple(v.co) for v in mesh.vertices], dtype=np.float32)
    original = np.array([tuple(hair.matrix_world @ v.co) for v in mesh.vertices])
    # Keep untouched local coordinates bit-for-bit identical in the copy.
    fitted_coordinates = local.copy()
    local_to_world = np.asarray(hair.matrix_world, dtype=float)
    world_to_local = np.asarray(hair.matrix_world.inverted(), dtype=float)
    normals = None
    if mesh.has_custom_normals:
        normals = np.array([tuple(corner.vector) for corner in mesh.corner_normals])
        loop_vertices = np.array([loop.vertex_index for loop in mesh.loops])
    seen = set()
    changed = 0
    max_transform_error = 0.
    max_lateral_change = 0.
    for row in plan:
        i = row["component"]
        if type(i) is not int or i in seen or not 0 <= i < len(groups):
            raise ValueError("Invalid or duplicate connected component in edit plan")
        seen.add(i)
        before = np.asarray(row["source_root"], dtype=float)
        after = np.asarray(row["target_root"], dtype=float)
        rotation = np.asarray(row["rotation"], dtype=float)
        if (before.shape != (3,) or after.shape != (3,) or rotation.shape != (3, 3)
                or not all(np.isfinite(value).all() for value in (before, after, rotation))
                or not np.allclose(rotation.T @ rotation, np.eye(3), atol=1e-7, rtol=0)
                or not np.isclose(np.linalg.det(rotation), 1, atol=1e-7, rtol=0)):
            raise ValueError("Each edit must be a proper rigid transform in Blender world coordinates")
        if a.fore_aft_only and (
            not np.allclose(rotation[0], (1, 0, 0), atol=1e-7, rtol=0)
            or not np.allclose((after - before)[[0, 2]], 0, atol=1e-7, rtol=0)
        ):
            raise ValueError("Fore-aft edits require pitch and world Y translation only")
        indices = np.asarray(groups[i])
        points = original[indices]
        if np.min(np.linalg.norm(points - before, axis=1)) > .04:
            raise ValueError("Plan anchor is not associated with this component")
        moved = (points - before) @ rotation.T + after
        fitted_coordinates[indices] = moved @ world_to_local[:3, :3].T + world_to_local[:3, 3]
        recovered = (fitted_coordinates[indices].astype(float) @ local_to_world[:3, :3].T
                     + local_to_world[:3, 3])
        if normals is not None:
            local_rotation = world_to_local[:3, :3] @ rotation @ local_to_world[:3, :3]
            normal_transform = np.linalg.inv(local_rotation).T
            affected_loops = np.isin(loop_vertices, indices)
            rotated = normals[affected_loops] @ normal_transform.T
            normals[affected_loops] = rotated / np.linalg.norm(rotated, axis=1)[:, None]
        max_transform_error = max(max_transform_error, float(np.linalg.norm(recovered - moved, axis=1).max()))
        max_lateral_change = max(max_lateral_change, float(np.abs(recovered[:, 0] - points[:, 0]).max()))
        changed += len(indices)
    if a.fore_aft_only and max_lateral_change > .000001:
        raise ValueError("Unexpected lateral movement in the stored fore-aft edit")
    if max_transform_error > .000005:
        raise ValueError("Unexpected coordinate precision loss")
    edited = hair.copy()
    edited.data = mesh.copy()
    edited.name = name
    bpy.context.scene.collection.objects.link(edited)
    edited.data.vertices.foreach_set("co", fitted_coordinates.ravel())
    edited.data.update()
    if normals is not None:
        edited.data.normals_split_custom_set(normals.tolist())
    edited["avensky_status"] = "PRIVATE_RIGID_CURL_EDITS_AWAITING_VISUAL_REVIEW"
    edited["avensky_approved_for_release"] = False
    hair.hide_render = True
    hair.hide_set(True)
    out.parent.mkdir(parents=True, exist_ok=True)
    report.parent.mkdir(parents=True, exist_ok=True)
    receipt = {
        "source_scene_sha256": digest(source), "private_plan_sha256": digest(a.plan),
        "hair": edited.name, "moved_components": len(seen), "moved_vertices": changed,
        "untouched_vertices": len(mesh.vertices) - changed,
        "added_vertices": 0, "added_triangles": 0,
        "max_transform_error_m": max_transform_error, "approved_for_release": False,
        "fore_aft_only": a.fore_aft_only, "max_lateral_change_m": max_lateral_change,
    }
    bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=True)
    report.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
