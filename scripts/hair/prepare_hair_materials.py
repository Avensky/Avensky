#!/usr/bin/env python3
"""Build PRIVATE hair-card RGBA/normal/ORM textures for all twelve fitted styles.

Run: python scripts/prepare_hair_materials.py --curly-zip 'CURLY HAIR SET.zip' --output DIR
This program includes no vendor bytes; vendor source archive is supplied locally.

The output RGBA is tinted in sRGB space as an artist preset, *not* a physically
calibrated dye. Evaluate final colors under game lighting before acceptance.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile
import numpy as np
from PIL import Image, ImageDraw, ImageFont

COLOR_PRESETS = {
    "espresso": {"label": "Espresso", "base": "#4c382b", "roots": "#211814", "highlights": "#745444", "tips": "#594336"},
    "dark_auburn": {"label": "Dark Auburn", "base": "#5a342c", "roots": "#2b1a17", "highlights": "#98604a", "tips": "#7b4835"},
    "ash_brown": {"label": "Ash Brown", "base": "#6c625c", "roots": "#3a3431", "highlights": "#958882", "tips": "#80756e"},
    "caramel_balayage": {"label": "Caramel Balayage", "base": "#69513e", "roots": "#2b211b", "highlights": "#ad8357", "tips": "#c49a68"},
}

# The source has six clear top-row and six lower-row columns on the Straight atlas.
# Rectangles are defined in top-left pixels of the original 2048x2048 texture and
# include a small dark border to make repeating filters safe. The mapping is
# intentionally style-specific, preserving the geometric hair direction.
STYLES = [
    dict(id="Hair_01", label="Side-swept short", family="Straight", rect=[735,98,930,1023], triangles=4029, priority=2),
    dict(id="Hair_02", label="Curved bob", family="Straight", rect=[1220,92,1450,1023], triangles=4423, priority=2),
    dict(id="Hair_03", label="Two braids", family="Straight", rect=[522,100,718,1023], triangles=6980, priority=2),
    dict(id="Hair_04", label="Short with bangs", family="Straight", rect=[1496,92,1664,1023], triangles=4397, priority=3),
    dict(id="Hair_05", label="Rounded bob", family="Straight", rect=[318,94,524,1023], triangles=5284, priority=2),
    dict(id="Hair_06", label="Straight with bangs", family="Straight", rect=[320,96,525,1023], triangles=5561, priority=2),
    dict(id="Hair_07", label="Long waves", family="Straight", rect=[953,1082,1180,2035], triangles=7978, priority=1),
    dict(id="Hair_08", label="Bob with long back", family="Straight", rect=[325,1028,540,2045], triangles=6731, priority=2),
    dict(id="Hair_09", label="Swept short", family="Straight", rect=[520,103,722,1023], triangles=7862, priority=3),
    dict(id="Hair_10", label="Asymmetric bob", family="Straight", rect=[973,100,1180,1023], triangles=4252, priority=3),
    dict(id="Hair_11", label="Flipped curls", family="Curls", rect=[458,1040,647,2045], triangles=15573, priority=1),
    dict(id="Hair_12", label="Long with bangs", family="Straight", rect=[735,98,930,1023], triangles=8399, priority=1),
]

SIZES = {"hero":(256,1024), "preview-mobile":(128,512)}  # texture size only; mobile geometry LOD not provided


def rgb(h):
    return np.array([int(h[i:i+2],16) for i in (1,3,5)],np.float32)


def read_png(z, family, name):
    key=f"CURLY SET/Hair Textures/{family}/{name}"
    with z.open(key) as f:
        return Image.open(io.BytesIO(f.read())).convert("RGB")


def sha(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for b in iter(lambda:f.read(1024*1024),b""):
            h.update(b)
    return h.hexdigest()


def crop_resize(image, rect, size, interpolation=Image.Resampling.BILINEAR):
    return np.asarray(image.crop(tuple(rect)).resize(size, interpolation),np.float32)


def make_maps(style, source, out, preview_mobile=False):
    family=style['family']; roi=style['rect']
    size = SIZES['preview-mobile'] if preview_mobile else SIZES['hero']
    target=out/style['id']
    if preview_mobile: target=target/'preview-mobile-textures'
    target.mkdir(parents=True,exist_ok=True)
    mask=crop_resize(source[family]['OPACITY'],roi,size)[:,:,0].astype(np.float32)
    diffuse=crop_resize(source[family]['DIFFUSE'],roi,size).mean(axis=2)
    roughness=crop_resize(source[family]['ROUGHNESS'],roi,size)[:,:,0]
    occlusion=crop_resize(source[family]['AO'],roi,size)[:,:,0]
    normal=crop_resize(source[family]['NORMAL'],roi,size).astype(np.uint8)
    h,w=mask.shape
    # The UV island's StrandUV V=0 is rootward; the atlas's first scanline is rootward.
    # Keep zero-coverage pixels transparent; alpha halo tests use MASK, not BLEND.
    alpha=np.power(np.clip((mask-2.5) / (255-2.5), 0, 1), 1.04)
    alpha_u8=np.clip(alpha*255,0,255).astype(np.uint8)
    y=np.arange(h,dtype=np.float32).reshape(h,1)/max(1,h-1)
    root_w=np.power(np.clip((0.43-y)/0.43,0,1),1.5)*0.68
    tip_w=np.power(np.clip((y-0.60)/0.40,0,1),1.3)*0.72
    active=diffuse[mask>24]
    p15,p85=np.percentile(active,[15,85]) if active.size else (36,120)
    span=max(float(p85-p15),20)
    # Hair strand pigment is subtly mottled; do not exaggerate as a cartoon color stripe.
    shade=np.clip(0.82+0.37*(diffuse-p15)/span,0.60,1.23)
    strand_hi=np.clip((shade-1.02)*0.60,0,0.15)
    records={}
    for preset_name,preset in COLOR_PRESETS.items():
        base=rgb(preset['base'])
        roots=rgb(preset['roots'])
        highlights=rgb(preset['highlights'])
        tips=rgb(preset['tips'])
        color=base[None,None,:]*(1-root_w[:,:,None])+roots[None,None,:]*root_w[:,:,None]
        color=color*(1-tip_w[:,:,None])+tips[None,None,:]*tip_w[:,:,None]
        color=color*(1-strand_hi[:,:,None])+highlights[None,None,:]*strand_hi[:,:,None]
        # Add modest donor high-frequency strand variation and source AO, preserving saturation.
        color *= shade[:,:,None]*(0.93+0.07*occlusion[:,:,None]/255.0)
        color=np.uint8(np.clip(color,0,255))
        rgba=np.dstack((color,alpha_u8))
        rgba_file=target/f"basecolor_{preset_name}.png"
        Image.fromarray(rgba,'RGBA').save(rgba_file,optimize=True)
        records[preset_name]={'path':str(rgba_file),'sha256':sha(rgba_file)}
    normal_file=target/'normal.png'
    Image.fromarray(normal,'RGB').save(normal_file,optimize=True)
    # glTF metallicRoughness: G = roughness, B = metallic. AO is in R for optional occlusion use.
    # The donor 'Curls' roughness is unusually dark; remap to hair-like 0.5-0.73.
    gray=np.clip(0.53+(roughness-128)/255*0.23,0.46,0.72)
    orm=np.dstack((occlusion,np.clip(gray*255,0,255),np.zeros_like(occlusion))).astype('uint8')
    orm_file=target/'orm.png'
    Image.fromarray(orm,'RGB').save(orm_file,optimize=True)
    coverage=float(np.mean(alpha_u8>=int(255*0.28)))
    if coverage<0.015 or coverage>0.9:
        raise RuntimeError(f"Implausible hair opacity ROI for {style['id']}: {coverage:.4f}")
    metrics={
        'style':style['id'],'family':family,'rect':roi,'texture_resolution':list(size),
        'opacity_mean':round(float(np.mean(alpha_u8))/255,5),
        'opacity_coverage_at_cutoff_0_28':round(coverage,5),
        'normal_map_sha256':sha(normal_file),'orm_map_sha256':sha(orm_file),
        'root_to_tip_uv': {'u':'StrandUV.u','v':'1 - StrandUV.v'},
        'presets':records,
    }
    return metrics


def contact_sheet(styles, dest, output, preset='espresso'):
    n=4
    tile_w,tile_h=240,270
    sheet=Image.new('RGB',(n*tile_w,3*tile_h),(24,27,31))
    d=ImageDraw.Draw(sheet)
    for k,style in enumerate(styles):
        path=dest/style['id']/f'basecolor_{preset}.png'
        im=Image.open(path).convert('RGBA')
        # Show full strand strip on neutral BG to visualize opacity and texture quality.
        bg=Image.new('RGBA',im.size,(77,80,83,255))
        im=Image.alpha_composite(bg,im).convert('RGB').resize((170,212))
        x=(k%n)*tile_w+35; y=(k//n)*tile_h+23
        sheet.paste(im,(x,y))
        d.text((k%n*tile_w+16,y+219),style['id']+' '+style['family'],fill=(240,240,240))
    output.parent.mkdir(parents=True,exist_ok=True)
    sheet.save(output)


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--curly-zip',type=Path,required=True)
    ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--manifest',type=Path,default=None)
    ap.add_argument('--mobile-textures',action='store_true')
    ap.add_argument('--style-id',action='append',help='Process only these style IDs (repeatable); useful for bounded runs')
    args=ap.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(args.curly_zip) as z:
        src={}
        for family in ('Straight','Curls'):
            src[family]={k:read_png(z,family,f) for k,f in (
                ('OPACITY','OPACITY.png'),('DIFFUSE','DIFFUSE_EDITABLE.png'),
                ('NORMAL','NORMAL.png'),('ROUGHNESS','ROUGHNESS.png'),('AO','AO.png'))}
        selected=[s for s in STYLES if not args.style_id or s['id'] in args.style_id]
        if not selected:
            raise ValueError('Unknown style ID(s): '+str(args.style_id))
        metrics=[]
        for style in selected:
            import time
            t0=time.monotonic()
            print('Rendering material',style['id'],flush=True)
            metrics.append(make_maps(style,src,args.output))
            print(' completed in',round(time.monotonic()-t0,1),'s',flush=True)
        if args.mobile_textures:
            for s in selected: make_maps(s,src,args.output,preview_mobile=True)
    manifest={
        'schema_version':1,'purpose':'private fitted-hair material authoring',
        'source_sha256':sha(args.curly_zip),'total_styles':len(STYLES),
        'total_source_triangles':sum(s['triangles'] for s in STYLES),
        'styles':STYLES,'presets':COLOR_PRESETS,'texture_sizes':SIZES,
        'materials':metrics,
        'license':'Commercial source data. Do not commit generated textures to public GitHub without verified redistribution rights.',
        'validation':'Material map generation only; Blender fit and game visual checks remain separate.'}
    path=args.manifest or args.output.parent/'material_build_receipt.json'
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    if all((args.output/s['id']/f'basecolor_espresso.png').exists() for s in STYLES):
        contact_sheet(STYLES,args.output,args.output.parent/'qa'/'12_realism_material_strips.png')
    print('Wrote',len(metrics),'styles /',len(metrics)*len(COLOR_PRESETS),'color options; source triangles',sum(s['triangles'] for s in selected))
    print('Receipt:',path)
    return 0


if __name__=='__main__': sys.exit(main())