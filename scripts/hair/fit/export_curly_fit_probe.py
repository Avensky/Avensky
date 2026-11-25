"""Blender READ-ONLY geometry probe for Vesper Curly Mane exact scalp audit.

Use a SAVED PRIVATE .blend with imported original Face4 + the actual Face
BaseColor texture and a positioned Curly_Mane candidate (same world frame).
Only scalp triangles fully inside manually painted AV_ScalpRegion are used.
No GLB, mesh write, local root fitting or donor textures exported.

The NPZ contains source-derived proprietary coordinates: keep it PRIVATE.
By default, roots must be painted in AV_RootWeight (1.0 band per curl).
For review ONLY, --allow-heuristic-roots guesses the physically higher
longitudinal UV end of long curls. It is NOT accepted root identity.

Example:
 blender -b /private/vesper-curly-aligned.blend \
  --python scripts/hair/fit/export_curly_fit_probe.py -- \
  --meters-per-unit 1 --head Face4 --hair AVFIT_CurlyMane_GLOBAL_PREVIEW \
  --allow-heuristic-roots \
  --out /private/curly/after-probe.npz --report /private/curly/export.json
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


def args_parse():
    a=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--head',default='Face4')
    p.add_argument('--hair',default='Curly_Mane')
    p.add_argument('--scalp-group',default='AV_ScalpRegion')
    p.add_argument('--root-group',default='AV_RootWeight')
    p.add_argument('--allow-heuristic-roots',action='store_true')
    p.add_argument('--meters-per-unit',required=True,type=float)
    p.add_argument('--up',default='0,0,1',help='Verified world UP; Blender usually 0,0,1')
    p.add_argument('--out',required=True,type=Path)
    p.add_argument('--report',required=True,type=Path)
    return p.parse_args(a)


def ensure_actual_texture(obj):
    for m in obj.data.materials:
        if m and m.use_nodes:
            for node in m.node_tree.nodes:
                if node.type=='TEX_IMAGE' and node.image and Path(bpy.path.abspath(node.image.filepath)).name=='T_Villager_Lady_Face_BaseColor.tga':
                    path=Path(bpy.path.abspath(node.image.filepath))
                    if not path.is_file():
                        raise FileNotFoundError('Original Face BaseColor not found on disk: '+str(path))
                    return path
    raise ValueError('Original Face_BaseColor texture not mapped on Face4; do not use a synthetic cap')


def group_array(obj,name):
    g=obj.vertex_groups.get(name)
    if g is None:return None
    arr=np.zeros(len(obj.data.vertices))
    for v in obj.data.vertices:
        try:arr[v.index]=g.weight(v.index)
        except RuntimeError:pass
    return arr


def groups_from_edges(n,edges):
    parent=np.arange(n)
    def find(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]]
            i=parent[i]
        return i
    for edge in edges:
        a,b=map(int,edge)
        parent[find(a)]=find(b)
    d={}
    for i in range(n):d.setdefault(find(i),[]).append(i)
    return list(d.values())


def sample_roots(hair,up,painted,allow_heuristic,meters_per_unit):
    xyz=np.asarray([tuple(hair.matrix_world @ v.co) for v in hair.data.vertices],float)
    uv=np.zeros((len(xyz),2));counts=np.zeros(len(xyz),int)
    layer=hair.data.uv_layers.active
    if layer is None:raise ValueError('Curly Mane source UV missing')
    for loop in hair.data.loops:
        idx=loop.vertex_index
        uv[idx]+=np.asarray(layer.data[loop.index].uv)
        counts[idx]+=1
    if (counts==0).any():raise ValueError('Missing original UV for some donor vertices')
    uv/=counts[:,None]
    islands=groups_from_edges(len(xyz),[e.vertices for e in hair.data.edges])
    roots=[];island_ids=[];review=[]
    if allow_heuristic:
        painted=None  # Explicit provisional evidence opt-in; do not silently assume.
    for k,verts in enumerate(islands):
        ix=np.asarray(verts,int)
        if painted is not None:
            selected=ix[painted[ix]>=.75]
            if len(selected)<2:
                review.append({'island':k,'status':'PAINTED_ROOT_MISSING'});continue
            root=np.median(xyz[selected],axis=0)
        else:
            if not allow_heuristic:
                raise ValueError('Donor AV_RootWeight missing. Paint true roots or explicitly opt in to provisional --allow-heuristic-roots')
            v=uv[ix,1];span=float(np.ptp(v))
            if span < .025:
                review.append({'island':k,'status':'UV_V_UNCERTAIN'});continue
            pos=(v-np.min(v))/span
            end0=xyz[ix[pos<.14]];end1=xyz[ix[pos>.86]]
            if min(len(end0),len(end1))<2:
                review.append({'island':k,'status':'UV_END_TOO_SMALL'});continue
            c0=np.median(end0,axis=0);c1=np.median(end1,axis=0)
            if abs(float((c1-c0)@up)) < .07 / meters_per_unit:
                review.append({'island':k,'status':'HEIGHT_SPAN_UNCERTAIN'});continue
            root=c1 if (c1-c0)@up>0 else c0
        roots.append(root);island_ids.append(k)
    if len(roots)<12:raise ValueError('Insufficient painted or provisional root centers')
    return np.asarray(roots),np.asarray(island_ids,int),len(islands),review


def digest(path):
    d=hashlib.sha256()
    with path.open('rb') as f:
        for data in iter(lambda:f.read(1024*1024),b''):d.update(data)
    return d.hexdigest()


def main():
    args=args_parse()
    if not args.meters_per_unit>0 or not math.isfinite(args.meters_per_unit):
        raise ValueError('Verify meters per world unit')
    up=np.asarray([float(x) for x in args.up.split(',')],float)
    if up.shape!=(3,) or not np.isfinite(up).all() or np.linalg.norm(up)<.9:
        raise ValueError('Expected verified 3D UP vector')
    up/=np.linalg.norm(up)
    source=Path(bpy.data.filepath).resolve()
    if not source.is_file():raise ValueError('A saved private original-source workbench is required')
    head=bpy.data.objects.get(args.head);hair=bpy.data.objects.get(args.hair)
    if not head or head.type!='MESH' or not hair or hair.type!='MESH' or head==hair:
        raise ValueError('Missing original Face4 or actual Curly Mane preview mesh')
    texture=ensure_actual_texture(head)
    scalp=group_array(head,args.scalp_group)
    if scalp is None:raise ValueError('Approve scalp group on real Face4 first')
    verts=np.asarray([tuple(head.matrix_world @ v.co) for v in head.data.vertices],float)
    if hasattr(head.data, 'calc_loop_triangles'):
        head.data.calc_loop_triangles()
    triangles=np.asarray([tuple(t.vertices) for t in head.data.loop_triangles
                          if np.all(scalp[list(t.vertices)]>=.5)],int)
    if triangles.ndim!=2 or len(triangles)<64:
        raise ValueError('Fewer than 64 approved Face4 scalp triangles; inspect selection')
    dims=np.ptp(verts,axis=0)*args.meters_per_unit
    if min(dims)<.085 or max(dims)>.4:
        raise ValueError('Implausible Face4 physical bounds; check FBX import unit and rotation')
    root_weights=group_array(hair,args.root_group)
    roots,island_ids,total_islands,skipped=sample_roots(
        hair,up,root_weights,args.allow_heuristic_roots,args.meters_per_unit)
    output=args.out.resolve()
    reportpath=args.report.resolve()
    if output.suffix.lower()!='.npz' or output.exists() or reportpath.exists():
        raise ValueError('Output/report paths must be NEW and private; never overwrite evidence')
    output.parent.mkdir(parents=True,exist_ok=True)
    # Contains original proprietary source-derived geometry: NEVER commit NPZ publicly.
    np.savez_compressed(output,scalp_vertices=verts,scalp_triangles=triangles,
        roots_xyz=roots,root_island_ids=island_ids,
        meters_per_unit=np.array(args.meters_per_unit))
    summary={
        'kind':'VESPER_CURLY_TRUE_SCALP_TRIANGLES','scene_sha256':digest(source),
        'face_basecolor_sha256':digest(texture),
        'source_blend':str(source),'private_npz':str(output),
        'scalp_triangles':int(len(triangles)),
        'total_curl_islands':total_islands,'root_candidates':len(roots),
        'root_selection':'REVIEW_ONLY_UPPER_UV_HEURISTIC' if args.allow_heuristic_roots else 'PAINTED_ROOT_GROUP_REQUIRES_AUTHOR_APPROVAL',
        'skipped_roots':skipped,'meters_per_unit':args.meters_per_unit,
        'head_bounds_m':dims.tolist(),'original_assets_changed':False,
        'not_visual_coverage':True,'source_texture_preserved':True,'accepted_for_release':False}
    reportpath.parent.mkdir(parents=True,exist_ok=True)
    reportpath.write_text(json.dumps(summary,indent=2),encoding='utf-8')
    print('[Hair] Private read-only measurement export completed: '+str(output))


if __name__=='__main__':main()
