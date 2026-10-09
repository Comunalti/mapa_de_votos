"""Convert an official IBGE polygon shapefile ZIP to compact GeoJSON using the standard library.
Shared boundary arcs are simplified once, so adjacent municipalities keep identical borders.
Input coordinates must be geographic SIRGAS 2000/WGS 84 longitude and latitude.
"""
import argparse
import collections
import json
import math
import pathlib
import struct
import zipfile

def read_source(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        shp = archive.read(next(name for name in names if name.lower().endswith('.shp')))
        dbf = archive.read(next(name for name in names if name.lower().endswith('.dbf')))
        projection = archive.read(next(name for name in names if name.lower().endswith('.prj'))).decode()
        if 'GEOGCS' not in projection or 'Degree' not in projection:
            raise ValueError('Only geographic longitude/latitude source coordinates are supported.')
    count = struct.unpack_from('<I', dbf, 4)[0]
    header_length, record_length = struct.unpack_from('<HH', dbf, 8)
    fields = []
    for offset in range(32, header_length - 1, 32):
        if dbf[offset] == 13:
            break
        descriptor = dbf[offset:offset + 32]
        fields.append((descriptor[:11].split(b'\0')[0].decode(), descriptor[16]))
    attributes = []
    for index in range(count):
        offset = header_length + index * record_length + 1
        row = {}
        for field, length in fields:
            row[field] = dbf[offset:offset + length].decode('utf-8', errors='replace').strip()
            offset += length
        attributes.append(row)
    records = []
    offset = 100
    point_pool = {}
    while offset < len(shp):
        index, words = struct.unpack_from('>II', shp, offset)
        body = memoryview(shp)[offset + 8:offset + 8 + words * 2]
        kind = struct.unpack_from('<I', body, 0)[0]
        if kind not in (5, 15, 25):
            raise ValueError('Only polygon shapefile records are supported.')
        parts, points = struct.unpack_from('<II', body, 36)
        starts = list(struct.unpack_from('<' + 'I' * parts, body, 44)) + [points]
        coordinates = []
        point_offset = 44 + parts * 4
        for index in range(points):
            longitude, latitude = struct.unpack_from('<dd', body, point_offset + index * 16)
            if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
                raise ValueError('Invalid longitude/latitude.')
            point = (round(longitude, 8), round(latitude, 8))
            coordinates.append(point_pool.setdefault(point, point))
        rings = []
        for first, last in zip(starts, starts[1:]):
            ring = []
            for point in coordinates[first:last]:
                if not ring or point != ring[-1]:
                    ring.append(point)
            if ring[-1] != ring[0]:
                ring.append(ring[0])
            if len(ring) < 4:
                raise ValueError('Invalid polygon ring.')
            rings.append(ring)
        records.append((attributes[len(records)]['CD_MUN'], rings))
        offset += 8 + words * 2
    if len(records) != count:
        raise ValueError('SHP and DBF record counts differ.')
    return records

def area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:])) / 2

def distance_squared(point, first, last):
    x, y = point
    dx, dy = last[0] - first[0], last[1] - first[1]
    if dx or dy:
        t = max(0.0, min(1.0, ((x - first[0]) * dx + (y - first[1]) * dy) / (dx * dx + dy * dy)))
        px, py = first[0] + t * dx, first[1] + t * dy
    else:
        px, py = first
    return (x - px) ** 2 + (y - py) ** 2

def rdp(points, tolerance):
    if len(points) <= 2:
        return list(points)
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    threshold = tolerance * tolerance
    while stack:
        first, last = stack.pop()
        furthest, distance = None, threshold
        for index in range(first + 1, last):
            candidate = distance_squared(points[index], points[first], points[last])
            if candidate > distance:
                furthest, distance = index, candidate
        if furthest is not None:
            keep.add(furthest)
            stack.extend([(first, furthest), (furthest, last)])
    return [points[index] for index in sorted(keep)]

def simplify_records(records, tolerance):
    adjacency = collections.defaultdict(set)
    for _, rings in records:
        for ring in rings:
            for first, last in zip(ring, ring[1:]):
                adjacency[first].add(last)
                adjacency[last].add(first)
    junctions = {point for point, neighbors in adjacency.items() if len(neighbors) != 2}
    arc_cache = {}
    def arc(points):
        forward = tuple(points)
        backward = forward[::-1]
        canonical = min(forward, backward)
        if canonical not in arc_cache:
            arc_cache[canonical] = rdp(canonical, tolerance)
        result = arc_cache[canonical]
        return result if canonical == forward else result[::-1]
    def ring_simplified(ring):
        indices = [index for index, point in enumerate(ring[:-1]) if point in junctions]
        if indices:
            pivot = indices[0]
            rotated = ring[pivot:-1] + ring[:pivot + 1]
            divisions = [index for index, point in enumerate(rotated) if point in junctions]
            segments = [arc(rotated[first:last + 1]) for first, last in zip(divisions, divisions[1:])]
            result = [point for segment in segments for point in segment[:-1]] + [rotated[0]]
        else:
            unique = ring[:-1]
            furthest = max(range(1, len(unique)), key=lambda index: distance_squared(unique[index], unique[0], unique[0]))
            result = rdp(unique[:furthest + 1], tolerance)[:-1] + rdp(unique[furthest:] + [unique[0]], tolerance)
        if len(result) < 4 or abs(area(result)) < 1e-12:
            return ring
        return result
    return [(code, [ring_simplified(ring) for ring in rings]) for code, rings in records]

def contains(ring, point):
    x, y = point
    inside = False
    for first, last in zip(ring, ring[1:]):
        if (first[1] > y) != (last[1] > y) and x < (last[0] - first[0]) * (y - first[1]) / (last[1] - first[1]) + first[0]:
            inside = not inside
    return inside

def geojson(records):
    features = []
    for code, rings in records:
        # ESRI polygon exteriors use clockwise winding; holes use counterclockwise winding.
        exteriors = [ring for ring in rings if area(ring) < 0]
        holes = [ring for ring in rings if area(ring) >= 0]
        if not exteriors:
            raise ValueError('No exterior polygon for ' + code)
        polygons = [[ring] for ring in exteriors]
        for hole in holes:
            owners = [polygon for polygon in polygons if contains(polygon[0], hole[0])]
            if not owners:
                raise ValueError('Orphan hole for ' + code)
            min(owners, key=lambda polygon: abs(area(polygon[0]))).append(hole)
        geometry = {'type': 'Polygon', 'coordinates': polygons[0]} if len(polygons) == 1 else {'type': 'MultiPolygon', 'coordinates': polygons}
        features.append({'type': 'Feature', 'properties': {'codarea': code}, 'geometry': geometry})
    return {'type': 'FeatureCollection', 'features': features}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('output')
    parser.add_argument('--tolerance', type=float, default=0.0075, help='Maximum RDP deviation in degrees.')
    args = parser.parse_args()
    raw = read_source(args.source)
    simplified = simplify_records(raw, args.tolerance)
    result = geojson(simplified)
    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'features': len(raw), 'rawVertices': sum(len(ring) for _, rings in raw for ring in rings),
                      'vertices': sum(len(ring) for _, rings in simplified for ring in rings), 'bytes': output.stat().st_size}))
