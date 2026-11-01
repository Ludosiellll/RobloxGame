"""Read and write MagicaVoxel .vox files (single model).

Voxels are a dict {(x, y, z): (r, g, b)} with y up and colors in 0..1.
In .vox files z is up, so axes are swapped on read/write.
"""
import struct

GLOW_MARKER = (1.0, 0.0, 1.0)  # pure magenta #FF00FF marks glowing voxels


def _chunk(cid, content, children=b""):
    return cid + struct.pack("<ii", len(content), len(children)) + content + children


def write_vox(path, voxels):
    xs = [p[0] for p in voxels]; ys = [p[1] for p in voxels]; zs = [p[2] for p in voxels]
    mx, my, mz = min(xs), min(ys), min(zs)
    sx, sy, sz = max(xs) - mx + 1, max(zs) - mz + 1, max(ys) - my + 1  # vox x, vox y (depth), vox z (up)
    if max(sx, sy, sz) > 256:
        raise ValueError("model larger than 256 voxels in some direction")
    palette, index = [], {}
    def color_index(c):
        key = tuple(round(v * 255) for v in c)
        if key not in index:
            if len(palette) >= 255:
                raise ValueError("more than 255 colors")
            palette.append(key); index[key] = len(palette)
        return index[key]
    xyzi = bytearray(struct.pack("<i", len(voxels)))
    for (x, y, z), c in voxels.items():
        xyzi += struct.pack("<BBBB", x - mx, z - mz, y - my, color_index(c))
    rgba = bytearray()
    for i in range(256):
        r, g, b = palette[i] if i < len(palette) else (0, 0, 0)
        rgba += struct.pack("<BBBB", r, g, b, 255)
    children = _chunk(b"SIZE", struct.pack("<iii", sx, sy, sz)) + _chunk(b"XYZI", bytes(xyzi)) + _chunk(b"RGBA", bytes(rgba))
    with open(path, "wb") as f:
        f.write(b"VOX " + struct.pack("<i", 150) + _chunk(b"MAIN", b"", children))


def read_vox(path):
    data = open(path, "rb").read()
    if data[:4] != b"VOX ":
        raise ValueError("not a MagicaVoxel file")
    pos, voxels_raw, palette = 8, None, None
    # walk chunks inside MAIN (flat walk is enough: we only need the first XYZI and RGBA)
    end = len(data)
    pos = 8 + 12  # skip MAIN header
    while pos + 12 <= end:
        cid = data[pos:pos + 4]; n, m = struct.unpack("<ii", data[pos + 4:pos + 12])
        body = data[pos + 12:pos + 12 + n]
        if cid == b"XYZI" and voxels_raw is None:
            count = struct.unpack("<i", body[:4])[0]
            voxels_raw = [struct.unpack("<BBBB", body[4 + 4 * i:8 + 4 * i]) for i in range(count)]
        elif cid == b"RGBA" and palette is None:
            palette = [tuple(body[4 * i:4 * i + 3]) for i in range(256)]
        pos += 12 + n  # children of nested chunks follow inline and are walked too
    if voxels_raw is None:
        raise ValueError("no voxel data")
    if palette is None:
        raise ValueError("file uses the default palette; save it again from MagicaVoxel with a palette")
    out = {}
    for x, y, z, ci in voxels_raw:
        r, g, b = palette[ci - 1]
        out[(x, z, y)] = (r / 255, g / 255, b / 255)
    return out
