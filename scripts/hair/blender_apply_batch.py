"""Apply realistic hair materials to the EXISTING fitted, skinned 12-style Blender scene.

Use Blender >=5.2:
 blender -b source/AvenLab_Fitted_Hair_Pack.blend --python scripts/blender_apply_batch.py -- \
   --materials materials --catalog hair_realism_catalog.json --output-blend Hair_Realism_12_Fitted.blend \
   --glb-dir exports --preset espresso

This preserves Vesper's source mesh geometry, skin, weights, shape keys, and
original SourceUV/StrandUV/CC_AtlasUV. It replaces material assignments and
adds HairRealismUV on each style without modifying its authored vertices.

It is an authoring script: no commercial meshes/textures are included in the
public code. Generated GLBs may include derived paid textures; do not publish
without license verification.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import sys

try:
    import bpy
except ImportError as exc:
    raise RuntimeError('Run this script using Blender 5.2+ (bpy is required)') from exc


MATERIAL_PREFIX='AVSK_REALISM_'  # distinct from source material assignments


def log(*args): print('[Avensky Hair Batch]',*args,flush=True)


def parse_args():
    argv=sys.argv
    argv=argv[argv.index('--')+1:] if '--' in argv else []
    parser=argparse.ArgumentParser()
    parser.add_argument('--materials',type=Path,required=True)
    parser.add_argument('--catalog',type=Path,required=True)
    parser.add_argument('--output-blend',type=Path,required=True)
    parser.add_argument('--glb-dir',type=Path,required=True)
    parser.add_argument('--preset',default='espresso')
    parser.add_argument('--no-export',action='store_true')
    parser.add_argument('--preview-dir',type=Path,default=None)
    parser.add_argument('--no-pack',action='store_true',help='Keep images external instead of packing')
    return parser.parse_args(argv)


def hash_mesh_geometry(mesh):
    """Cheap deterministic proof material-only change never edits accepted topology."""
    sha=hashlib.sha256()
    sha.update(struct.pack('<I',len(mesh.vertices)))
    for v in mesh.vertices: sha.update(struct.pack('<fff',float(v.co.x),float(v.co.y),float(v.co.z)))
    sha.update(struct.pack('<I',len(mesh.polygons)))
    for p in mesh.polygons:
        sha.update(struct.pack('<I',len(p.vertices)))
        for i in p.vertices: sha.update(struct.pack('<I',i))
    for uv_name in ('SourceUV_Unchanged','StrandUV','CC_AtlasUV'):
        uv_layer=mesh.uv_layers.get(uv_name)
        if not uv_layer:
            if uv_name=='StrandUV': raise RuntimeError('Required source StrandUV missing')
            continue
        sha.update(uv_name.encode('utf8'))
        for uv in uv_layer.data: sha.update(struct.pack('<ff',float(uv.uv.x),float(uv.uv.y)))
    if mesh.shape_keys:
        for key in mesh.shape_keys.key_blocks:
            sha.update(key.name.encode('utf8'))
            for v in key.data: sha.update(struct.pack('<fff',float(v.co.x),float(v.co.y),float(v.co.z)))
    return sha.hexdigest()


def strand_to_realism_uv(u, v):
    if not math.isfinite(u) or not math.isfinite(v):
        raise ValueError('Non-finite UV')
    return min(1, max(0, float(u))), min(1, max(0, 1.0-float(v)))


def mapping_to_new_uv(obj):
    mesh=obj.data
    old=mesh.uv_layers.get('StrandUV')
    if old is None: raise RuntimeError(f'{obj.name} missing repaired StrandUV')
    new=mesh.uv_layers.get('HairRealismUV') or mesh.uv_layers.new(name='HairRealismUV')
    assert len(old.data)==len(new.data)
    n_zero=0
    for i in range(len(mesh.loops)):
        u,v=old.data[i].uv
        if not math.isfinite(u) or not math.isfinite(v): raise RuntimeError('Non-finite source UV')
        # Cropped source atlas image top is rootward; reconstructed UV V=0 is rootward.
        new.data[i].uv=strand_to_realism_uv(u,v)
    for poly in mesh.polygons:
        if len(poly.loop_indices)>=3:
            a,b,c=[new.data[x].uv for x in poly.loop_indices[:3]]
            area=abs((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))
            if area<1e-10: n_zero+=1
    if n_zero:
        raise RuntimeError(f'{obj.name}: {n_zero} zero-area triangles in HairRealismUV')
    return len(mesh.loops)


def load_image(path,noncolor=False):
    if not path.is_file(): raise FileNotFoundError(path)
    image=bpy.data.images.load(str(path.resolve()),check_existing=True)
    image.colorspace_settings.name='Non-Color' if noncolor else 'sRGB'
    return image


def new_tex(mat,nodes,links,label,path,uvnode,x,y,noncolor=False):
    node=nodes.new('ShaderNodeTexImage')
    node.label=label
    node.name=label
    node.location=(x,y)
    node.image=load_image(path,noncolor=noncolor)
    node.extension='CLIP'
    links.new(uvnode.outputs['UV'],node.inputs['Vector'])
    return node


def create_material(obj,style,preset,materials_dir):
    name=f'{MATERIAL_PREFIX}{style["id"]}_{preset}'
    mat=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes=True
    if hasattr(mat,'use_backface_culling'): mat.use_backface_culling=False
    if hasattr(mat,'surface_render_method'):
        # Dithered in Blender for artist preview; exported GLB is patched to MASK.
        mat.surface_render_method='DITHERED'
    if hasattr(mat,'alpha_threshold'): mat.alpha_threshold=.28
    mat.diffuse_color=(0.35,0.29,0.24,1.0)
    nodes=mat.node_tree.nodes
    nodes.clear()
    links=mat.node_tree.links
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='HairRealismUV';uv.location=(-950,190)
    output=nodes.new('ShaderNodeOutputMaterial');output.location=(580,160)
    pbr=nodes.new('ShaderNodeBsdfPrincipled');pbr.location=(260,180)
    pbr.inputs['Metallic'].default_value=0.0
    pbr.inputs['Roughness'].default_value=0.56
    if 'Coat Weight' in pbr.inputs: pbr.inputs['Coat Weight'].default_value=0.0
    if 'IOR' in pbr.inputs: pbr.inputs['IOR'].default_value=1.47
    links.new(pbr.outputs['BSDF'],output.inputs['Surface'])
    tex_dir=materials_dir/style['id']
    rgba=new_tex(mat,nodes,links,'BasecolorOpacity',tex_dir/f'basecolor_{preset}.png',uv,-700,440)
    links.new(rgba.outputs['Color'],pbr.inputs['Base Color'])
    links.new(rgba.outputs['Alpha'],pbr.inputs['Alpha'])
    ntex=new_tex(mat,nodes,links,'StrandNormal',tex_dir/'normal.png',uv,-710,-40,noncolor=True)
    normal=nodes.new('ShaderNodeNormalMap')
    normal.location=(-170,-60)
    normal.inputs['Strength'].default_value=0.37
    links.new(ntex.outputs['Color'],normal.inputs['Color'])
    links.new(normal.outputs['Normal'],pbr.inputs['Normal'])
    orm=new_tex(mat,nodes,links,'HairORM',tex_dir/'orm.png',uv,-715,-380,noncolor=True)
    separate=nodes.new('ShaderNodeSeparateColor');separate.location=(-230,-335)
    links.new(orm.outputs['Color'],separate.inputs['Color'])
    links.new(separate.outputs['Green'],pbr.inputs['Roughness'])
    mat['avsk_source']='derived-from-user-provided-CURLY-HAIR-SET'
    mat['avsk_redistribution']='RESTRICTED: license review required before publishing'
    mat['avsk_alpha_cutoff']=0.28
    return mat


def edit_glb_alpha(path):
    """Guarantee glTF MASK and double-sided regardless of Blender version's preview method."""
    raw=path.read_bytes()
    if raw[:4]!=b'glTF': raise RuntimeError(f'Invalid glTF binary: {path}')
    magic,version,length=struct.unpack_from('<4sII',raw,0)
    if version!=2 or length!=len(raw): raise RuntimeError('Bad glTF header')
    pos=12;chunks=[]
    while pos<len(raw):
        chunk_len,chunk_type=struct.unpack_from('<I4s',raw,pos);pos+=8
        contents=raw[pos:pos+chunk_len]
        if len(contents)!=chunk_len:raise RuntimeError('Truncated GLB chunk')
        chunks.append((chunk_type,contents));pos+=chunk_len
    if pos!=len(raw):raise RuntimeError('Bad GLB boundaries')
    obj=json.loads(next(payload for ctype,payload in chunks if ctype==b'JSON'))
    patched=0
    for mat in obj.get('materials',[]):
        if not mat.get('name','').startswith(MATERIAL_PREFIX): continue
        mat['alphaMode']='MASK'
        mat['alphaCutoff']=0.28
        mat['doubleSided']=True
        mat.setdefault('pbrMetallicRoughness',{})['metallicFactor']=0.0
        patched+=1
    if not patched: raise RuntimeError('Exported GLB has no realism material')
    jsonraw=json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode('utf8')
    jsonraw+=b' '*((-len(jsonraw))%4)
    out=bytearray(struct.pack('<4sII',b'glTF',2,0))
    for ctype,payload in chunks:
        if ctype==b'JSON':payload=jsonraw
        out.extend(struct.pack('<I4s',len(payload),ctype));out.extend(payload)
    struct.pack_into('<I',out,8,len(out))
    path.write_bytes(out)
    return patched,obj


def export_one(obj,output):
    saved=[(other,other.select_get(),other.hide_get(),other.hide_render) for other in bpy.data.objects]
    try:
        for other,*_ in saved:other.select_set(False)
        selected=[obj]
        arm=obj.find_armature()
        if arm is None:
            arm=next((a for a in bpy.data.objects if a.type=='ARMATURE' and (obj.parent==a)),None)
        if arm: selected.append(arm)
        for o in selected:
            o.hide_set(False);o.hide_render=False;o.select_set(True)
        bpy.context.view_layer.objects.active=obj
        # Preserve shape keys; disable animations to avoid exporting huge idle clips.
        kwargs=dict(filepath=str(output),export_format='GLB',use_selection=True,
                    export_animations=False,export_morph=True,export_skins=True,
                    export_materials='EXPORT',export_vertex_color='NONE')
        try:bpy.ops.export_scene.gltf(**kwargs)
        except TypeError as exc:
            raise RuntimeError('Check glTF exporter options for current Blender; DO NOT silently export legacy HairTint as COLOR_0') from exc
    finally:
        for o,sel,hidden,hidden_render in saved:
            o.select_set(False)
            o.hide_set(hidden);o.hide_render=hidden_render
            if sel:o.select_set(True)
    patched,json_glb=edit_glb_alpha(output)
    return {'glb':str(output),'bytes':output.stat().st_size,'materials_patched':patched,
            'meshes':len(json_glb.get('meshes',[])),'skins':len(json_glb.get('skins',[]))}


def main():
    args=parse_args()
    cat=json.loads(args.catalog.read_text(encoding='utf8'))
    if len(cat.get('styles',[]))!=12:raise ValueError('Catalog must describe exactly 12 styles')
    if args.preset not in cat['presets']:raise ValueError('Invalid color preset: '+args.preset)
    materials=args.materials.resolve()
    args.output_blend.parent.mkdir(parents=True,exist_ok=True)
    args.glb_dir.mkdir(parents=True,exist_ok=True)
    source_results=[]
    before={}
    for style in cat['styles']:
        obj=bpy.data.objects.get(style['id'])
        if obj is None or obj.type!='MESH': raise RuntimeError(f'Missing fitted mesh {style["id"]}')
        mesh=obj.data
        mesh.calc_loop_triangles()
        count=len(mesh.loop_triangles)
        if count!=style['triangles']:
            raise RuntimeError(f'{obj.name}: {count} triangles; expected {style["triangles"]}')
        before[obj.name]=hash_mesh_geometry(mesh)
        source_results.append((style,obj))
    log('Validated all 12 fitted geometries before editing')
    result=[]
    for style,obj in source_results:
        loops=mapping_to_new_uv(obj)
        mat=create_material(obj,style,args.preset,materials)
        obj.data.materials.clear();obj.data.materials.append(mat)
        for poly in obj.data.polygons: poly.material_index=0
        after=hash_mesh_geometry(obj.data)
        if before[obj.name]!=after: raise AssertionError(f'{obj.name} geometry changed during material batch')
        result.append({'style':obj.name,'triangles':style['triangles'],
                       'material':mat.name,'uv_loop_count':loops,'unchanged_mesh_hash':after})
        log('Applied',obj.name,mat.name)
    if not args.no_pack:
        bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output_blend.resolve()),compress=True)
    log('Saved editable batch',args.output_blend)
    if not args.no_export:
        for style,obj in source_results:
            output=args.glb_dir/f'{style["id"]}_{args.preset}.glb'
            rec=export_one(obj,output)
            result[cat['styles'].index(style)]['export']=rec
            log('Exported',output)
    if args.preview_dir is not None:
        args.preview_dir.mkdir(parents=True,exist_ok=True)
        # This optionally renders each fitted mesh from the ORIGINAL saved scene camera.
        for style,obj in source_results:
            restore=[(o,o.hide_render) for o in (o for o in bpy.data.objects if o.name.startswith('Hair_'))]
            for o,_ in restore:o.hide_render=(o!=obj)
            scene=bpy.context.scene
            scene.render.filepath=str((args.preview_dir/(style['id']+'.png')).resolve())
            bpy.ops.render.render(write_still=True)
            for o,was_hidden in restore:o.hide_render=was_hidden
    report={'source_scene':bpy.data.filepath,'preset':args.preset,
            'blend':str(args.output_blend.resolve()),'all_geometry_preserved':True,
            'styles':result,'not_validated':['in-game PBR','mobile GPU performance','collar/hood/animation','licensing']}
    report_path=args.output_blend.with_suffix('.validation.json')
    report_path.write_text(json.dumps(report,indent=2),encoding='utf8')
    log('Finished batch. Validation:',report_path)

if __name__=='__main__': main()