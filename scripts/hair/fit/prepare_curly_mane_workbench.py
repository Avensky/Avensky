"""Prepare a PRIVATE comparison scene from original Face4, real skin TGA and CURLY 01.

No caps, default scalp recoloring, approximated alignments or proprietary assets
are committed or exported. Output MUST be a new .blend, never an original file.

Example:
 blender -b --python scripts/hair/fit/prepare_curly_mane_workbench.py -- \
   --face-fbx /private/SK_Village_Lady_Face4.fbx \
   --face-basecolor /private/T_Villager_Lady_Face_BaseColor.tga \
   --hair-fbx "/private/CURLY 01.FBX" \
   --report /private/curly/workbench.json \
   --out-blend /private/curly/vesper-curly-workbench.blend
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys
import bpy


def args_parse():
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--face-fbx',required=True,type=Path)
    p.add_argument('--face-basecolor',required=True,type=Path)
    p.add_argument('--hair-fbx',required=True,type=Path)
    p.add_argument('--hair-albedo',type=Path,help='Optional source Curls albedo from same vendor atlas')
    p.add_argument('--report',required=True,type=Path)
    p.add_argument('--out-blend',required=True,type=Path)
    return p.parse_args(args)


def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):
            h.update(b)
    return h.hexdigest()


def import_fbx(path):
    original=set(bpy.data.objects.keys())
    bpy.ops.import_scene.fbx(filepath=str(path))
    return [o for o in bpy.data.objects if o.name not in original]


def find_mesh(objects,name):
    matches=[o for o in objects if o.type=='MESH' and (o.name==name or o.name.startswith(name+'.'))]
    if len(matches)!=1:
        raise ValueError('Expected one '+name+' mesh; imported '+str([o.name for o in objects if o.type=='MESH']))
    return matches[0]


def connect_original_skin(head,path):
    mats=[m for m in head.data.materials if m and (m.name=='Face' or m.name.startswith('Face.'))]
    if len(mats)!=1:
        raise ValueError('Original Face material not uniquely identifiable')
    mat=mats[0]
    mat.use_nodes=True
    bsdf=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if not bsdf:
        raise ValueError('No Principled BSDF on original Face material')
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.label='AV_SOURCE_FACE_BASECOLOR'
    tex.image=bpy.data.images.load(str(path),check_existing=True)
    tex.image.colorspace_settings.name='sRGB'
    mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    return mat.name


def connect_donor_albedo(hair,path):
    if path is None:
        return None
    # Donor Curls atlas on donor Curls UVs only; don't map it onto Vesper.
    for mat in hair.data.materials:
        if not mat:
            continue
        mat.use_nodes=True
        bsdf=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
        if bsdf:
            tex=mat.node_tree.nodes.new('ShaderNodeTexImage')
            tex.label='AV_SOURCE_CURLS_ALBEDO'
            tex.image=bpy.data.images.load(str(path),check_existing=True)
            mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    return path.name


def main():
    a=args_parse()
    inputs=[a.face_fbx,a.face_basecolor,a.hair_fbx]+([a.hair_albedo] if a.hair_albedo else [])
    for p in inputs:
        if not p.is_file():
            raise FileNotFoundError(p)
    if a.face_basecolor.name!='T_Villager_Lady_Face_BaseColor.tga':
        raise ValueError('Use real Face BaseColor TGA, not Face_BaseColor_ID or colored substitute')
    if a.face_fbx.suffix.lower()!='.fbx' or a.hair_fbx.suffix.lower()!='.fbx':
        raise ValueError('Input head and hair must be the original FBX files')
    output=a.out_blend.resolve()
    if output.suffix.lower()!='.blend' or output.exists() or output in [p.resolve() for p in inputs]:
        raise ValueError('Output must be a NEW .blend; original source cannot be overwritten')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    face=find_mesh(import_fbx(a.face_fbx.resolve()),'Face4')
    material=connect_original_skin(face,a.face_basecolor.resolve())
    hair=find_mesh(import_fbx(a.hair_fbx.resolve()),'Curly_Mane')
    if not face.data.uv_layers or not hair.data.uv_layers:
        raise ValueError('Missing Face4 or Curly Mane source UVs')
    albedo=connect_donor_albedo(hair,a.hair_albedo.resolve() if a.hair_albedo else None)
    # Both groups start empty if absent, so no unsupported root positions are guessed.
    if not face.vertex_groups.get('AV_ScalpRegion'):
        face.vertex_groups.new(name='AV_ScalpRegion')
    if not hair.vertex_groups.get('AV_RootWeight'):
        hair.vertex_groups.new(name='AV_RootWeight')
    face['avensky_role']='ORIGINAL_FACE4_WITH_REAL_FACE_BASECOLOR'
    hair['avensky_role']='ORIGINAL_CURLY_MANE_DONOR_UNFITTED'
    bpy.context.view_layer.update()
    receipt={
        'kind':'Vesper-Curly-Mane-workbench','status':'UNFITTED_SOURCE_COMPARISON',
        'source_hashes':{p.name:sha(p) for p in inputs},
        'face_object':face.name,'hair_object':hair.name,
        'face_vertices':len(face.data.vertices),'hair_vertices':len(hair.data.vertices),
        'face_material':material,'hair_albedo':albedo,
        'face_uvs':[v.name for v in face.data.uv_layers],
        'hair_uvs':[v.name for v in hair.data.uv_layers],
        'head_armature':face.find_armature().name if face.find_armature() else None,
        'hair_armature':hair.find_armature().name if hair.find_armature() else None,
        'root_fit_performed':False,'source_changed':False,
        'glb_exported':False,'approved':False,'blender':bpy.app.version_string,
        'next':['Verify import units and scene axes',
                'Check donor roots against Face4 in textured 3D viewport',
                'Create five paired AV_SRC_* and AV_DST_* landmark Empties',
                'Paint only authentic AV_RootWeight roots and AV_ScalpRegion target',
                'Run pilot_curly_mane.py inspect then align then conform']
    }
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
    a.report.parent.mkdir(parents=True,exist_ok=True)
    a.report.write_text(json.dumps(receipt,indent=2),encoding='utf-8')
    print('[Avensky] Wrote private, UNFITTED Curly Mane workbench:',output,flush=True)


if __name__=='__main__':
    main()
