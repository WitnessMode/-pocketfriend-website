import sys, struct, json

def inspect(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, length = struct.unpack('<4sII', data[:12])
    assert magic == b'glTF', 'not a GLB'
    off = 12
    gltf = None
    bin_len = 0
    while off < length:
        clen, ctype = struct.unpack('<I4s', data[off:off+8])
        chunk = data[off+8:off+8+clen]
        if ctype == b'JSON':
            gltf = json.loads(chunk.decode('utf-8'))
        elif ctype == b'BIN\x00':
            bin_len = clen
        off += 8 + clen

    print(f'FILE: {path}')
    print(f'  total bytes: {length:,}  (bin chunk: {bin_len:,})')
    print(f'  meshes: {len(gltf.get("meshes", []))}  nodes: {len(gltf.get("nodes", []))}  materials: {len(gltf.get("materials", []))}')
    print(f'  animations: {len(gltf.get("animations", []))}  skins: {len(gltf.get("skins", []))}')

    # triangle count
    accessors = gltf.get('accessors', [])
    tris = 0
    for m in gltf.get('meshes', []):
        for p in m.get('primitives', []):
            if 'indices' in p:
                tris += accessors[p['indices']]['count'] // 3
            elif 'POSITION' in p.get('attributes', {}):
                tris += accessors[p['attributes']['POSITION']]['count'] // 3
    print(f'  triangles: {tris:,}')

    # node names
    names = [n.get('name', '<unnamed>') for n in gltf.get('nodes', [])]
    print(f'  node names: {names}')

    # materials
    for i, mat in enumerate(gltf.get('materials', [])):
        pbr = mat.get('pbrMetallicRoughness', {})
        base = pbr.get('baseColorFactor')
        print(f'  material[{i}] name={mat.get("name","?")!r} baseColorFactor={base} '
              f'metallic={pbr.get("metallicFactor")} rough={pbr.get("roughnessFactor")} '
              f'tex={"baseColorTexture" in pbr}')

    # textures / images
    imgs = gltf.get('images', [])
    print(f'  images: {len(imgs)}  ' + ', '.join(
        f'{im.get("mimeType","?")}' for im in imgs))

    # overall bounds from POSITION accessors
    import math
    lo = [math.inf]*3; hi = [-math.inf]*3
    for m in gltf.get('meshes', []):
        for p in m.get('primitives', []):
            pa = p.get('attributes', {}).get('POSITION')
            if pa is None: continue
            a = accessors[pa]
            if 'min' in a and 'max' in a:
                for k in range(3):
                    lo[k] = min(lo[k], a['min'][k]); hi[k] = max(hi[k], a['max'][k])
    size = [hi[k]-lo[k] for k in range(3)]
    print(f'  bounds min={[round(v,3) for v in lo]} max={[round(v,3) for v in hi]}')
    print(f'  size  XYZ={[round(v,3) for v in size]}')

if __name__ == '__main__':
    inspect(sys.argv[1])
