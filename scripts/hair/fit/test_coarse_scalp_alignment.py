import unittest
import numpy as np
from coarse_scalp_alignment import candidate_anchors, transform_points, estimate_coarse_alignment


class TestCoarseScalpAlignment(unittest.TestCase):
    def test_higher_v_end_is_not_the_nearest_end(self):
        points, uvs, islands = [], [], []
        for k in range(16):
            start = len(points)
            points.extend([[k/2, 10, 0], [k/2, 9.5, 0],
                           [k/2, 4, 0], [k/2, 3.5, 0]])
            uvs.extend([[0, .98], [1, .97], [0, .02], [1, .03]])
            islands.append(list(range(start, start+4)))
        anchors, records = candidate_anchors(points, uvs, islands, [0,1,0],
                                              min_vertical_span=3)
        self.assertEqual(len(anchors), 16)
        self.assertTrue(np.all(anchors[:,1] > 9))
        self.assertTrue(all(rec["higher_uv_end"] == 1 for rec in records))

    def test_uv_zero_can_be_higher_end(self):
        points, uvs, islands = [], [], []
        for k in range(14):
            start = len(points)
            points.extend([[k*.1,10,0], [k*.1,9,0],
                           [k*.1,1,0], [k*.1,0,0]])
            uvs.extend([[0,.01], [1,.02], [0,.98], [1,.99]])
            islands.append(list(range(start, start+4)))
        _, records = candidate_anchors(points, uvs, islands, [0,1,0],
                                        min_vertical_span=3)
        self.assertTrue(all(rec["higher_uv_end"] == 0 for rec in records))

    def test_transform_preserves_relative_shape(self):
        original = np.array([[0,0,0], [3,4,0], [2,0,.5]], dtype=float)
        changed = transform_points(original, [0,0,0], .9, [1,-20,-2])
        self.assertAlmostEqual(np.linalg.norm(changed[0]-changed[1]),
                               .9*np.linalg.norm(original[0]-original[1]))
        self.assertTrue(np.array_equal(original, [[0,0,0], [3,4,0], [2,0,.5]]))

    def test_recovers_large_vertical_misalignment(self):
        rng = np.random.default_rng(42)
        scalp = np.concatenate([
            rng.normal([0,10,0], [2,1,2], (80,3)),
            rng.normal([0,7,0], [2,1,2], (80,3))
        ])
        hair_ends = scalp[:45] + [0,20,0]
        outcome = estimate_coarse_alignment(
            hair_ends, scalp, [0,1,0], meters_per_unit=.01,
            scale_range=(.98,1.02), max_lateral_m=.005,
            vertical_window_m=.06, distance_clip_m=.04, maxiter=30)
        self.assertGreater(outcome["within_2cm_after"],
                           outcome["within_2cm_before"])
        self.assertLess(outcome["median_root_distance_after_m"],
                        outcome["median_root_distance_before_m"] * .25)
        self.assertLess(abs(outcome["displacement_xyz_world"][1]+20), 4)
        self.assertEqual(outcome["status"], "CANDIDATE_REQUIRES_VISUAL_QA")

    def test_invalid_input_fails_closed(self):
        with self.assertRaises(ValueError):
            candidate_anchors([[0,0,0]], [[0,0]], [[0]], [0,1,0],
                              min_vertical_span=1)
        with self.assertRaises(ValueError):
            estimate_coarse_alignment(np.zeros((2,3)), np.zeros((40,3)),
                                      [0,1,0], meters_per_unit=.01)
        with self.assertRaises(ValueError):
            estimate_coarse_alignment(np.zeros((20,3)), np.zeros((40,3)),
                                      [0,1,0], meters_per_unit=0)


if __name__ == "__main__":
    unittest.main()
