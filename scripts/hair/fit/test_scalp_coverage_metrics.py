import unittest
import numpy as np
from scalp_coverage_metrics import measure_exposure


class ScalpCoverageTests(unittest.TestCase):
    def test_weighted_alpha_and_partial_boundary(self):
        report, mask = measure_exposure([[1, 1, .5, 0]], [[0, .25, .5, .1]])
        self.assertEqual(report["reference_pixel_equivalents"], 2.5)
        self.assertEqual(report["visible_fraction"], .3)
        self.assertEqual(report["pixels_at_least_half_visible"], 1)
        self.assertEqual(report["excess_pixel_equivalents"], .1)
        np.testing.assert_array_equal(mask, [[0, .25, .5, 0]])

    def test_no_reference_is_undefined_even_with_empty_mask(self):
        report, _ = measure_exposure([[0]], [[0]])
        self.assertIsNone(report["visible_fraction"])

    def test_transparent_and_opaque_layers(self):
        reference = [[1, .25]]
        for opacity, expected in ((0, 1), (1, 0), (.5, .25)):
            # Two identical layers transmit (1 - opacity)**2.
            with self.subTest(opacity=opacity):
                visible = np.array(reference) * (1 - opacity)**2
                report, _ = measure_exposure(reference, visible)
                self.assertEqual(report["visible_fraction"], expected)

    def test_rejects_invalid_masks(self):
        for mask in ([[float("nan")]], [[1.1]], [[-.1]], [[1, 0]], [1]):
            with self.subTest(mask=mask):
                with self.assertRaises(ValueError):
                    measure_exposure([[1]], mask)
