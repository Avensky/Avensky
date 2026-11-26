import importlib.util
import json
import struct
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "inspect_outerwear_assets.py"
spec = importlib.util.spec_from_file_location("outerwear_inspect", SCRIPT)
inspector = importlib.util.module_from_spec(spec)
import sys
sys.modules[spec.name] = inspector
spec.loader.exec_module(inspector)

def prop(value):
    if isinstance(value, int):
        return b'L' + struct.pack('<q',value)
    if isinstance(value,str):
        data=value.encode()
        return b'S' + struct.pack('<I',len(data)) + data
    kind,values=value
    fmt='<'+({'i':'i','d':'d'}[kind])*len(values)
    data=struct.pack(fmt,*values)
    return kind.encode()+struct.pack('<III',len(values),0,len(data))+data

def node(name, properties, children, offset):
    n=name.encode()
    raw=b''.join(prop(x) for x in properties)
    cur=offset+25+len(n)+len(raw)
    nested=b''
    for child in children:
        chunk=node(*child,offset=cur)
        nested+=chunk
        cur+=len(chunk)
    if children:
        nested+=b'\0'*25
        cur+=25
    end=cur
    return struct.pack('<QQQB',end,len(properties),len(raw),len(n))+n+raw+nested

def sample_fbx():
    # A real triangle, plus an unreferenced zero vertex.
    geom=('Geometry',[1,'MockCloth\0\x01Geometry','Mesh'],[
        ('Vertices',[('d',[0.,0.,0.,100.,0.,0.,0.,100.,0.,0.,0.,0.])],[]),
        ('PolygonVertexIndex',[('i',[0,1,-3])],[]),
        ('LayerElementUV',[0],[('UV',[('d',[0.,0.,1.,0.,0.,1.])],[])]),
        ('LayerElementMaterial',[0],[('Materials',[('i',[0])],[])])
    ])
    objs=('Objects',[],[geom,('Material',[2,'Cotton\0\x01Material',''],[]),('Model',[3,'MockCloth\0\x01Model','Mesh'],[])])
    return b'Kaydara FBX Binary  \0\x1a\0'+struct.pack('<I',7700)+node(*objs,offset=27)+b'\0'*25+b'\0'*160

class OuterwearIntakeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.asset=self.root/'z-h_Jacket 99-THIN WELD.fbx'
        self.asset.write_bytes(sample_fbx())
    def test_parses_geometry_and_excludes_unreferenced_origin(self):
        meta=inspector.inspect_fbx(self.asset)
        self.assertEqual(meta['triangles'],1)
        self.assertEqual(meta['polygonCount'],1)
        self.assertEqual(meta['controlPoints'],4)
        self.assertEqual(meta['referencedControlPoints'],3)
        self.assertEqual(meta['unreferencedControlPoints'],1)
        self.assertEqual(meta['zeroControlPoints'],2)
        self.assertEqual(meta['materials'],['Cotton'])
        self.assertEqual(meta['uvCoordinates'],3)
        self.assertFalse(meta['rigged'])
        self.assertEqual(meta['referencedExtentMeters'],[1,1,0])
        self.assertIn('blocked',meta['catalogApproval'])
    def test_corrupt_input_fails_closed(self):
        self.asset.write_bytes(b'not an fbx')
        with self.assertRaisesRegex(ValueError,'Not a binary FBX'):
            inspector.inspect_fbx(self.asset)
    def test_private_sha_contract(self):
        actual=inspector.inspect_fbx(self.asset)
        expected=self.root/'expected.json'
        expected.write_text(json.dumps({'candidates':[{'source':{'preferred':{
            'name':self.asset.name,'sha256':actual['sha256'],'triangles':1
        }}}]}))
        self.assertEqual(inspector.main(['--directory',str(self.root),
          '--expected',str(expected),'--json',str(self.root/'report.json')]),0)
        saved=json.loads((self.root/'report.json').read_text())
        self.assertEqual(saved['verificationErrors'],[])
        self.assertEqual(saved['sourcePrivacy'],'private-local-input')
        expected.write_text(json.dumps({'candidates':[{'source':{'preferred':{
            'name':self.asset.name,'sha256':'0'*64,'triangles':1
        }}}]}))
        self.assertEqual(inspector.main(['--directory',str(self.root),
          '--expected',str(expected),'--json',str(self.root/'bad.json')]),1)
        self.assertIn('hash mismatch',json.loads((self.root/'bad.json').read_text())['verificationErrors'][0])
    def test_does_not_modify_original_bytes(self):
        before=self.asset.read_bytes()
        inspector.main(['--directory',str(self.root),'--json',str(self.root/'report.json')])
        self.assertEqual(self.asset.read_bytes(),before)

if __name__=='__main__':unittest.main()
