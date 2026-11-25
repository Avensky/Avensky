import unittest
import numpy as np
from fit_math import similarity_transform, islands_from_edges, translate_root_islands

class TestSimilarity(unittest.TestCase):
    def test_identity(self):
        p=np.array([[0.,0.,0.],[1.,0.,0.],[0.,1.,0.],[0.,0.,1.],[1.,1.,1.]])
        matrix, receipt=similarity_transform(p,p,max_rms=1e-10)
        self.assertTrue(np.allclose(matrix,np.eye(4)))
        self.assertAlmostEqual(receipt['rms'],0)
    def test_similarity(self):
        p=np.random.default_rng(45).normal(size=(20,3))
        rot=np.array([[0.,-1.,0.],[1.,0.,0.],[0.,0.,1.]])
        q=(2.5*(rot@p.T)).T+np.array([1.,-.5,3.])
        matrix,receipt=similarity_transform(p,q,max_rms=1e-9)
        self.assertTrue(np.allclose((matrix[:3,:3]@p.T).T+matrix[:3,3],q,atol=1e-10))
        self.assertAlmostEqual(receipt['scale'],2.5)
    def test_no_reflections(self):
        p=np.array([[0.,0.,0.],[1.,0.,0.],[0.,1.,0.],[0.,0.,1.],[.25,.7,1.]])
        q=p.copy();q[:,0]*=-1
        with self.assertRaises(ValueError): similarity_transform(p,q,max_rms=.001)
    def test_reject_invalid_landmarks(self):
        with self.assertRaises(ValueError): similarity_transform([[0,0,0],[1,0,0]],[[0,0,0],[1,0,0]])
        with self.assertRaises(ValueError): similarity_transform([[0,0,0],[1,0,0],[2,0,0]],[[0,0,0],[1,0,0],[2,0,0]])

class TestRoots(unittest.TestCase):
    def test_island_components(self):
        self.assertEqual(sorted(map(len,islands_from_edges(7,[(0,1),(1,2),(4,5)]))),[1,1,2,3])
    def test_zero_weight_tips_are_unchanged(self):
        p=np.array([[0.,0.,0.],[0.,0.,.01],[0.,0.,.02],[1.,0.,0.],[1.,0.,.02]])
        w=np.array([1.,.5,0.,1.,0.])
        result,report=translate_root_islands(p,w,[[0,1,2],[3,4]],
            lambda q:q+np.array([0.,.002,0.]),max_root_move=.01)
        self.assertAlmostEqual(result[0,1],.002)
        self.assertAlmostEqual(result[1,1],.001)
        self.assertTrue(np.array_equal(result[[2,4]],p[[2,4]]))
        self.assertEqual([r['status'] for r in report],['FITTED','FITTED'])
    def test_fail_closed(self):
        p=np.zeros((4,3))
        with self.assertRaisesRegex(ValueError,'No approved roots'):
            translate_root_islands(p,np.zeros(4),[[0,1,2,3]],lambda q:q,max_root_move=.01)
        with self.assertRaisesRegex(ValueError,'safe scalp'):
            translate_root_islands(p,np.ones(4),[[0,1,2,3]],lambda q:q+np.array([.2,0.,0.]),max_root_move=.01)
    def test_reject_invalid_edges(self):
        with self.assertRaises(ValueError): islands_from_edges(2,[(0,3)])

if __name__=="__main__":
    unittest.main()
