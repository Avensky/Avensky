"""Pure-Python, dependency-free scalp dome geometry for Blender authoring.

Requires a measured, CLOSED hairline edge loop and a crown marker. Never guesses
head dimensions from a sphere or tries to fit actual hairstyle root clumps.
"""
import math


def _add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _mul(a, t):
    return tuple(x * t for x in a)


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def _unit(a):
    length = math.sqrt(_dot(a, a))
    if not math.isfinite(length) or length < 1e-9:
        raise ValueError("Invalid zero/nonfinite axis")
    return _mul(a, 1.0 / length)


def ordered_cycle(edges, vertex_count):
    """Return indices of exactly one simple closed loop from mesh edges."""
    if vertex_count < 8:
        raise ValueError("Hairline must contain at least eight vertices")
    adjacency = {i: set() for i in range(vertex_count)}
    used = set()
    for a, b in edges:
        if not (0 <= a < vertex_count and 0 <= b < vertex_count) or a == b:
            raise ValueError("Malformed hairline edge")
        e = tuple(sorted((a, b)))
        if e in used:
            raise ValueError("Duplicate hairline edge")
        used.add(e)
        adjacency[a].add(b)
        adjacency[b].add(a)
    if len(used) != vertex_count or any(len(x) != 2 for x in adjacency.values()):
        raise ValueError("Hairline must be one closed cycle with degree 2 at every vertex")
    result = [0]
    previous = None
    current = 0
    while True:
        neighbors = sorted(adjacency[current])
        following = neighbors[0] if neighbors[0] != previous else neighbors[1]
        if following == 0:
            break
        if following in result:
            raise ValueError("Hairline contains an early closure or multiple loops")
        result.append(following)
        previous, current = current, following
    if len(result) != vertex_count:
        raise ValueError("Hairline mesh has disconnected cycles")
    return result


def _orient2(a, b, c):
    return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])


def _has_crossing(points):
    n = len(points)
    for i in range(n):
        a, b = points[i], points[(i+1)%n]
        for j in range(i+2, n):
            if i == 0 and j == n-1:
                continue
            c, d = points[j], points[(j+1)%n]
            ab_c = _orient2(a, b, c)
            ab_d = _orient2(a, b, d)
            cd_a = _orient2(c, d, a)
            cd_b = _orient2(c, d, b)
            if ab_c * ab_d < 0 and cd_a * cd_b < 0:
                return True
    return False


def _inside_origin(points):
    """Crown's projection is the origin in the local tangent plane."""
    inside = False
    for i, (ax, ay) in enumerate(points):
        bx, by = points[(i+1)%len(points)]
        if (ay > 0) != (by > 0) and (ax + (0-ay)*(bx-ax)/(by-ay)) > 0:
            inside = not inside
    return inside


def loft_cap(ring, crown, up, levels=8):
    """Generate an open-boundary dome with a smooth single apex.

    The cap is topologically a disk. The ring is measured directly on the
    character, and each meridian is a quarter-ellipse toward the crown. No
    guessed head radius, vendor UVs, or wardrobe meshes are modified.
    """
    if not isinstance(levels, int) or levels < 3 or levels > 128:
        raise ValueError("levels must be an integer in [3, 128]")
    if len(ring) < 8:
        raise ValueError("Hairline needs eight or more points")
    vertices = [tuple(float(v) for v in p) for p in ring]
    crown = tuple(float(v) for v in crown)
    if len(crown) != 3 or any(len(p) != 3 for p in vertices):
        raise ValueError("All points must be xyz triples")
    if not all(math.isfinite(v) for p in [crown, *vertices] for v in p):
        raise ValueError("Nonfinite scalp landmark")
    axis = _unit(tuple(float(v) for v in up))
    heights = [_dot(_sub(crown, p), axis) for p in vertices]
    if min(heights) <= 1e-4:
        raise ValueError("Crown must be above EVERY boundary point along up axis")
    reference = (0., 1., 0.) if abs(_dot(axis, (0.,1.,0.))) < 0.9 else (1.,0.,0.)
    right = _unit(_cross(reference, axis))
    forward = _cross(axis, right)
    points2 = [(_dot(_sub(p, crown), right), _dot(_sub(p, crown), forward)) for p in vertices]
    if any(math.hypot(*xy) < 1e-5 for xy in points2):
        raise ValueError("Boundary contains a point below the projected crown")
    if _has_crossing(points2):
        raise ValueError("Hairline crosses itself in crown-projected view")
    if not _inside_origin(points2):
        raise ValueError("Crown must project inside hairline polygon")
    twice_area = sum(p[0]*points2[(i+1)%len(points2)][1]
                     - points2[(i+1)%len(points2)][0]*p[1]
                     for i, p in enumerate(points2))
    if abs(twice_area) < 1e-8:
        raise ValueError("Hairline has no projected area")
    if twice_area < 0:
        vertices.reverse()
    n = len(vertices)
    mesh_vertices = []
    for row in range(levels):
        theta = (row/levels) * math.pi/2
        radial = math.cos(theta)
        axial = 1.0 - math.sin(theta)
        for boundary in vertices:
            displacement = _sub(boundary, crown)
            along = _dot(displacement, axis)
            horizontal = _sub(displacement, _mul(axis, along))
            mesh_vertices.append(_add(crown, _add(_mul(horizontal, radial), _mul(axis, along * axial))))
    mesh_vertices.append(crown)
    faces = []
    for row in range(levels-1):
        for col in range(n):
            next_col = (col + 1) % n
            faces.append((row*n+col, row*n+next_col,
                          (row+1)*n+next_col, (row+1)*n+col))
    for col in range(n):
        faces.append(((levels-1)*n+col, (levels-1)*n+(col+1)%n, levels*n))
    return {"vertices": mesh_vertices, "faces": faces, "boundary_count": n,
            "levels": levels, "apex_index": n*levels, "axis": axis}
