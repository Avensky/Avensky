#!/usr/bin/env python3
"""Structural QA for PRIVATE hair material outputs, independent of Blender."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from PIL import Image
import numpy as np


def validate(catalog_path,materials_dir):
    catalog=json.loads(Path(catalog_path).read_text(encoding='utf8'))
    styles=catalog['styles']; presets=catalog['presets']
    expected=[f'Hair_{i:02d}' for i in range(1,13)]
    assert [s['id'] for s in styles]==expected,'Expected twelve hair styles with fixed IDs'
    assert sum(s['triangles'] for s in styles)==81469,'Source source triangle-count regression'
    assert len(presets)==4
    records=[]
    for style in styles:
        id=style['id']; directory=Path(materials_dir)/id
        rect=style['rect']
        assert 0<=rect[0]<rect[2]<=2048 and 0<=rect[1]<rect[3]<=2048, (id,'invalid atlas ROI')
        colors=[]
        alpha_reference=None
        for preset in presets:
            filename=directory/f'basecolor_{preset}.png'
            assert filename.exists(),filename
            img=np.asarray(Image.open(filename).convert('RGBA'))
            assert img.shape==(1024,256,4), (filename,img.shape)
            alpha=img[:,:,3]
            if alpha_reference is None: alpha_reference=alpha.copy()
            else: assert np.array_equal(alpha,alpha_reference),(id,'Preset changes strand opacity')
            visible=alpha>128
            assert visible.sum()>400, (id,preset,'not enough hair coverage')
            colors.append(img[:,:,:3][visible].mean(axis=0))
        m=np.asarray(Image.open(directory/'normal.png').convert('RGB'))
        orm=np.asarray(Image.open(directory/'orm.png').convert('RGB'))
        assert m.shape==orm.shape==(1024,256,3),(id,'normal/ORM dimension mismatch')
        assert m[:,:,2].mean()>200,(id,'normal map not tangent-looking')
        assert np.all(orm[:,:,2]==0),(id,'metallic channel must remain zero')
        assert orm[:,:,1].min()>=90 and orm[:,:,1].max()<=195,(id,'roughness out of range')
        alpha=alpha_reference
        coverage=float(np.mean(alpha>=71))
        assert .02<coverage<.8,(id,'unreasonable coverage',coverage)
        # Every color option must materially change perceived hair color.
        for i in range(len(colors)):
            for j in range(i):
                assert np.linalg.norm(colors[i]-colors[j])>3.5,(id,'color variants appear identical')
        records.append({'id':id,'family':style['family'],'triangles':style['triangles'],
                        'alpha_coverage':round(coverage,4),
                        'mean_colors':{name:np.round(values).astype(int).tolist() for name,values in zip(presets,colors)},
                        'normal_blue_mean':round(float(m[:,:,2].mean()),1),
                        'roughness_mean':round(float(orm[:,:,1].mean()/255),3),
                        'passed':True})
    return {'status':'pass','material_styles':len(records),'color_maps':len(records)*len(presets),
            'hero_texture_resolution':[256,1024], 'source_triangles':sum(s['triangles'] for s in styles),
            'metadata_only_checks':'No rig/Blender runtime/rendering claims', 'styles':records}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--catalog',type=Path,required=True)
    ap.add_argument('--materials',type=Path,required=True)
    ap.add_argument('--output',type=Path,default=None)
    args=ap.parse_args()
    data=validate(args.catalog,args.materials)
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(data,indent=2),encoding='utf8')
    print(f"PASS {data['material_styles']} styles / {data['color_maps']} color maps / {data['source_triangles']:,} source triangles")


if __name__=='__main__': main()