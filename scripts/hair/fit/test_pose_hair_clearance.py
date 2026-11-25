import unittest
import numpy as np
from pose_hair_clearance import intersection_uv, linear_opacity


class PoseHairClearanceTests(unittest.TestCase):
    def setUp(self):
        self.hair=np.array([[0.,0,0],[1.,0,0],[0,1.,0]])
        self.uv=self.hair[:,:2].copy()

    def test_crossing_uv(self):
        target=np.array([[.2,-.1,-1],[.2,-.1,1],[.2,.8,0]])
        hits=intersection_uv(self.hair,target,self.uv)
        self.assertEqual(len(hits),7)
        np.testing.assert_allclose(hits[:,0],.2)
        np.testing.assert_allclose(np.sort(hits[:,1])[[0,-1]],[0,.8],atol=1e-7)

    def test_parallel_separation(self):
        self.assertEqual(len(intersection_uv(self.hair,self.hair+[0,0,.05],self.uv)),0)

    def test_uv_repeat_and_bilinear(self):
        im=np.array([[0.,1.],[0.,1.]])
        np.testing.assert_allclose(linear_opacity(im,np.array([[.25,.25],[.5,.25],[1.75,.25]])),[0,.5,1])
