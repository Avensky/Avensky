"""Confirm candidate triangle intersections and sample donor UV opacity."""
import numpy as np


def edge_plane_hits(triangle, target, epsilon):
    normal = np.cross(target[1]-target[0], target[2]-target[0])
    norm = np.linalg.norm(normal)
    if norm < 1e-14:
        return []
    distance = (triangle - target[0]) @ (normal / norm)
    hits = [point for point, depth in zip(triangle, distance) if abs(depth) <= epsilon]
    for k, start in enumerate(triangle):
        i = (k+1) % 3
        if distance[k] * distance[i] < -(epsilon ** 2):
            ratio = distance[k] / (distance[k] - distance[i])
            hits.append(start + ratio * (triangle[i]-start))
    return hits


def barycentric(points, triangle):
    edge0, edge1 = triangle[1:] - triangle[0]
    rhs = (points-triangle[0]) @ np.stack((edge0,edge1)).T
    gram = np.array([[edge0@edge0,edge0@edge1],[edge0@edge1,edge1@edge1]])
    if abs(np.linalg.det(gram)) < 1e-25:
        return np.empty((0,3))
    ab = np.linalg.solve(gram,rhs.T).T
    return np.c_[1-ab.sum(1), ab]


def intersection_uv(hair, target, uv, *, epsilon=1e-7, samples=7):
    """Sample the shared segment of two noncoplanar triangles in the hair UV."""
    hits = []
    for a,b in ((hair,target),(target,hair)):
        section = np.asarray(edge_plane_hits(a,b,epsilon))
        if not len(section):
            continue
        coords = barycentric(section,b)
        if len(coords):
            hits.extend(section[np.all(coords >= -1e-5,axis=1)])
    if not hits:
        return np.empty((0,2))
    points = np.asarray(hits)
    distance = np.sum((points[:,None,:]-points[None,:,:])**2,axis=2)
    start,end = np.unravel_index(np.argmax(distance),distance.shape)
    if distance[start,end] < epsilon**2:
        return np.empty((0,2))
    # Area-zero contacts and sub-micron floating-point touches carry no card area.
    segment = np.linspace(points[start],points[end],samples)
    weights = barycentric(segment,hair)
    return weights @ uv


def linear_opacity(image, uv):
    """Image buffer rows follow Blender's bottom-left UV origin."""
    height,width = image.shape
    u,v=uv[:,0]*width-.5,uv[:,1]*height-.5
    x,y=np.floor(u).astype(int),np.floor(v).astype(int)
    u,v=u-x,v-y
    return ((1-v)*((1-u)*image[y%height,x%width]+u*image[y%height,(x+1)%width])
        +v*((1-u)*image[(y+1)%height,x%width]+u*image[(y+1)%height,(x+1)%width]))
