"""Unit tests for PREVIEW-ONLY, source-independent reference shaping."""
import unittest
import numpy as np
from reference_shape_ops import trim_lower_tips, rotate_card_about_root, root_clearance_shift


class ReferenceShapeTests(unittest.TestCase):
    def test_trim_preserves_roots_and_xy_silhouette(self):
        p = np.array([[0,166,1],[0,153,1],[0,148,1],[0,129.5,1]],float)
        q = trim_lower_tips(p,knee=153,transition=9,fraction=.29)
        self.assertTrue(np.array_equal(q[:2],p[:2]))
        self.assertTrue(np.all(q[2:,1] > p[2:,1]))
        self.assertLess(q[-1,1]-p[-1,1],7.)
        self.assertTrue(np.array_equal(q[:,[0,2]],p[:,[0,2]]))
    def test_trim_is_monotone(self):
        y = np.linspace(125,170,100)
        p = np.column_stack((np.zeros(len(y)),y,np.zeros(len(y))))
        self.assertTrue(np.all(np.diff(trim_lower_tips(p,knee=153,transition=9,fraction=.29)[:,1])>0))
    def test_rigid_relocation_preserves_every_pairwise_distance(self):
        p = np.array([[2,164,8],[2,162,9],[3,151,9],[4,143,7]],float)
        q = rotate_card_about_root(p,p[0],[-2,164,-8],head_origin_xz=[0,-1.2])
        self.assertTrue(np.allclose(q[0],[-2,164,-8]))
        for i in range(len(p)):
            for j in range(len(p)):
                self.assertAlmostEqual(np.linalg.norm(q[i]-q[j]),np.linalg.norm(p[i]-p[j]))
    def test_clearance_protects_zero_weight_tips(self):
        p = np.array([[1.,1.,0.],[1.,0.,0.],[1.,-1.,0.]])
        q = root_clearance_shift(p,[1,.5,0],[0,1,0],-.5,desired_clearance=.5,max_displacement=1.2)
        self.assertTrue(np.array_equal(q[-1],p[-1]))
        self.assertAlmostEqual(q[0,1],2.)
        self.assertAlmostEqual(q[1,1],.5)
    def test_root_clearance_rejects_unsafe_lifts(self):
        with self.assertRaises(ValueError):
            root_clearance_shift(np.zeros((3,3)),np.ones(3),[0,1,0],-2,desired_clearance=.5,max_displacement=1)
    def test_relocate_rejects_ambiguous_radial_origin(self):
        with self.assertRaises(ValueError):
            rotate_card_about_root(np.ones((3,3)),[0,164,-1.2],[-2,164,-8],head_origin_xz=[0,-1.2])
    def test_inputs_are_immutable(self):
        p = np.array([[0.,160.,2.],[0.,140.,2.]])
        original = p.copy()
        trim_lower_tips(p,knee=152,transition=6,fraction=.25)
        self.assertTrue(np.array_equal(p,original))
        rotate_card_about_root(p,[2,164,8],[-2,164,-8],head_origin_xz=[0,-1.2])
        self.assertTrue(np.array_equal(p,original))
        root_clearance_shift(p,[1,0],[0,1,0],0,desired_clearance=.5,max_displacement=1)
        self.assertTrue(np.array_equal(p,original))


if __name__ == "__main__":
    unittest.main()
