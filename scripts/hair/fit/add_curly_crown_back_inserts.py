"""Add interior copies of genuine source curls to a new private Blender preview."""
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
    parser.add_argument("--template-hair", default="AVFIT_CurlyMane_GLOBAL_PREVIEW")
    parser.add_argument("--insert-name", default="AVFIT_CurlyMane_CROWN_BACK_INSERT_REVIEW")
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--out-blend", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    a = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    source = Path(bpy.data.filepath)
    out, report = a.out_blend.resolve(), a.report.resolve()
    if not source.is_file() or out.exists() or report.exists() or out == report or out.suffix.lower() != ".blend":
        raise ValueError("Open a private review scene and choose two new output paths")
    template = bpy.context.scene.objects.get(a.template_hair)
    name = a.insert_name
    if not template or template.type != "MESH" or bpy.data.objects.get(name):
        raise ValueError("Use the original source donor in a fresh review scene")
    mesh = template.data
    uv = mesh.uv_layers.active
    if uv is None:
        raise ValueError("The original source UV map is required")
    plan = json.loads(a.plan.read_text(encoding="utf-8"))
    if not isinstance(plan, list) or not plan:
        raise ValueError("Provide individual source-curl insert placements")
    groups = groups_from_edges(len(mesh.vertices), [tuple(edge.vertices) for edge in mesh.edges])
    islands = np.zeros(len(mesh.vertices), dtype=int)
    for index, vertices in enumerate(groups):
        islands[vertices] = index
    ids_by_component = [[] for _ in groups]
    for polygon in mesh.polygons:
        ids_by_component[islands[polygon.vertices[0]]].append(polygon.index)
    source_positions = np.array([tuple(template.matrix_world @ v.co) for v in mesh.vertices])
    world_normal = np.asarray(template.matrix_world.to_3x3().inverted().transposed())
    corners = np.array([tuple(corner.vector) for corner in mesh.corner_normals]) @ world_normal.T

    vertices, faces, uvs, normals, smoothing = [], [], [], [], []
    for row in plan:
        index = row["component"]
        before = np.asarray(row["source_root"], dtype=float)
        after = np.asarray(row["target_root"], dtype=float)
        rotation = np.asarray(row["rotation"], dtype=float)
        scale = float(row["scale"])
        if (type(index) is not int or not 0 <= index < len(groups)
                or before.shape != (3,) or after.shape != (3,) or rotation.shape != (3, 3)
                or not all(np.isfinite(value).all() for value in (before, after, rotation))
                or not np.allclose(rotation.T @ rotation, np.eye(3), atol=1e-7, rtol=0)
                or not np.isclose(np.linalg.det(rotation), 1, atol=1e-7, rtol=0)
                or not .45 <= scale <= 1):
            raise ValueError("Each insert needs a proper world rotation and proportional source curl")
        indices = groups[index]
        points = source_positions[indices]
        if np.min(np.linalg.norm(points - before, axis=1)) > .04:
            raise ValueError("Insert anchor does not match the original template component")
        offset = len(vertices)
        remap = {point: offset + k for k, point in enumerate(indices)}
        vertices.extend(((points - before) @ rotation.T * scale + after).tolist())
        for poly_index in ids_by_component[index]:
            polygon = mesh.polygons[poly_index]
            faces.append([remap[i] for i in polygon.vertices])
            loops = list(polygon.loop_indices)
            uvs.extend(tuple(uv.data[i].uv) for i in loops)
            rotated = corners[loops] @ rotation.T
            normals.extend((rotated / np.linalg.norm(rotated, axis=1)[:, None]).tolist())
            smoothing.append(polygon.use_smooth)

    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    new_uv = data.uv_layers.new(name=uv.name)
    new_uv.data.foreach_set("uv", np.asarray(uvs, dtype=np.float32).ravel())
    data.polygons.foreach_set("use_smooth", np.asarray(smoothing, dtype=bool))
    data.normals_split_custom_set(normals)
    data.calc_loop_triangles()
    inserts = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(inserts)
    inserts["avensky_approved_for_release"] = False
    inserts["avensky_status"] = "PRIVATE_CROWN_BACK_DENSITY_REVIEW"
    out.parent.mkdir(parents=True, exist_ok=True)
    report.parent.mkdir(parents=True, exist_ok=True)
    receipt = {
        "source_scene_sha256": digest(source),
        "private_plan_sha256": digest(a.plan),
        "source_curl_copies": len(plan),
        "added_vertices": len(data.vertices),
        "added_triangles": len(data.loop_triangles),
        "insert_object": inserts.name,
        "approved_for_release": False,
    }
    bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=True)
    report.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps(receipt), flush=True)


if __name__ == "__main__":
    main()
