"""Build a character-specific scalp foundation from approved Blender landmarks.

Author a closed edge-only mesh (default AV_HairlineLoop), an Empty for the
crown (default AV_Crown), and identify the character armature + head bone.
Run Blender on a PRIVATE working-copy .blend file, not the public game asset.
Dry-run is the default. --write requires a new --output-blend path.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cap_geometry import ordered_cycle, loft_cap


def parse_args():
    args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--loop-object', default='AV_HairlineLoop')
    ap.add_argument('--crown-object', default='AV_Crown')
    ap.add_argument('--armature-object', required=True)
    ap.add_argument('--head-bone', required=True)
    ap.add_argument('--up-vector', required=True, help='Comma-separated WORLD UP, e.g. 0,0,1; never inferred')
    ap.add_argument('--meters-per-unit', required=True, type=float, help='Metres per Blender world unit; explicit confirmation required')
    ap.add_argument('--levels', type=int, default=12)
    ap.add_argument('--offset-mm', type=float, default=1.0)
    ap.add_argument('--root-color', default='#38271f')
    ap.add_argument('--report', required=True, type=Path)
    ap.add_argument('--write', action='store_true', help='Create scalp and save a NEW .blend')
    ap.add_argument('--output-blend', type=Path)
    return ap.parse_args(args)


def input_sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()


def parse_axis(value):
    xyz = tuple(float(part.strip()) for part in value.split(','))
    if len(xyz) != 3 or not all(math.isfinite(x) for x in xyz):
        raise ValueError('up-vector must be three finite numbers')
    return xyz


def read_edge_loop(name):
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != 'MESH':
        raise ValueError(f'Missing edge-only Mesh {name}: trace the head hairline first')
    mesh = obj.data
    if mesh.polygons:
        raise ValueError('Hairline loop must be an edge-only Mesh (no faces)')
    indices = ordered_cycle([(edge.vertices[0], edge.vertices[1]) for edge in mesh.edges], len(mesh.vertices))
    return [tuple(obj.matrix_world @ mesh.vertices[i].co) for i in indices]


def validate_character(armature_name, head_bone_name):
    armature = bpy.data.objects.get(armature_name)
    if armature is None or armature.type != 'ARMATURE':
        raise ValueError(f'Armature not found: {armature_name}')
    bone = armature.data.bones.get(head_bone_name)
    if bone is None:
        raise ValueError(f'Head bone {head_bone_name} is missing from {armature_name}')
    return armature, bone


def hex_color(value):
    if len(value)!=7 or value[0]!='#':
        raise ValueError('root-color must be #RRGGBB')
    try:
        return tuple(int(value[i:i+2],16)/255.0 for i in (1,3,5))
    except ValueError as exc:
        raise ValueError('Invalid hex root color') from exc


def build_uv(mesh, result):
    n = result['boundary_count']
    apex = result['apex_index']
    layer = mesh.uv_layers.new(name='AVScalpUV')
    for poly in mesh.polygons:
        verts = list(poly.vertices)
        has_wrap = (any(vi < apex and vi % n == 0 for vi in verts)
                    and any(vi < apex and vi % n == n-1 for vi in verts))
        ring_values = []
        for vi in verts:
            if vi != apex:
                u = vi % n / n
                if has_wrap and vi % n == 0:
                    u = 1.0
                ring_values.append(u)
        apex_u = sum(ring_values)/len(ring_values) if ring_values else .5
        for loop_idx in poly.loop_indices:
            vi = mesh.loops[loop_idx].vertex_index
            if vi == apex:
                layer.data[loop_idx].uv = (apex_u, 1.0)
            else:
                u = vi % n / n
                if has_wrap and vi % n == 0:
                    u = 1.0
                layer.data[loop_idx].uv = (u, (vi // n) / result['levels'])


def make_object(result, armature, head_bone, root_color, offset_m, meters_per_unit):
    if bpy.data.objects.get('AVSK_ScalpFoundation_V2'):
        raise ValueError('AVSK_ScalpFoundation_V2 already exists; use a fresh working copy')
    mesh = bpy.data.meshes.new('AVSK_ScalpFoundation_V2_Mesh')
    mesh.from_pydata(result['vertices'], [], result['faces'])
    mesh.update(calc_edges=True)
    if mesh.validate(clean_customdata=False):
        raise RuntimeError('Blender corrected invalid scalp geometry; reject this authoring output')
    if len(mesh.polygons) != len(result['faces']):
        raise RuntimeError('Blender altered scalp topology')
    build_uv(mesh, result)
    # A small normal offset is allowed ONLY with explicit unit conversion.
    displacement = offset_m / meters_per_unit
    for vertex in mesh.vertices:
        vertex.co += vertex.normal * displacement
    mesh.update()
    cap = bpy.data.objects.new('AVSK_ScalpFoundation_V2', mesh)
    bpy.context.scene.collection.objects.link(cap)
    rgb = hex_color(root_color)
    material = bpy.data.materials.new('AVSK_ScalpFoundation_Roots')
    material.use_nodes = True
    material.diffuse_color = (*rgb, 1)
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)
        bsdf.inputs['Roughness'].default_value = .92
        bsdf.inputs['Metallic'].default_value = 0.0
    mesh.materials.append(material)
    # Rigid head-bone attachment; preserves the neutral world-space location.
    world = cap.matrix_world.copy()
    cap.parent = armature
    cap.parent_type = 'BONE'
    cap.parent_bone = head_bone.name
    cap.matrix_world = world
    cap['avensky_role'] = 'scalp_foundation'
    cap['avensky_head_bone'] = head_bone.name
    cap['avensky_approved_for_release'] = False
    cap['avensky_requires_hairline_review'] = True
    return cap


def main():
    args = parse_args()
    source = Path(bpy.data.filepath)
    if not source.is_file():
        raise RuntimeError('Open a saved private neutral-pose .blend scene first')
    if not math.isfinite(args.meters_per_unit) or args.meters_per_unit <= 0:
        raise ValueError('meters-per-unit must be finite and > 0')
    if not math.isfinite(args.offset_mm) or not (0 <= args.offset_mm <= 3):
        raise ValueError('offset-mm must be between 0 and 3 mm')
    if args.write:
        if not args.output_blend:
            raise ValueError('Must pass --output-blend with --write')
        target = args.output_blend.resolve()
        if target == source.resolve() or target.exists() or target.suffix.lower() != '.blend':
            raise ValueError('Output must be a NEW, nonexisting .blend path, not the input')
    hex_color(args.root_color)
    armature, head_bone = validate_character(args.armature_object,args.head_bone)
    marker = bpy.data.objects.get(args.crown_object)
    if not marker or marker.type != 'EMPTY':
        raise ValueError(f'Missing crown Empty {args.crown_object}')
    ring = read_edge_loop(args.loop_object)
    crown = tuple(marker.matrix_world.translation)
    up = parse_axis(args.up_vector)
    result = loft_cap(ring,crown,up,args.levels)
    center = Vector(crown)
    normalized_up = Vector(result['axis'])
    projected_radii = [(Vector(v)-center - normalized_up * (Vector(v)-center).dot(normalized_up)).length
                       for v in ring]
    heights = [(center-Vector(v)).dot(normalized_up) for v in ring]
    max_rad = max(projected_radii) * args.meters_per_unit
    max_height = max(heights) * args.meters_per_unit
    min_height = min(heights) * args.meters_per_unit
    # Guardrails, NOT measured values for Vesper.
    if not (0.025 < max_rad < 0.25 and 0.015 < min_height < 0.25 and max_height < 0.35):
        raise ValueError(f'Implausible cap: maxRadius={max_rad:.4f}m, minHeight={min_height:.4f}m, maxHeight={max_height:.4f}m. Check units and landmarks.')
    report = {
        'schema_version': 1, 'kind':'scalp-foundation-v2',
        'status':'STRUCTURAL_PREFLIGHT_ONLY', 'source_blend':str(source),
        'input_sha256':input_sha(source), 'source_modified':False,
        'armature':armature.name, 'head_bone':head_bone.name,
        'loop_object':args.loop_object, 'crown_object':args.crown_object,
        'meters_per_unit':args.meters_per_unit, 'offset_mm':args.offset_mm,
        'boundary_vertices': result['boundary_count'],
        'mesh_vertices':len(result['vertices']), 'mesh_faces':len(result['faces']),
        'approx_triangles':sum(len(face)-2 for face in result['faces']),
        'max_radius_m':round(max_rad,5),
        'height_m_range':[round(min_height,5),round(max_height,5)],
        'visual_checks_required':['forehead/temples/nape hairline','face/ears penetration','head turns','root color','five viewing angles','curl volume','phone rendering'],
        'hair_roots_conformed':False, 'production_ready':False,
    }
    if args.write:
        cap = make_object(result,armature,head_bone,args.root_color,args.offset_mm/1000,args.meters_per_unit)
        args.output_blend.parent.mkdir(parents=True,exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(args.output_blend.resolve()),compress=True)
        report['output_blend']=str(args.output_blend.resolve())
        report['cap_object']=cap.name
        report['status']='AUTHORING_OUTPUT_REQUIRES_VISUAL_QA'
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('[Avensky Hair] '+report['status']+' '+str(args.report),flush=True)


if __name__=='__main__':
    main()
