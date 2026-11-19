import importlib.util
import json
import math
from pathlib import Path
import struct
import sys
import tempfile
import types
import unittest

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import prepare_hair_materials as preparation


def load_blender_script_without_blender():
    fake=types.ModuleType('bpy')
    sys.modules['bpy']=fake
    try:
        spec=importlib.util.spec_from_file_location('apply_for_test',HERE/'blender_apply_batch.py')
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.modules.pop('bpy',None)

class SafeBatchTests(unittest.TestCase):
    def test_twelve_original_geometry_totals(self):
        self.assertEqual([s['id'] for s in preparation.STYLES],[f'Hair_{i:02d}' for i in range(1,13)])
        self.assertEqual(sum(s['triangles'] for s in preparation.STYLES),81469)
        self.assertEqual(len(preparation.COLOR_PRESETS),4)

    def test_source_uv_rectangles_within_atlas(self):
        for style in preparation.STYLES:
            x0,y0,x1,y1=style['rect']
            self.assertTrue(0<=x0<x1<=2048 and 0<=y0<y1<=2048)
            self.assertTrue(style['family'] in ['Straight','Curls'])

    def test_reconstructed_root_placement(self):
        module=load_blender_script_without_blender()
        self.assertEqual(module.strand_to_realism_uv(0.25,0.0),(0.25,1.0))
        self.assertEqual(module.strand_to_realism_uv(0.75,1.0),(0.75,0.0))
        self.assertEqual(module.strand_to_realism_uv(0.5,0.5),(0.5,0.5))
        with self.assertRaises(ValueError): module.strand_to_realism_uv(float('nan'),0.5)

    def test_binary_glb_material_fix_preserves_bin(self):
        module=load_blender_script_without_blender()
        doc={'asset':{'version':'2.0'},'materials':[{'name':module.MATERIAL_PREFIX+'Hair_12_espresso','pbrMetallicRoughness':{'roughnessFactor':.5}}]}
        js=json.dumps(doc).encode('utf8');js+=b' '*(-len(js)%4)
        binchunk=b'\x01\x02\x03\x04'
        payload=bytearray(struct.pack('<4sII',b'glTF',2,0))
        for chunk_type,contents in [(b'JSON',js),(b'BIN\x00',binchunk)]:
            payload+=struct.pack('<I4s',len(contents),chunk_type)+contents
        struct.pack_into('<I',payload,8,len(payload))
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'test.glb'
            path.write_bytes(payload)
            count,outdoc=module.edit_glb_alpha(path)
            self.assertEqual(count,1)
            self.assertEqual(outdoc['materials'][0]['alphaMode'],'MASK')
            self.assertAlmostEqual(outdoc['materials'][0]['alphaCutoff'],.28)
            self.assertTrue(outdoc['materials'][0]['doubleSided'])
            self.assertEqual(path.read_bytes()[-4:],binchunk)
            self.assertEqual(struct.unpack_from('<I',path.read_bytes(),8)[0],path.stat().st_size)

if __name__=='__main__': unittest.main()