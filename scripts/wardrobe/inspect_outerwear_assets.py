#!/usr/bin/env python3
"""W-07 inspect private CLO binary FBX source assets without requiring Blender.

Read-only. Outputs file hashes, real (referenced) bounds, polygon/UV counts
and rig presence. Source FBX, normal maps and CLO projects are never rewritten.
"""
from __future__ import annotations
import argparse, hashlib, json, struct, sys, zlib
from pathlib import Path
from collections import Counter
from dataclasses import dataclass

@dataclass
class Node:
    name: str
    props: list
    children: list
    def first(self,name): return next((x for x in self.children if x.name==name),None)

class Reader:
    def __init__(self, data:bytes):
        self.data=data
        if not data.startswith(b'Kaydara FBX Binary  \0\x1a\0'):raise ValueError('Not a binary FBX document')
        self.version=struct.unpack_from('<I',data,23)[0]
        if self.version<7500 or self.version>8000:raise ValueError('Unsupported binary FBX version')
        self.pos=27
    def prop(self):
        raw=self.data;pos=self.pos
        kind=chr(raw[pos]);pos+=1
        single={'Y':'h','C':'?','I':'i','F':'f','D':'d','L':'q'}
        if kind in single:
            fmt='<'+single[kind]; value=struct.unpack_from(fmt,raw,pos)[0];pos+=struct.calcsize(fmt)
        elif kind in 'SR':
            n=struct.unpack_from('<I',raw,pos)[0];pos+=4
            value=raw[pos:pos+n].decode('utf8','replace') if kind=='S' else None
            pos+=n
        elif kind in 'bilfdc':
            count,encoding,length=struct.unpack_from('<III',raw,pos);pos+=12
            value=('array',kind,count,encoding,raw[pos:pos+length]);pos+=length
        else:raise ValueError('Unsupported FBX property code '+kind)
        self.pos=pos;return value
    def node(self):
        raw=self.data; start=self.pos
        end,num,plen,namelen=struct.unpack_from('<QQQB',raw,start);self.pos+=25
        if end==0 and num==0 and plen==0 and namelen==0:return None
        if end<=self.pos or end>len(raw):raise ValueError('Invalid FBX node bounds')
        name=raw[self.pos:self.pos+namelen].decode('utf8','replace');self.pos+=namelen
        props=[self.prop() for _ in range(num)]
        children=[]
        while self.pos<end-25:
            sub=self.node()
            if sub is None:break
            children.append(sub)
        self.pos=end
        return Node(name,props,children)
    def top(self):
        out=[]
        while self.pos<len(self.data)-40:
            n=self.node()
            if n is None:break
            out.append(n)
        return out

def array(node):
    if not node or not node.props:raise ValueError('Expected FBX array')
    typ=node.props[0]
    if not isinstance(typ,tuple) or typ[0]!='array':raise ValueError('Expected FBX array')
    _,kind,count,compressed,content=typ
    size={'b':1,'i':4,'l':8,'f':4,'d':8,'c':1}[kind]
    data=zlib.decompress(content) if compressed else content
    if len(data)!=count*size:raise ValueError('Array buffer length mismatch')
    fmt={'b':'b','i':'i','l':'q','f':'f','d':'d','c':'B'}[kind]
    return (t[0] for t in struct.iter_unpack('<'+fmt,data)),count

def inspect_fbx(path):
    content=path.read_bytes(); reader=Reader(content); top=reader.top()
    o=next((x for x in top if x.name=='Objects'),None)
    if o is None:raise ValueError('FBX missing Objects group')
    geom=[x for x in o.children if x.name=='Geometry']
    materials=[x for x in o.children if x.name=='Material']
    deformers=[x for x in o.children if x.name=='Deformer']
    models=[x for x in o.children if x.name=='Model']
    if len(geom)!=1:raise ValueError('Expected one garment Geometry node, found '+str(len(geom)))
    g=geom[0];vertex=g.first('Vertices');poly=g.first('PolygonVertexIndex')
    if not vertex or not poly:raise ValueError('Missing control points or polygons')
    values,n=array(vertex)
    if n%3:raise ValueError('Malformed vertex tuples')
    coords=list(values); points=[coords[i:i+3] for i in range(0,n,3)]
    ind,_=array(poly);indices=list(ind)
    counts=[];one=0;referenced=set();matnode=g.first('LayerElementMaterial')
    for i in indices:
        idx=i if i>=0 else -i-1
        if idx>=len(points):raise ValueError('Polygon index outside control point array')
        referenced.add(idx);one+=1
        if i<0:
            if one<3:raise ValueError('Unsupported degenerate polygon')
            counts.append(one);one=0
    if one:raise ValueError('Unterminated FBX polygon')
    if not referenced:raise ValueError('Empty source mesh')
    vertices=[points[i] for i in referenced]
    vmin=[min(v[d] for v in vertices) for d in range(3)]
    vmax=[max(v[d] for v in vertices) for d in range(3)]
    uvnode=g.first('LayerElementUV');uv=uvnode.first('UV') if uvnode else None
    _,uv_scalars=array(uv) if uv else (iter(()),0)
    if uv_scalars%2:raise ValueError('Malformed UV coordinate pairs')
    uv_count=uv_scalars//2
    matindices=matnode.first('Materials') if matnode else None
    material_index_count=array(matindices)[1] if matindices else 0
    names=[str(x.props[1]).split('\0')[0] if len(x.props)>1 else 'unnamed' for x in materials]
    return {
        'sourceFile':path.name,'sha256':hashlib.sha256(content).hexdigest(),
        'sourceBytes':len(content),'fbxVersion':reader.version,
        'rigged':len(deformers)>0,'deformers':len(deformers),
        'models':len(models),'geometryNodes':len(geom),
        'controlPoints':len(points),'referencedControlPoints':len(referenced),
        'unreferencedControlPoints':len(points)-len(referenced),
        'zeroControlPoints':sum(p==[0.0,0.0,0.0] for p in points),
        'polygonCount':len(counts),'triangles':sum(c-2 for c in counts),
        'polygonKinds':dict(sorted(Counter(str(c) for c in counts).items())),
        'materials':names,'materialIndexCount':material_index_count,
        'uvCoordinates':uv_count,
        'referencedBoundsCm':[[round(x,5) for x in vmin],[round(x,5) for x in vmax]],
        'referencedExtentMeters':[round((vmax[i]-vmin[i])*.01,5) for i in range(3)],
        'requiresSkinTransfer':len(deformers)==0,
        'catalogApproval':'blocked: requires target rig, pose and interlayer fit checks'
    }

def main(args=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory',type=Path,required=True,help='Private directory containing source FBXs')
    p.add_argument('--json',type=Path,help='Optional report file; never changes original assets')
    p.add_argument('--expected',type=Path,help='Optional W-07 expected source-hash manifest')
    ns=p.parse_args(args)
    if not ns.directory.is_dir():p.error('Source directory unavailable')
    sources=sorted(ns.directory.glob('z-h_*-TH*.fbx'))
    if not sources:p.error('No expected CLO FBX sources found')
    records=[inspect_fbx(f) for f in sources]
    byname={r['sourceFile']:r for r in records}
    errors=[]
    if ns.expected:
        expected=json.loads(ns.expected.read_text())
        for item in expected['candidates']:
            selected=item['source']['preferred']
            got=byname.get(selected['name'])
            if not got:errors.append('Missing: '+selected['name'])
            elif got['sha256']!=selected['sha256']:errors.append('Source hash mismatch: '+selected['name'])
            elif got['triangles']!=selected['triangles']:errors.append('Triangle count mismatch: '+selected['name'])
    result={'schemaVersion':1,'sourcePrivacy':'private-local-input','candidateCount':len(records),
      'candidates':records,'verificationErrors':errors}
    text=json.dumps(result,indent=2)+'\n'
    if ns.json:ns.json.parent.mkdir(parents=True,exist_ok=True);ns.json.write_text(text)
    else:print(text)
    return 1 if errors else 0
if __name__=='__main__':sys.exit(main())
