"""Vesper Curly Mane prototype: non-destructive inspect, landmark alignment and root-only conform.

Run in a PRIVATE .blend containing *original* Face4+Face BaseColor and CURLY 01.
The preflight requires source/target marker Empties for any alignment:
 AV_SRC_forehead/crown/temple_l/temple_r/nape
 AV_DST_forehead/crown/temple_l/temple_r/nape
Root conform requires AV_RootWeight on donor, AV_ScalpRegion on actual Face4.
Unmarked tips remain unchanged. No GLB/game export; original source is intact.

Examples:
 blender -b /private/curly/workbench.blend --python scripts/hair/fit/pilot_curly_mane.py -- \
   --mode inspect --meters-per-world-unit 1 --face-basecolor /private/T_Villager_Lady_Face_BaseColor.tga --report /private/curly/inspect.json
 blender -b /private/curly/annotated.blend --python scripts/hair/fit/pilot_curly_mane.py -- \
   --mode conform --meters-per-world-unit 1 --face-basecolor /private/T_Villager_Lady_Face_BaseColor.tga \
   --write --output-blend /private/curly/fitted-preview.blend --report /private/curly/fit.json
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from fit_math import similarity_transform, islands_from_edges, translate_root_islands

NAMES=("forehead","crown","temple_l","temple_r","nape")


def parse_args():
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--mode',choices=['inspect','align','conform'],default='inspect')
    p.add_argument('--head-object',default='Face4')
    p.add_argument('--hair-object',default='Curly_Mane')
    p.add_argument('--head-group',default='AV_ScalpRegion')
    p.add_argument('--root-group',default='AV_RootWeight')
    p.add_argument('--meters-per-world-unit',required=True,type=float)
    p.add_argument('--max-landmark-rms-m',type=float,default=.015)
    p.add_argument('--max-root-move-m',type=float,default=.035)
    p.add_argument('--max-root-target-distance-m',type=float,default=.04)
    p.add_argument('--root-offset-mm',type=float,default=1.)
    p.add_argument('--face-basecolor',type=Path)
    p.add_argument('--report',required=True,type=Path)
    p.add_argument('--write',action='store_true')
    p.add_argument('--output-blend',type=Path)
    return p.parse_args(args)


def hash_file(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):
            h.update(block)
    return h.hexdigest()


def mesh(name):
    obj=bpy.data.objects.get(name)
    if not obj or obj.type!='MESH' or not obj.data.vertices or not obj.data.polygons:
        raise ValueError('Missing nonempty mesh: '+name)
    return obj


def landmarks():
    src,dst,missing=[],[],[]
    for key in NAMES:
        a=bpy.data.objects.get('AV_SRC_'+key)
        b=bpy.data.objects.get('AV_DST_'+key)
        if not a or not b or a.type!='EMPTY' or b.type!='EMPTY':
            missing.append(key)
        else:
            src.append(tuple(a.matrix_world.translation))
            dst.append(tuple(b.matrix_world.translation))
    return src,dst,missing


def group_weights(obj,name):
    group=obj.vertex_groups.get(name)
    if group is None:
        return None
    values=[]
    for i in range(len(obj.data.vertices)):
        try: values.append(float(group.weight(i)))
        except RuntimeError: values.append(0.)
    return values


def approved_scalp_bvh(head,group_name):
    weights=group_weights(head,group_name)
    if weights is None:
        raise ValueError('Paint and approve AV_ScalpRegion on original Face4; never project onto face/ears')
    faces=[list(poly.vertices) for poly in head.data.polygons
           if len(poly.vertices)>=3 and all(weights[index]>=.5 for index in poly.vertices)]
    if len(faces)<32:
        raise ValueError('Fewer than 32 head scalp faces approved; do not guess a synthetic cap')
    verts=[head.matrix_world @ v.co for v in head.data.vertices]
    return BVHTree.FromPolygons(verts,faces,all_triangles=False),len(faces)


def mesh_details(obj):
    data=obj.data
    return {
        'object':obj.name,'vertices':len(data.vertices),'faces':len(data.polygons),
        'uv_layers':[u.name for u in data.uv_layers],
        'materials':[m.name if m else None for m in data.materials],
        'vertex_groups':[g.name for g in obj.vertex_groups],
        'armature':obj.find_armature().name if obj.find_armature() else None,
        'shape_keys':[key.name for key in data.shape_keys.key_blocks] if data.shape_keys else []
    }


def verify_original_skin(head,face_path):
    if face_path is None or not face_path.is_file() or face_path.name!='T_Villager_Lady_Face_BaseColor.tga':
        return {'original_texture_provided':False,'mapped':False}
    expected=face_path.resolve()
    mapped=False
    for material in head.data.materials:
        if not material or not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image:
                actual=Path(bpy.path.abspath(node.image.filepath)).resolve()
                if actual==expected:
                    mapped=True
    return {'original_texture_provided':True,'mapped':mapped,
            'texture_sha256':hash_file(expected)}


def output_path(args,scene):
    if args.mode=='inspect':
        if args.write: raise ValueError('inspect mode is report-only')
        return None
    if not args.write or not args.output_blend:
        raise ValueError('align and conform must use --write and NEW --output-blend')
    if not scene.is_file():
        raise ValueError('Save the input PRIVATE .blend before fitting')
    out=args.output_blend.resolve()
    if out==scene or out.exists() or out.suffix.lower()!='.blend':
        raise ValueError('Output cannot be original/existing .blend; choose a new file path')
    return out


def main():
    a=parse_args()
    if a.mode == 'conform':
        raise ValueError('Legacy root conform is disabled: the earlier nearest-scalp UV-end selection could misclassify curl tips. Run auto_align_curly_mane.py and visually approve global placement before a new root-only fitter is enabled.')
    if not math.isfinite(a.meters_per_world_unit) or a.meters_per_world_unit<=0:
        raise ValueError('Confirm meters-per-world-unit before geometry fitting')
    if any(not math.isfinite(v) or v<=0 for v in (
        a.max_landmark_rms_m,a.max_root_move_m,a.max_root_target_distance_m)):
        raise ValueError('All fitting limits must be positive finite')
    if not math.isfinite(a.root_offset_mm) or not 0<=a.root_offset_mm<=3:
        raise ValueError('root-offset-mm must be 0..3')
    scene=Path(bpy.data.filepath).resolve()
    target=output_path(a,scene)
    head=mesh(a.head_object)
    donor=mesh(a.hair_object)
    if head==donor: raise ValueError('Face4 and Curly Mane cannot be same object')
    skin=verify_original_skin(head,a.face_basecolor)
    src,dst,missing=landmarks()
    scalp_weight=group_weights(head,a.head_group)
    root_weight=group_weights(donor,a.root_group)
    report={
        'kind':'Vesper-original-scalp-Curly-Mane-pilot',
        'status':'INSPECTION_ONLY','mode':a.mode,
        'source_blend':str(scene),'source_sha256':hash_file(scene) if scene.is_file() else None,
        'face_basecolor':skin,'head':mesh_details(head),'hair':mesh_details(donor),
        'missing_landmarks':missing,
        'approved_head_group_exists':scalp_weight is not None,
        'donor_root_group_exists':root_weight is not None,
        'marked_root_vertices':sum(v>0 for v in root_weight) if root_weight else 0,
        'original_skin_unchanged':True,'original_donor_unchanged':True,
        'no_new_scalp_cap':True,'glb_exported':False,'runtime_approved':False
    }
    if a.mode!='inspect':
        if missing: raise ValueError('Need five paired landmark Empties: '+','.join(missing))
        if not skin['original_texture_provided'] or not skin['mapped']:
            raise ValueError('Original Face4 BaseColor is missing or not connected; do not fit to a fake colored cap')
        transform,stats=similarity_transform(src,dst,
            max_rms=a.max_landmark_rms_m/a.meters_per_world_unit)
        if not (.25<=stats['scale']<=4):
            raise ValueError('Unexpected scale; check FBX up axis and scene unit conversion')
        if bpy.data.objects.get('AVFIT_Curly_Mane_Working'):
            raise ValueError('A previous fitting clone is in this input scene; start from original workbench')
        working=donor.copy()
        working.data=donor.data.copy()
        working.name='AVFIT_Curly_Mane_Working'
        bpy.context.scene.collection.objects.link(working)
        working.matrix_world=Matrix(transform.tolist())@donor.matrix_world
        working['avensky_status']='PRIVATE_UNREVIEWED_FIT'
        donor.hide_render=True
        donor.hide_set(True)
        report['landmark_fit']=stats
        report['status']='COARSE_ALIGNMENT_VISUAL_QA_REQUIRED'
        if a.mode=='conform':
            if working.data.shape_keys:
                raise ValueError('Shape-key source needs explicit all-key deformation; refusing partial fit')
            if root_weight is None:
                raise ValueError('Curly Mane lacks approved AV_RootWeight group')
            bvh,num_faces=approved_scalp_bvh(head,a.head_group)
            positions=[tuple(working.matrix_world@v.co) for v in working.data.vertices]
            edges=[tuple(e.vertices) for e in working.data.edges]
            comps=islands_from_edges(len(positions),edges)
            offset=a.root_offset_mm/1000/a.meters_per_world_unit
            def project(x):
                p,n,i,d=bvh.find_nearest(Vector(x))
                return None if p is None else tuple(p+n*offset)
            fitted,receipts=translate_root_islands(
                positions,root_weight,comps,project,
                max_root_move=a.max_root_move_m/a.meters_per_world_unit,
                max_projection_distance=a.max_root_target_distance_m/a.meters_per_world_unit)
            summary=dict(Counter(x['status'] for x in receipts))
            if summary.get('NO_SAFE_TARGET',0) or summary.get('EXCESSIVE_ROOT_SHIFT',0):
                raise ValueError('Unresolved root components; refuse output: '+str(summary))
            local=working.matrix_world.inverted_safe()
            for vertex,position in zip(working.data.vertices,fitted):
                vertex.co=local@Vector(position)
            working.data.update()
            report['approved_scalp_faces']=num_faces
            report['root_island_summary']=summary
            report['root_islands_fitted']=summary.get('FITTED',0)
            report['status']='ROOTS_CONFORMED_BUT_VISUAL_QA_REQUIRED'
        target.parent.mkdir(parents=True,exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
        report['output_blend']=str(target)
    a.report.parent.mkdir(parents=True,exist_ok=True)
    a.report.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('[Avensky] '+report['status']+' '+str(a.report),flush=True)


if __name__=='__main__':
    main()
