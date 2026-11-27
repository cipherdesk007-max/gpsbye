#!/usr/bin/env python3
"""Crea un piccolo albero .glb di prova (glTF 2.0 binario) senza librerie esterne.
Tronco (cilindro) + chioma (cono) con due materiali, nodo padre traslato e figlio ruotato/scalato."""
import json, math, struct, sys

def cylinder(seg, r, h, y0=0.0):
    pos, idx = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        pos += [[r * math.cos(a), y0, r * math.sin(a)], [r * math.cos(a), y0 + h, r * math.sin(a)]]
    for i in range(seg):
        j = (i + 1) % seg
        a0, a1, b0, b1 = 2 * i, 2 * i + 1, 2 * j, 2 * j + 1
        idx += [a0, b1, b0, a0, a1, b1]
    return pos, idx

def cone(seg, r, h, y0=0.0):
    pos, idx = [[0, y0 + h, 0]], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        pos.append([r * math.cos(a), y0, r * math.sin(a)])
    for i in range(seg):
        idx += [0, 1 + (i + 1) % seg, 1 + i]
    c = len(pos); pos.append([0, y0, 0])
    for i in range(seg):
        idx += [c, 1 + i, 1 + (i + 1) % seg]
    return pos, idx

def build(path):
    meshes, accessors, views, blob = [], [], [], bytearray()
    def add_prim(pos, idx, mat):
        nonlocal blob
        while len(blob) % 4: blob += b'\0'
        p = b''.join(struct.pack('<3f', *v) for v in pos)
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(p), 'target': 34962}); blob += p
        mn = [min(v[i] for v in pos) for i in range(3)]; mx = [max(v[i] for v in pos) for i in range(3)]
        accessors.append({'bufferView': len(views) - 1, 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': mn, 'max': mx})
        pa = len(accessors) - 1
        ib = b''.join(struct.pack('<H', i) for i in idx)
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(ib), 'target': 34963}); blob += ib
        accessors.append({'bufferView': len(views) - 1, 'componentType': 5123, 'count': len(idx), 'type': 'SCALAR'})
        return {'attributes': {'POSITION': pa}, 'indices': len(accessors) - 1, 'material': mat}
    trunk = add_prim(*cylinder(7, 0.12, 0.7), 0)
    crown = add_prim(*cone(8, 0.6, 1.2, 0.0), 1)
    crown2 = add_prim(*cone(8, 0.45, 0.9, 0.0), 1)
    meshes = [{'primitives': [trunk]}, {'primitives': [crown]}, {'primitives': [crown2]}]
    while len(blob) % 4: blob += b'\0'
    q = [0, math.sin(0.3), 0, math.cos(0.3)]
    gltf = {
        'asset': {'version': '2.0', 'generator': 'FMLAB make_glb.py'}, 'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [
            {'translation': [5, 0, 3], 'children': [1, 2, 3], 'mesh': 0},
            {'translation': [0, 0.55, 0], 'mesh': 1},
            {'translation': [0, 1.15, 0], 'rotation': q, 'scale': [0.9, 1, 0.9], 'mesh': 2},
            {'matrix': [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.35, 0.3, 0, 1], 'mesh': 0},
        ],
        'meshes': meshes,
        'materials': [
            {'pbrMetallicRoughness': {'baseColorFactor': [0.45, 0.28, 0.14, 1]}},
            {'pbrMetallicRoughness': {'baseColorFactor': [0.95, 0.45, 0.65, 1]}},
        ],
        'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(blob)}],
    }
    js = json.dumps(gltf).encode()
    while len(js) % 4: js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    open(path, 'wb').write(out)
    return len(out)

if __name__ == '__main__':
    print(build(sys.argv[1] if len(sys.argv) > 1 else '/tmp/team-grafica/albero.glb'), 'byte')
