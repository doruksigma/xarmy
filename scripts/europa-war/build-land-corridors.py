"""Precompute movement corridors from the shipped M/L/Z province geometry.

Requires Shapely >= 2.1 (development only). No polygon work runs in the game.
Usage: python scripts/europa-war/build-land-corridors.py [--check]
"""
import hashlib
import heapq
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

from shapely import constrained_delaunay_triangles, make_valid
from shapely.geometry import GeometryCollection, LineString, Point, Polygon
from shapely.ops import nearest_points, unary_union

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'app/games/europa-war/strategy/map-data.json'
OUTPUT = ROOT / 'app/games/europa-war/strategy/land-corridors.json'
data_bytes = SOURCE.read_bytes()
atlas = json.loads(data_bytes)
provinces = {p['id']: p for p in atlas['provinces']}
TOLERANCE = .055  # Half the legacy 0.1-unit coordinate rounding, not a sea bridge.


def polygons(geometry):
    if geometry.geom_type == 'Polygon':
        return [geometry]
    return [p for child in getattr(geometry, 'geoms', []) for p in polygons(child)]


def parse(path):
    rings = []
    for segment in path.split('Z'):
        if not segment:
            continue
        values = list(map(float, re.findall(r'-?\d+(?:\.\d+)?', segment)))
        rings.extend(polygons(make_valid(Polygon(list(zip(values[::2], values[1::2]))))))
    result = GeometryCollection()
    for ring in sorted(rings, key=lambda p: -p.area):
        result = result.symmetric_difference(ring)
    return make_valid(result)


geometries = {id: parse(p['path']) for id, p in provinces.items()}
# Existing regions abstract city islands, rivers and very narrow channels as
# part of one movement province (New York, Montréal, Athens and Istanbul).
# Preserve that scenario convention only inside a province and only over its
# nearest shores within 1.1 map units. Large disconnected coastal fragments
# such as Istanbul's southern Marmara piece remain separate.
internal_crossings = {}
# Reviewed city river/isthmus crossings only. Proximity alone must not turn
# the Dardanelles, Messina or an island strait into an invented land bridge.
CITY_CROSSINGS = {'turkey-1', 'usa-1', 'canada-2', 'canada-3', 'greece-0'}
for id, geometry in list(geometries.items()):
    if id not in CITY_CROSSINGS:
        continue
    parts = polygons(geometry)
    links = []
    for i, left in enumerate(parts):
        for right in parts[:i]:
            distance = left.distance(right)
            if TOLERANCE * 2 < distance <= 1.1:
                a, b = nearest_points(left, right)
                links.append(LineString([a, b]).buffer(.015, quad_segs=1))
                internal_crossings.setdefault(id, []).append([list(a.coords)[0], list(b.coords)[0]])
    if links:
        geometries[id] = unary_union([geometry, *links])
# The scenario already permits the controlled Bosphorus crossing without a
# fleet. Connect only its two nearest Istanbul shores, never the Marmara bay.
# Province partitions otherwise include disconnected fragments; sharing one
# such fragment is not proof that the actual cities have a walkable corridor.
BOSPHORUS = [(3135.6370466321246, 963.8992227979275), (3136.4, 964.1)]
strait = LineString(BOSPHORUS).buffer(.06, quad_segs=1, cap_style=2)


def corridor(a, b):
    source, target = (a['x'], a['y']), (b['x'], b['y'])
    areas = [geometries[a['id']], geometries[b['id']]]
    # Natural Earth city anchors can lie just outside its generalized shoreline
    # (at most 1.01 map units in the shipped atlas). Preserve label positions and
    # explicitly connect that marker to its own shore, never two provinces.
    for province, center in [(a, source), (b, target)]:
        point = Point(center)
        own = geometries[province['id']]
        if not own.covers(point) and own.distance(point) <= 1.1:
            shore = nearest_points(own, point)[0]
            areas.append(LineString([point, shore]).buffer(.015, quad_segs=1))
    if 'turkey-1' in [a['id'], b['id']]:
        areas.append(strait)
    area = unary_union(areas).buffer(TOLERANCE, quad_segs=1, join_style=2)
    start, end = Point(source), Point(target)
    components = [p for p in polygons(area) if p.covers(start) and p.covers(end)]
    if not components:
        return None
    area = max(components, key=lambda p: p.area)
    if area.covers(LineString([source, target])):
        return [source, target]
    triangles = list(constrained_delaunay_triangles(area).geoms)
    by_edge = defaultdict(list)
    nodes = []
    source_nodes, target_nodes = [], set()
    for i, triangle in enumerate(triangles):
        nodes.append((triangle.centroid.x, triangle.centroid.y))
        if triangle.covers(start):
            source_nodes.append(i)
        if triangle.covers(end):
            target_nodes.add(i)
        coords = list(triangle.exterior.coords)[:3]
        for n in range(3):
            edge = tuple(sorted([coords[n], coords[(n + 1) % 3]]))
            by_edge[edge].append(i)
    graph = defaultdict(list)
    for edge, owners in by_edge.items():
        if len(owners) == 2:
            middle = ((edge[0][0] + edge[1][0]) / 2, (edge[0][1] + edge[1][1]) / 2)
            left, right = owners
            graph[left].append((right, middle))
            graph[right].append((left, middle))
    heap = [(0, i) for i in source_nodes]
    heapq.heapify(heap)
    costs = {i: 0 for i in source_nodes}
    previous = {}
    found = None
    while heap:
        cost, node = heapq.heappop(heap)
        if cost != costs[node]:
            continue
        if node in target_nodes:
            found = node
            break
        for nxt, middle in graph[node]:
            candidate = cost + math.dist(nodes[node], middle) + math.dist(middle, nodes[nxt])
            if candidate < costs.get(nxt, math.inf):
                costs[nxt] = candidate
                previous[nxt] = (node, middle)
                heapq.heappush(heap, (candidate, nxt))
    if found is None:
        raise ValueError(f'Connected polygon triangulation failed: {a["id"]} {b["id"]}')
    points = [target, nodes[found]]
    while found in previous:
        found, middle = previous[found]
        points.extend([middle, nodes[found]])
    points.append(source)
    points.reverse()
    # Pull the triangle corridor taut, but only while every segment stays in
    # the same two provinces (or the explicitly supported narrow strait).
    simplified = [points[0]]
    i = 0
    while i < len(points) - 1:
        j = len(points) - 1
        while j > i + 1 and not area.covers(LineString([points[i], points[j]])):
            j -= 1
        simplified.append(points[j])
        i = j
    rounded = [[round(x, 5), round(y, 5)] for x, y in simplified]
    assert all(area.buffer(.00002).covers(LineString([x, y])) for x, y in zip(rounded, rounded[1:]))
    return rounded


curved, blocked = {}, []
count = 0
for id in sorted(provinces):
    a = provinces[id]
    for edge in sorted(a['neighbors'], key=lambda e: e['id']):
        if edge['sea'] or edge['id'] < id:
            continue
        key = id + '|' + edge['id']
        path = corridor(a, provinces[edge['id']])
        if path is None:
            blocked.append(key)
        elif len(path) > 2:
            curved[key] = path
        count += 1

result = dict(version=1, sourceSha256=hashlib.sha256(data_bytes).hexdigest(), tolerance=TOLERANCE,
              bosphorus=BOSPHORUS, internalCrossings=internal_crossings, curved=curved, blocked=blocked)
encoded = json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n'
if '--check' in sys.argv:
    if not OUTPUT.exists() or OUTPUT.read_text() != encoded:
        raise SystemExit('Land corridor asset is stale. Regenerate with build-land-corridors.py.')
    print('Land corridor asset matches the shipped geography.')
else:
    OUTPUT.write_text(encoded)
    print(json.dumps(dict(edges=count, curved=len(curved), blocked=len(blocked), bytes=len(encoded.encode()))))
