"""Render private Vesper head poses and audit opacity at cheek/collar intersections."""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_curly_fit_probe import digest, ensure_actual_texture
from pose_hair_clearance import intersection_uv, linear_opacity
import render_curly_coverage as qa

HAIR = (
    "AVFIT_CurlyMane_PROFILE_POLISH", "AVFIT_CurlyMane_CROWN_BACK_INSERT_REVIEW",
    "AVFIT_CurlyMane_HAIRLINE_REVIEW", "AVFIT_CurlyMane_TEMPLE_POLISH",
)
BONES = ("neck_01", "neck_02", "head")
PREVIEWS = (
    ("neutral-stock", 0, 0, 0, "neutral", "stock", (.6,-1,.12)),
    ("neutral-high", 0, 0, 0, "neutral", "high", (-.75,-1,.10)),
    ("turn-left-smile", -38, 0, 0, "smile", "high", (.10,-1,.12)),
    ("turn-right-smile", 38, 0, 0, "smile", "high", (-.10,-1,.12)),
    ("look-down-puff", 0, 23, 0, "cheek-puff", "high", (.90,-1,.15)),
    ("look-up-jaw", 0, -19, 0, "jaw-open", "high", (-1,-.75,.13)),
    ("turn-tilt-puff", -32, 13, 12, "cheek-puff", "high", (.87,-1,.10)),
    ("turn-down-collar", 32, 17, -9, "neutral", "high", (-1,.34,.08)),
)


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hero", required=True, type=Path)
    parser.add_argument("--collar", required=True, type=Path)
    parser.add_argument("--diffuse", required=True, type=Path)
    parser.add_argument("--opacity", required=True, type=Path)
    parser.add_argument("--normal", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--samples", type=int, default=28)
    parser.add_argument("--threads", type=int, default=10)
    parser.add_argument("--metrics-only", action="store_true")
    parser.add_argument("--preview-only", action="store_true")
    return parser.parse_args(sys.argv[sys.argv.index("--")+1:])


def import_glb(path):
    old = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    return {obj.name.split(".")[0]: obj for obj in bpy.context.scene.objects if obj not in old}


def world_bone(rig, name):
    return rig.matrix_world @ rig.pose.bones[name].matrix


def set_pose(rig, yaw, pitch, roll):
    for name in BONES:
        rig.pose.bones[name].matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    for name, fraction in (("neck_02", .28), ("head", .72)):
        bone = rig.pose.bones[name]
        basis = world_bone(rig,name)
        center = Matrix.Translation(basis.translation)
        turn = (Matrix.Rotation(math.radians(yaw*fraction),4,"Z")
                @ Matrix.Rotation(math.radians(pitch*fraction),4,"X")
                @ Matrix.Rotation(math.radians(roll*fraction),4,"Y"))
        bone.matrix = rig.matrix_world.inverted() @ center @ turn @ center.inverted() @ basis
        bpy.context.view_layer.update()


def positions(obj):
    return np.array([tuple(obj.matrix_world @ vertex.co) for vertex in obj.data.vertices])


def triangles(mesh):
    mesh.calc_loop_triangles()
    return np.array([tuple(tri.vertices) for tri in mesh.loop_triangles],dtype=int)


def evaluated_positions(obj):
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(graph)
    return positions(evaluated)


def transformed(points, matrix):
    matrix=np.asarray(matrix)
    return points @ matrix[:3,:3].T + matrix[:3,3]


def stress_expression(points, expression):
    """Private smooth stress deformations on original Face4; no runtime morphs."""
    result=points.copy()
    if expression=="neutral":
        return result
    x,y,z=points.T
    x_abs=np.abs(x)
    def bell(cx,cy,cz,sx,sy,sz):
        return np.exp(-((x_abs-cx)/sx)**2-((y-cy)/sy)**2-((z-cz)/sz)**2)
    if expression=="smile":
        corners=bell(.025,-.092,1.516,.013,.028,.014)
        cheek=bell(.045,-.076,1.544,.018,.028,.019)
        result[:,0]+=np.sign(x)*(.0038*corners+.0017*cheek)
        result[:,2]+=.0055*corners+.0022*cheek
        result[:,1]-=.002*cheek
    elif expression=="cheek-puff":
        cheek=bell(.044,-.074,1.543,.024,.032,.026)
        result[:,0]+=np.sign(x)*.005*cheek
        result[:,1]-=.0035*cheek
    elif expression=="jaw-open":
        lower=bell(.012,-.095,1.500,.036,.026,.013)
        result[:,2]-=.007*lower
        result[:,1]+=.002*lower
    else:
        raise ValueError("Unknown pose stress expression")
    return result


def cheek_masks(head, neutral):
    t=triangles(head.data)
    uv=head.data.uv_layers.active
    center=neutral[t].mean(1)
    sample=np.array([[tuple(uv.data[i].uv) for i in tr.loops]
                     for tr in head.data.loop_triangles]).mean(1)
    u,v=sample.T
    is_face=np.array([head.data.materials[tr.material_index].name.split(".")[0]=="Face"
                      for tr in head.data.loop_triangles])
    cheek=(is_face & (((u>=.245)&(u<=.445))|((u>=.555)&(u<=.755)))
           & (v>=.29)&(v<=.48)&(center[:,1]<-.046)&(np.abs(center[:,0])>.023))
    return t, {"cheek_left":cheek&(center[:,0]>0),"cheek_right":cheek&(center[:,0]<0)}


def outfit_region(obj, minimum_z):
    p,t=positions(obj),triangles(obj.data)
    return t[p[t,2].max(1)>=minimum_z]


class ContactAudit:
    def __init__(self, donors, opacity):
        vertices, faces, uv, layer=[],[],[],[]
        offset=0
        for obj in donors:
            points=positions(obj)
            vertices.append(points)
            idx=triangles(obj.data)
            faces.append(idx+offset)
            uv.append(np.array([[tuple(obj.data.uv_layers.active.data[i].uv) for i in tri.loops]
                                for tri in obj.data.loop_triangles]))
            layer.extend([obj.name]*len(idx))
            offset+=len(points)
        self.vertices=np.concatenate(vertices)
        self.faces=np.concatenate(faces)
        self.uv=np.concatenate(uv)
        self.layers=np.array(layer)
        self.tree=BVHTree.FromPolygons(self.vertices.tolist(),self.faces.tolist(),all_triangles=True)
        tex=bpy.data.images.load(str(opacity.resolve()),check_existing=True)
        tex.colorspace_settings.name="Non-Color"
        values=np.empty(len(tex.pixels),dtype=np.float32)
        tex.pixels.foreach_get(values)
        self.opacity=values.reshape(tex.size[1],tex.size[0],tex.channels)[:,:,0]

    def measure(self, points, faces, inverse):
        if not len(faces):
            raise ValueError("Empty contact region")
        points=transformed(points,inverse)
        tree=BVHTree.FromPolygons(points.tolist(),faces.tolist(),all_triangles=True)
        hits=self.tree.overlap(tree)
        count, maxima, ids=0,[],set()
        for a,b in hits:
            coords=intersection_uv(self.vertices[self.faces[a]],points[faces[b]],self.uv[a])
            if not len(coords):
                continue
            count+=1
            strongest=float(linear_opacity(self.opacity,coords).max())
            maxima.append(strongest)
            if strongest>=.5:
                ids.add(a)
        return {
            "triangle_intersection_pairs":count,
            "pairs_with_opacity_at_least_half":sum(x>=.5 for x in maxima),
            "pairs_with_opacity_at_least_quarter":sum(x>=.25 for x in maxima),
            "distinct_half_opacity_hair_triangles":len(ids),
            "max_opacity":max(maxima,default=0.),
            "half_opacity_layers":sorted({self.layers[i] for i in ids}),
        }


def bake(scene, obj):
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,
                                         depsgraph=bpy.context.evaluated_depsgraph_get())
    clone=bpy.data.objects.new(obj.name+" pose",data)
    scene.collection.objects.link(clone)
    clone.matrix_world=evaluated.matrix_world
    return clone


def render_pose(scene,camera,args,head,donors,head_delta,objects,skin,pose,out):
    clones=[]
    try:
        head_clone=bake(scene,head)
        clones.append(head_clone)
        qa.head_materials(head_clone,skin)
        clones.extend(bake(scene,obj) for obj in objects)
        for donor in donors:
            clone=qa.mesh_copy(scene,donor)
            clones.append(clone)
            clone.matrix_world=head_delta @ donor.matrix_world
            clone.data.materials.clear()
            clone.data.materials.append(qa.hair_material(args,clone.data.uv_layers.active.name,mask=False))
            for polygon in clone.data.polygons:
                polygon.material_index=0
        direction=Vector(pose[-1]).normalized()
        center=Vector((0,-.012,1.478))
        camera.location=center+direction*1.85
        camera.rotation_euler=direction.to_track_quat("Z","Y").to_euler()
        camera.data.ortho_scale=.486
        camera.data.clip_end=10
        qa.capture(scene,out)
    finally:
        for clone in clones:
            data=clone.data
            bpy.data.objects.remove(clone,do_unlink=True)
            bpy.data.meshes.remove(data)


def main():
    args=arguments()
    src=Path(bpy.data.filepath)
    if not src.is_file():
        raise ValueError("Open the saved private polished Curly Mane review")
    if args.out_dir.exists():
        raise ValueError("Use a new private output folder")
    args.out_dir.mkdir(parents=True)
    args.out_dir=args.out_dir.resolve()
    head=bpy.data.objects["Face4"]
    skin=ensure_actual_texture(head)
    source_rig=head.find_armature()
    donors=[bpy.data.objects[name] for name in HAIR]
    hero=import_glb(args.hero)
    collar=import_glb(args.collar)
    body=hero["BODY_OUTFIT_CUT"]
    sleeves=hero["CLOTH_ARMS_SLEEVES"]
    stock=hero["CLOTH_TOP_CORSET"]
    high=collar["CLOTH_CORSET_OVER"]
    rigs=(source_rig,body.find_armature(),high.find_armature())
    if any(rig is None for rig in rigs):
        raise ValueError("Vesper source, body and collar need their original rigs")
    bpy.context.view_layer.update()
    rest=world_bone(source_rig,"head")
    offsets=[float((world_bone(rig,name).translation-world_bone(source_rig,name).translation).length)
              for rig in rigs[1:] for name in BONES]
    if max(offsets)>.001:
        raise ValueError("The body and collar are not registered to the Vesper neck chain")
    neutral=positions(head)
    neutral_local=np.array([tuple(v.co) for v in head.data.vertices],dtype=np.float32)
    local_inverse=head.matrix_world.inverted()
    tf,cheeks=cheek_masks(head,neutral)
    garment_regions=(("stock_neckline",stock,outfit_region(stock,1.32)),
                     ("high_collar",high,outfit_region(high,1.34)))
    contact=ContactAudit(donors,args.opacity)
    scene,camera,_=qa.create_scene(args,(0,-.014,1.51),.27)
    scene.world.node_tree.nodes.get("Background").inputs["Color"].default_value=(.22,.22,.22,1)
    scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value=.42
    scene.cycles.use_denoising=True
    poses=[*PREVIEWS]
    if not args.preview_only:
        poses += [(f"yaw-{yaw:+}",yaw,0,0,"neutral","high",None)
                  for yaw in range(-45,46,5)]
        poses += [(f"pitch-{pitch:+}",0,pitch,0,"neutral","high",None)
                  for pitch in range(-20,26,5)]
        poses += [(f"turn-down-{yaw:+}",yaw,17,0,"cheek-puff","high",None)
                  for yaw in range(-40,41,10)]
    report={"blender":bpy.app.version_string,"inputs_sha256":{name:digest(path) for name,path in
            (("fit_scene",src),("vesper_hero",args.hero),("high_collar",args.collar),
             ("face_basecolor",skin),("curls_opacity",args.opacity))},
            "rig_modes":"actual Vesper bone chain and head attachment; authored static Face4 stress expressions",
            "max_registered_neck_bone_offset_m":max(offsets),
            "head_morph_targets":bool(head.data.shape_keys),
            "contact_cutoff":.5,"hair_triangles":len(contact.faces),
            "cheek_triangles":{name:int(mask.sum()) for name,mask in cheeks.items()},
            "garment_triangles":{name:int(len(region)) for name,_,region in garment_regions},
            "poses":[]}
    for pose in poses:
        label,yaw,pitch,roll,expression,outfit,direction=pose
        local=neutral_local if expression=="neutral" else transformed(stress_expression(neutral,expression),local_inverse)
        head.data.vertices.foreach_set("co",np.asarray(local,dtype=np.float32).ravel())
        head.data.update()
        for rig in rigs:
            set_pose(rig,yaw,pitch,roll)
        delta=world_bone(source_rig,"head") @ rest.inverted()
        inverse=delta.inverted()
        face=evaluated_positions(head)
        metrics={name:contact.measure(face,tf[mask],inverse) for name,mask in cheeks.items()}
        for name,garment,region in garment_regions:
            metrics[name]=contact.measure(evaluated_positions(garment),region,inverse)
        row={"name":label,"yaw_deg":yaw,"pitch_down_deg":pitch,"roll_deg":roll,
             "expression":expression,"outfit":outfit,"contact":metrics}
        report["poses"].append(row)
        print(label,{k:v["pairs_with_opacity_at_least_half"] for k,v in metrics.items()},flush=True)
        if direction and not args.metrics_only:
            garment=stock if outfit=="stock" else high
            render_pose(scene,camera,args,head,donors,delta,(body,sleeves,garment),skin,pose,args.out_dir/(label+".png"))
    (args.out_dir/"pose-clearance-report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")


if __name__=="__main__":
    main()
