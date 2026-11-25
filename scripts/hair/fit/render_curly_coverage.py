"""Render six private Curly Mane before/after pairs and linear scalp exposure masks."""
import argparse
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

import bpy
from mathutils import Vector
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_curly_fit_probe import digest, ensure_actual_texture, group_array
from scalp_coverage_metrics import measure_exposure

TOP_DIRECTION = (0, 0, 1)
VIEWS = {
    "front": (0, -1, 0), "back": (0, 1, 0),
    "left": (1, 0, 0), "right": (-1, 0, 0),
    "top": TOP_DIRECTION, "three-quarter": (1, -1, .22),
}


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--head", default="Face4")
    parser.add_argument("--before", default="Curly_Mane")
    parser.add_argument("--after", default="AVFIT_CurlyMane_GLOBAL_PREVIEW")
    parser.add_argument("--scalp-group", default="AV_ScalpRegion")
    parser.add_argument("--framing-hair", help="Use this original baseline with the before object to keep the prior framing and lights")
    parser.add_argument("--framing-before", help="Optional original before object for exact reuse of the prior framing")
    parser.add_argument("--after-inserts", help="Separate source-curl insert mesh shown only after")
    parser.add_argument("--shared-inserts", action="append", default=[],
                        help="Previously reviewed insert mesh shown in both stages (repeatable)")
    parser.add_argument("--diffuse", type=Path, required=True)
    parser.add_argument("--opacity", type=Path, required=True)
    parser.add_argument("--normal", type=Path)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--threads", type=int, default=8)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    return mat, tree, tree.nodes.new("ShaderNodeOutputMaterial")


def image_node(tree, path, uv_name, *, data=False):
    image = bpy.data.images.load(str(path.resolve()), check_existing=True)
    image.colorspace_settings.name = "Non-Color" if data else "sRGB"
    uv = tree.nodes.new("ShaderNodeUVMap")
    uv.uv_map = uv_name
    node = tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    node.interpolation = "Linear"
    node.extension = "REPEAT"
    tree.links.new(uv.outputs["UV"], node.inputs["Vector"])
    return node


def flat_shader(tree, value):
    node = tree.nodes.new("ShaderNodeEmission")
    node.inputs["Color"].default_value = (value, value, value, 1)
    return node


def flat_material(name, value):
    mat, tree, output = material(name)
    tree.links.new(flat_shader(tree, value).outputs[0], output.inputs["Surface"])
    return mat


def textured_skin(path, uv):
    mat, tree, output = material(path.stem)
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = .58
    tree.links.new(image_node(tree, path, uv).outputs["Color"], bsdf.inputs["Base Color"])
    tree.links.new(bsdf.outputs[0], output.inputs["Surface"])
    return mat


def hair_material(args, uv, *, mask):
    mat, tree, output = material("Curls mask" if mask else "Source Curls")
    trans = tree.nodes.new("ShaderNodeBsdfTransparent")
    mix = tree.nodes.new("ShaderNodeMixShader")
    opacity = image_node(tree, args.opacity, uv, data=True)
    channels = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(opacity.outputs["Color"], channels.inputs["Color"])
    tree.links.new(channels.outputs["Red"], mix.inputs[0])
    tree.links.new(trans.outputs[0], mix.inputs[1])
    if mask:
        surface = flat_shader(tree, 0)
    else:
        surface = tree.nodes.new("ShaderNodeBsdfPrincipled")
        surface.inputs["Roughness"].default_value = .56
        surface.inputs["Specular IOR Level"].default_value = .22
        diffuse = image_node(tree, args.diffuse, uv)
        tree.links.new(diffuse.outputs["Color"], surface.inputs["Base Color"])
        if args.normal:
            normal = tree.nodes.new("ShaderNodeNormalMap")
            normal.uv_map = uv
            normal.inputs["Strength"].default_value = .55
            node = image_node(tree, args.normal, uv, data=True)
            tree.links.new(node.outputs["Color"], normal.inputs["Color"])
            tree.links.new(normal.outputs["Normal"], surface.inputs["Normal"])
    tree.links.new(surface.outputs[0], mix.inputs[2])
    tree.links.new(mix.outputs[0], output.inputs["Surface"])
    return mat


def mesh_copy(scene, source):
    obj = bpy.data.objects.new(source.name + " review", source.data.copy())
    scene.collection.objects.link(obj)
    obj.matrix_world = source.matrix_world
    return obj


def head_materials(head, skin_path):
    uv = head.data.uv_layers.active.name
    transparent, tree, output = material("Unauthored eye overlays")
    node = tree.nodes.new("ShaderNodeBsdfTransparent")
    tree.links.new(node.outputs[0], output.inputs["Surface"])
    for slot, source in enumerate(head.data.materials):
        name = source.name.split(".")[0] if source else ""
        path = skin_path.with_name(f"T_Villager_Lady_{name}_BaseColor.tga")
        if name in {"Face", "Body", "Details"} and path.is_file():
            head.data.materials[slot] = textured_skin(path, uv)
        else:
            head.data.materials[slot] = transparent


def mask_head(scene, head, weights):
    source = head.data
    source.calc_loop_triangles()
    faces = [tuple(t.vertices) for t in source.loop_triangles]
    selected = np.asarray([np.all(weights[list(face)] >= .5) for face in faces])
    if selected.sum() < 64:
        raise ValueError("Expected a nonempty reviewed/provisional Face4 scalp region")
    # Exact original triangles, with unselected head surfaces providing self-occlusion.
    mesh = bpy.data.meshes.new("Face4 triangle mask")
    mesh.from_pydata([v.co for v in source.vertices], [], faces)
    mesh.materials.append(flat_material("Off scalp", 0))
    mesh.materials.append(flat_material("On scalp", 1))
    mesh.polygons.foreach_set("material_index", selected.astype(np.int32))
    result = bpy.data.objects.new("Face4 triangle mask", mesh)
    scene.collection.objects.link(result)
    result.matrix_world = head.matrix_world
    return result, int(selected.sum())


def world_positions(obj):
    return np.array([tuple(obj.matrix_world @ v.co) for v in obj.data.vertices])


def set_camera(camera, direction, center, points):
    facing = Vector(direction).normalized()
    # With +Z view, set top-image up to the rear (+Y) and show the front at bottom.
    rotation = facing.to_track_quat("Z", "Y")
    if direction == TOP_DIRECTION:
        rotation.identity()
    rotation = rotation.to_matrix()
    projected = (points - center) @ np.asarray(rotation)
    scale = float(np.abs(projected[:, :2]).max() * 2.15)
    camera.data.ortho_scale = scale
    camera.data.clip_end = scale * 15
    camera.location = Vector(center) + facing * scale * 4
    camera.rotation_euler = rotation.to_euler()
    return {"location": list(camera.location), "euler_xyz": list(camera.rotation_euler),
            "ortho_scale": scale}


def create_scene(args, center, extent):
    scene = bpy.data.scenes.new("Vesper private coverage QA")
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = args.samples
    scene.cycles.seed = 29
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.cycles.transparent_max_bounces = 96
    scene.render.threads_mode = "FIXED"
    scene.render.threads = args.threads
    scene.render.resolution_x = scene.render.resolution_y = args.size
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.world = bpy.data.worlds.new("Fixed neutral review world")
    scene.world.use_nodes = True
    camera = bpy.data.objects.new("Coverage orthographic camera", bpy.data.cameras.new("Coverage camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.clip_start = extent / 1000
    lights = []
    for direction, energy, size in [((-.7, -1, 1.1), 240, .8),
                                   ((1, -.3, .45), 115, .9),
                                   ((.25, 1, .85), 210, .75)]:
        # Studio lights stay fixed in world space for both sides of each pair.
        light = bpy.data.lights.new("Neutral studio", "AREA")
        light.energy = energy * extent ** 2
        light.shape = "DISK"
        light.size = size * extent
        obj = bpy.data.objects.new("Neutral studio", light)
        scene.collection.objects.link(obj)
        obj.location = Vector(center) + Vector(direction).normalized() * extent * 2
        obj.rotation_euler = (Vector(center) - obj.location).to_track_quat("-Z", "Y").to_euler()
        lights.append(obj)
    return scene, camera, lights


def capture(scene, path, *, mask=False):
    settings = scene.render.image_settings
    settings.file_format = "OPEN_EXR" if mask else "PNG"
    settings.color_mode = "RGB"
    settings.color_depth = "32" if mask else "8"
    scene.render.filepath = str(path)
    bpy.ops.render.render(scene=scene.name, write_still=True)
    if mask:
        image = bpy.data.images.load(str(path), check_existing=False)
        pixels = np.empty(len(image.pixels), dtype=np.float32)
        try:
            image.pixels.foreach_get(pixels)
            return np.clip(pixels.reshape((image.size[1], image.size[0], image.channels))[:, :, 0], 0, 1)
        finally:
            bpy.data.images.remove(image)


def save_mask(mask, path):
    height, width = mask.shape
    image = bpy.data.images.new(path.stem, width=width, height=height, alpha=False, is_data=True)
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = mask[:, :, None]
    try:
        image.pixels.foreach_set(rgba.ravel())
        image.filepath_raw = str(path)
        image.file_format = "PNG"
        image.save()
    finally:
        bpy.data.images.remove(image)


def main():
    args = arguments()
    if not (64 <= args.size <= 2048 and 1 <= args.samples <= 512 and 1 <= args.threads <= 64):
        raise ValueError("Invalid resolution, samples or CPU threads")
    source = Path(bpy.data.filepath)
    if not source.is_file():
        raise ValueError("Open the saved private Blender comparison scene first")
    head, before, after = (bpy.context.scene.objects.get(name)
                           for name in (args.head, args.before, args.after))
    if not all(obj and obj.type == "MESH" and obj.data.uv_layers.active for obj in (head, before, after)):
        raise ValueError("Expected the UV-mapped original Face4 and both Curly Mane objects")
    if head in (before, after) or (before == after and not args.after_inserts):
        raise ValueError("Use a separate head and either two hair meshes or one hair mesh with after-only inserts")
    maps = {"diffuse": args.diffuse, "opacity": args.opacity}
    if args.normal:
        maps["normal"] = args.normal
    if (args.diffuse.name != "DIFFUSE_AUBURN.png" or args.opacity.name != "OPACITY.png"
            or (args.normal and args.normal.name != "NORMAL.png")
            or any(not path.is_file() or path.parent.name != "Curls"
                   or path.resolve().parent != args.opacity.resolve().parent for path in maps.values())):
        raise ValueError("Use the matching Curls diffuse, opacity and optional normal from one atlas directory")
    skin = ensure_actual_texture(head)
    weights = group_array(head, args.scalp_group)
    if weights is None:
        raise ValueError("Mark the original Face4 scalp region first")
    head_points = world_positions(head)
    extent = float(np.ptp(head_points, axis=0).max())
    framing = bpy.context.scene.objects.get(args.framing_hair) if args.framing_hair else after
    framing_before = bpy.context.scene.objects.get(args.framing_before) if args.framing_before else before
    if not all(obj and obj.type == "MESH" for obj in (framing_before, framing)):
        raise ValueError("Framing hair mesh is missing")
    points = np.concatenate((head_points, world_positions(framing_before), world_positions(framing)))
    center = (points.max(0) + points.min(0)) / 2
    scene, camera, lights = create_scene(args, center, extent)
    beauty_head = mesh_copy(scene, head)
    head_materials(beauty_head, skin)
    diagnostic_head, triangles = mask_head(scene, head, weights)
    sources = [before, after]
    stage_indices = [[0], [1]]
    insert_stages = [(name, (0, 1)) for name in args.shared_inserts]
    insert_stages.append((args.after_inserts, (1,)))
    for name, stage_ids in insert_stages:
        if not name:
            continue
        insert = bpy.context.scene.objects.get(name)
        if (not insert or insert.type != "MESH" or insert in [head, *sources]
                or not insert.data.uv_layers.active):
            raise ValueError("Each insert must be a separate mesh with the source opacity UV")
        for stage_id in stage_ids:
            stage_indices[stage_id].append(len(sources))
        sources.append(insert)
    donors = [mesh_copy(scene, obj) for obj in sources]
    stages = [(label, [donors[index] for index in indices])
              for label, indices in zip(("before", "after"), stage_indices)]
    hair_materials = []
    for obj in donors:
        uv = obj.data.uv_layers.active.name
        obj.data.materials.clear()
        obj.data.materials.append(hair_material(args, uv, mask=False))
        hair_materials.append((obj.data.materials[0], hair_material(args, uv, mask=True)))
        for polygon in obj.data.polygons:
            polygon.material_index = 0

    out = args.out_dir.resolve()
    out.mkdir(parents=True)
    report = {
        "status": "PRIVATE_REST_GEOMETRY_REVIEW_ONLY", "blender": bpy.app.version_string,
        "input_scene_sha256": digest(source), "face_basecolor_sha256": digest(skin),
        "curls_sha256": {key: digest(path) for key, path in maps.items()},
        "scalp_group": args.scalp_group, "scalp_triangles": triangles,
        "scalp_status": head.get("avensky_scalp_status", "GROUP_STATUS_UNSPECIFIED"),
        "before_object": before.name, "after_object": after.name,
        "framing_hair": framing.name, "framing_before": framing_before.name,
        "after_inserts": args.after_inserts, "shared_inserts": args.shared_inserts,
        "samples": args.samples, "seed": 29, "size": args.size,
        "beauty_denoised": True, "diagnostics_denoised": False, "views": {},
    }
    background = scene.world.node_tree.nodes.get("Background")
    with TemporaryDirectory(dir=out) as temporary:
        for view, direction in VIEWS.items():
            entry = {"camera": set_camera(camera, direction, center, points)}
            report["views"][view] = entry
            for diagnostic in (False, True):
                scene.cycles.use_denoising = not diagnostic
                beauty_head.hide_render = diagnostic
                diagnostic_head.hide_render = not diagnostic
                for light in lights:
                    light.hide_render = diagnostic
                background.inputs["Color"].default_value = (.22, .22, .22, 1)
                background.inputs["Strength"].default_value = 0 if diagnostic else .42
                for obj, materials in zip(donors, hair_materials):
                    obj.data.materials[0] = materials[int(diagnostic)]
                if diagnostic:
                    for obj in donors:
                        obj.hide_render = True
                    path = Path(temporary) / f"{view}-reference.exr"
                    reference = capture(scene, path, mask=True)
                    save_mask(reference, out / f"{view}-scalp-reference.png")
                for label, selected in stages:
                    for obj in donors:
                        obj.hide_render = obj not in selected
                    if diagnostic:
                        path = Path(temporary) / f"{view}-{label}.exr"
                        visible = capture(scene, path, mask=True)
                        entry[label], mask = measure_exposure(reference, visible)
                        save_mask(mask, out / f"{view}-{label}-exposure.png")
                    else:
                        capture(scene, out / f"{view}-{label}.png")
    (out / "coverage-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
