import math
import unittest

from cap_geometry import loft_cap, ordered_cycle


class CapGeometryTests(unittest.TestCase):
    def ring(self, n=16, radius=.08):
        return [(radius*math.cos(i*math.tau/n), radius*math.sin(i*math.tau/n), 0.0) for i in range(n)]

    def test_closed_cycle_from_unordered_edges(self):
        n=16
        edges=[(i, (i+1)%n) for i in range(n)]
        indices=ordered_cycle(edges[::-1], n)
        self.assertEqual(len(indices), n)
        valid={tuple(sorted(edge)) for edge in edges}
        for i in range(n):
            self.assertIn(tuple(sorted((indices[i], indices[(i+1)%n]))), valid)

    def test_reject_disconnected_or_branched_boundary(self):
        with self.assertRaises(ValueError):
            ordered_cycle([(i, (i+1)%8) for i in range(8)]
                          +[(i+8, (i+1)%8+8) for i in range(8)],16)
        with self.assertRaises(ValueError):
            ordered_cycle([(i, (i+1)%16) for i in range(16)]+[(0,8)],16)

    def test_cap_topology_and_apex(self):
        n, levels=16, 8
        ring=self.ring(n)
        cap=loft_cap(ring,(0.,0.,.1), (0.,0.,1.), levels)
        self.assertEqual(len(cap['vertices']), n*levels+1)
        self.assertEqual(len(cap['faces']), n*(levels-1)+n)
        self.assertEqual(cap['vertices'][-1], (0.,0.,.1))
        self.assertEqual(cap['vertices'][0],ring[0])
        used={i for face in cap['faces'] for i in face}
        self.assertEqual(len(used),len(cap['vertices']))
        self.assertTrue(all(len(set(face))==len(face) for face in cap['faces']))

    def test_reversed_ring_yields_same_disk(self):
        a=loft_cap(self.ring(),(0.,0.,.1),(0.,0.,1.))
        b=loft_cap(self.ring()[::-1],(0.,0.,.1),(0.,0.,1.))
        self.assertEqual(a['vertices'],b['vertices'])
        self.assertEqual(a['faces'],b['faces'])

    def test_rising_and_flat_tangent_at_apex(self):
        cap=loft_cap(self.ring(),(0.,0.,.1),(0.,0.,1.))
        n=cap['boundary_count']
        zs=[cap['vertices'][k*n][2] for k in range(cap['levels'])]
        self.assertEqual(zs, sorted(zs))
        self.assertGreater(zs[-1], .09)

    def test_bone_frame_can_be_non_z_up(self):
        ring=[(.08*math.cos(i*math.tau/16), 0., .08*math.sin(i*math.tau/16)) for i in range(16)]
        result=loft_cap(ring,(0.,.10,0.),(0.,1.,0.))
        self.assertEqual(result['vertices'][-1],(0.,.10,0.))

    def test_reject_invalid_geometry(self):
        ring=self.ring()
        with self.assertRaises(ValueError): loft_cap(ring,(0.,0.,0.),(0.,0.,1.))
        with self.assertRaises(ValueError): loft_cap(ring,(1.,0.,.1),(0.,0.,1.))
        with self.assertRaises(ValueError): loft_cap(ring,(0.,0.,.1),(0.,0.,1.), 1)
        with self.assertRaises(ValueError): loft_cap(ring[:7],(0.,0.,.1),(0.,0.,1.))
        with self.assertRaises(ValueError):
            loft_cap([*ring[:5],(math.nan,0.,0.),*ring[6:]],(0.,0.,.1),(0.,0.,1.))
        bow=ring[:]
        bow[2],bow[12]=bow[12],bow[2]
        with self.assertRaises(ValueError): loft_cap(bow,(0.,0.,.1),(0.,0.,1.))


if __name__=='__main__':
    unittest.main()
