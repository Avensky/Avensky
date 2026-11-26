import unittest
import numpy as np
from root_suggestions import suggest_uv_roots

class RootSuggestionTests(unittest.TestCase):
    def setup(self):
        x=np.array([[0.,0.,z] for z in [0.,.5,1,2,3,4,5,6,7,8,9,10]])
        uv=np.array([[0.,z/10.] for z in [0.,.5,1,2,3,4,5,6,7,8,9,10]])
        return x,uv
    def test_root_at_low_v_and_tips_protected(self):
        p,uv=self.setup()
        w,r=suggest_uv_roots(p,uv,[list(range(len(p)))],[[0,0,0]],max_root_distance=1,min_end_separation=3)
        self.assertEqual(r[0]['status'],'ROOT_SUGGESTED_NOT_APPROVED')
        self.assertGreater(w[0],.9)
        self.assertEqual(w[-1],0)
        self.assertEqual(w[-4],0)
    def test_high_v_root(self):
        p,uv=self.setup();p=p[::-1].copy()
        w,r=suggest_uv_roots(p,uv,[list(range(len(p)))],[[0,0,0]],max_root_distance=1,min_end_separation=3)
        self.assertEqual(r[0]['end'],1)
        self.assertGreater(w[-1],.9)
        self.assertEqual(w[0],0)
    def test_far_root_requires_review(self):
        p,uv=self.setup();p[:,0]=100
        w,r=suggest_uv_roots(p,uv,[list(range(len(p)))],[[0,0,0]],max_root_distance=2,min_end_separation=3)
        self.assertEqual(r[0]['status'],'REVIEW')
        self.assertFalse(np.any(w))
    def test_ambiguous_root_requires_review(self):
        p,uv=self.setup();p[:,2]=1
        w,r=suggest_uv_roots(p,uv,[list(range(len(p)))],[[0,0,0]],max_root_distance=3,min_end_separation=3)
        self.assertEqual(r[0]['status'],'REVIEW')
        self.assertFalse(np.any(w))
    def test_invalid_overlap(self):
        p,uv=self.setup()
        with self.assertRaises(ValueError):
            suggest_uv_roots(p,uv,[[0,1],[1,2]],[[0,0,0]],max_root_distance=2,min_end_separation=1)
    def test_nonfinite_data(self):
        p,uv=self.setup();p[0,0]=np.nan
        with self.assertRaises(ValueError):
            suggest_uv_roots(p,uv,[list(range(len(p)))],[[0,0,0]],max_root_distance=2,min_end_separation=1)

if __name__=='__main__':unittest.main()
