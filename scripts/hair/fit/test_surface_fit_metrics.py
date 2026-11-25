"""Synthetic regression suite for exact scalp-triangle distances."""
import unittest
import numpy as np
from surface_fit_metrics import measure_nearest_surface, summarize_contact


class TriangleSurfaceMetricsTests(unittest.TestCase):
    def setUp(self):
        self.vertices = np.array([[0, 0, 0], [2, 0, 0], [0, 2, 0]], float)
        self.faces = np.array([[0, 1, 2]], int)
    def test_inside_vertical_surface_distance(self):
        rows = measure_nearest_surface([[.25, .25, .012]], self.vertices, self.faces, meters_per_unit=1.)
        self.assertAlmostEqual(rows[0]['distance_mm'], 12, places=6)
        self.assertAlmostEqual(rows[0]['local_normal_offset_mm'], 12, places=6)
        self.assertEqual(rows[0]['triangle_index'], 0)
    def test_backside_sign_is_local_orientation(self):
        rows = measure_nearest_surface([[.25, .25, -.005]], self.vertices, self.faces, meters_per_unit=1.)
        self.assertAlmostEqual(rows[0]['local_normal_offset_mm'], -5, places=6)
    def test_edge_outside_triangle(self):
        rows = measure_nearest_surface([[1.5,1.5,0]], self.vertices, self.faces, meters_per_unit=1.)
        self.assertTrue(np.allclose(rows[0]['closest_xyz'], [1,1,0]))
        self.assertAlmostEqual(rows[0]['distance_mm'], np.sqrt(.5)*1000, places=6)
    def test_distant_centroid_large_triangle_not_missed(self):
        # The nearest triangle by centroid is NOT necessarily the actual nearest.
        v=np.array([[0,0,0],[200,0,0],[0,200,0],
                    [1,1,2],[1.1,1,2],[1,1.1,2]],float)
        f=np.array([[0,1,2],[3,4,5]],int)
        row=measure_nearest_surface([[1,1,.1]],v,f,meters_per_unit=.01,candidate_k=1)[0]
        self.assertEqual(row['triangle_index'],0)
        self.assertAlmostEqual(row['distance_mm'],1,places=5)
    def test_multiple_triangle_candidates(self):
        v=np.array([[0,0,0],[1,0,0],[0,1,0],[1,1,0]],float)
        f=np.array([[0,1,2],[1,3,2]],int)
        r=measure_nearest_surface([[.8,.8,.3]],v,f,meters_per_unit=1.)[0]
        self.assertEqual(r['triangle_index'],1)
        self.assertAlmostEqual(r['distance_mm'],300,places=6)
    def test_summary_flags_only(self):
        rows=measure_nearest_surface([[.1,.1,.01],[.1,.1,-.02],[.1,.1,.001]],self.vertices,self.faces,meters_per_unit=1.)
        summary=summarize_contact(rows,max_root_gap_mm=5,min_root_offset_mm=-10)
        self.assertEqual(summary['samples'],3)
        self.assertEqual(summary['candidates_over_gap_limit'],2)
        self.assertEqual(summary['possible_surface_penetrations'],1)
        self.assertIn('NOT_VISUAL_COVERAGE',summary['status'])
    def test_reject_missing_or_nonfinite(self):
        with self.assertRaises(ValueError):
            measure_nearest_surface([[0,0,0]], self.vertices, self.faces, meters_per_unit=0.)
        with self.assertRaises(ValueError):
            measure_nearest_surface([[np.nan,0,0]], self.vertices, self.faces, meters_per_unit=1.)
        with self.assertRaises(ValueError):
            measure_nearest_surface([[0,0,0]], self.vertices, [[0,1,10]], meters_per_unit=1.)
    def test_input_immutability(self):
        vv=self.vertices.copy();ff=self.faces.copy()
        measure_nearest_surface([[.1,.1,0]],self.vertices,self.faces,meters_per_unit=1.)
        self.assertTrue(np.array_equal(vv,self.vertices))
        self.assertTrue(np.array_equal(ff,self.faces))

if __name__=='__main__':unittest.main()
