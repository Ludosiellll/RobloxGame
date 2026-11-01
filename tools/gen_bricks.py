"""Brick-style (studded voxel) meshes for Meteor Rain, exported as GLB with vertex colors.

Each model is a GLB with up to two meshes: 'Body' (vertex-colored bricks) and 'Glow'
(bricks meant to use Neon material in Roblox, colored by rarity in game).
"""
import sys, json, struct, pathlib
import numpy as np

GAP, STUD_R, STUD_H, SEG = 0.0, 0.3, 0.2, 10

def hexrgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

class Mesh:
    def __init__(self): self.p, self.n, self.c = [], [], []
    def tri(self, a, b, c, col):
        a, b, c = map(np.asarray, (a, b, c))
        nrm = np.cross(b - a, c - a); l = np.linalg.norm(nrm)
        if l < 1e-9: return
        nrm = nrm / l
        for v in (a, b, c): self.p.append(v); self.n.append(nrm); self.c.append(col)
    def quad(self, a, b, c, d, col): self.tri(a, b, c, col); self.tri(a, c, d, col)
    def count(self): return len(self.p) // 3

def brick(mesh, cells, x0, y0, z0, w, d, col, filled):
    """Box occupying w x 1 x d cells at (x0,y0,z0) with seams and studs on exposed top cells."""
    gx0, gx1, gz0, gz1 = x0 + GAP, x0 + w - GAP, z0 + GAP, z0 + d - GAP
    y1 = y0 + 1 - GAP * 0.5
    cellsxz = [(x0 + i, z0 + j) for i in range(w) for j in range(d)]
    def exposed(dx, dy, dz, cs):
        return any((cx + dx, y0 + dy, cz + dz) not in filled for cx, cz in cs)
    P = lambda x, y, z: (x, y, z)
    if exposed(0, 1, 0, cellsxz): mesh.quad(P(gx0, y1, gz0), P(gx0, y1, gz1), P(gx1, y1, gz1), P(gx1, y1, gz0), col)
    if exposed(0, -1, 0, cellsxz): mesh.quad(P(gx0, y0, gz0), P(gx1, y0, gz0), P(gx1, y0, gz1), P(gx0, y0, gz1), col)
    if exposed(0, 0, -1, [(x0 + i, z0) for i in range(w)]): mesh.quad(P(gx0, y0, gz0), P(gx0, y1, gz0), P(gx1, y1, gz0), P(gx1, y0, gz0), col)
    if exposed(0, 0, 1, [(x0 + i, z0 + d - 1) for i in range(w)]): mesh.quad(P(gx0, y0, gz1), P(gx1, y0, gz1), P(gx1, y1, gz1), P(gx0, y1, gz1), col)
    if exposed(-1, 0, 0, [(x0, z0 + j) for j in range(d)]): mesh.quad(P(gx0, y0, gz0), P(gx0, y0, gz1), P(gx0, y1, gz1), P(gx0, y1, gz0), col)
    if exposed(1, 0, 0, [(x0 + w - 1, z0 + j) for j in range(d)]): mesh.quad(P(gx1, y0, gz0), P(gx1, y1, gz0), P(gx1, y1, gz1), P(gx1, y0, gz1), col)
    for cx, cz in cellsxz:
        if (cx, y0 + 1, cz) in filled: continue
        ox, oz = cx + 0.5, cz + 0.5
        ang = np.linspace(0, 2 * np.pi, SEG + 1)
        for k in range(SEG):
            a0, a1 = ang[k], ang[k + 1]
            p0 = (ox + np.cos(a0) * STUD_R, y1, oz + np.sin(a0) * STUD_R); p1 = (ox + np.cos(a1) * STUD_R, y1, oz + np.sin(a1) * STUD_R)
            q0 = (p0[0], y1 + STUD_H, p0[2]); q1 = (p1[0], y1 + STUD_H, p1[2])
            mesh.quad(p0, q0, q1, p1, col)
            mesh.tri((ox, y1 + STUD_H, oz), q1, q0, col)

def build(voxels, rng):
    """voxels: {(x,y,z): (color, glow)} -> (body Mesh, glow Mesh). Merges pairs into 2x1 bricks."""
    filled = set(voxels); used = set(); body, glow = Mesh(), Mesh()
    for key in sorted(voxels, key=lambda k: (k[1], k[0], k[2])):
        if key in used: continue
        x, y, z = key; col, g = voxels[key]; w = d = 1
        for dx, dz in ([(1, 0), (0, 1)] if rng.random() < 0.5 else [(0, 1), (1, 0)]):
            nb = (x + dx, y, z + dz)
            if nb in voxels and nb not in used and voxels[nb] == voxels[key] and rng.random() < 0.7:
                w, d = 1 + dx, 1 + dz; used.add(nb); break
        used.add(key)
        cells = [(x + i, y, z + j) for i in range(w) for j in range(d)]
        if all((cx + a, cy + b, cz + c) in filled for cx, cy, cz in cells for a, b, c in
               ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))):
            continue  # fully hidden
        brick(glow if g else body, cells, x, y, z, w, d, col, filled)
    return body, glow

def meteor_voxels(seed, R):
    rng = np.random.default_rng(seed)
    waves = [(rng.normal(size=3) * rng.uniform(1, 2.5), rng.uniform(0, 6.3), rng.uniform(0.05, 0.12)) for _ in range(6)]
    cracks = [(rng.normal(size=3) * rng.uniform(2, 4), rng.uniform(0, 6.3)) for _ in range(3)]
    stone = [hexrgb(h) for h in ('#5d6069', '#6e727c', '#4f525a', '#7d818c')]
    vox = {}
    n = int(R) + 2
    for x in range(-n, n):
        for y in range(-n, n):
            for z in range(-n, n):
                p = np.array([x + .5, y + .5, z + .5]); r = np.linalg.norm(p); u = p / (r + 1e-9)
                shape = 1 + sum(a * np.cos(u @ w + ph) for w, ph, a in waves)
                if r < R * shape:
                    crack = max(np.cos(u @ w + ph) for w, ph in cracks)
                    surface = r > R * shape - 1.2
                    vox[(x, y + n, z)] = (stone[int(rng.integers(0, 4))], bool(surface and crack > 0.965))
    return vox, rng

def crystal_voxels(seed):
    rng = np.random.default_rng(seed)
    gray = [hexrgb('#8b8f99'), hexrgb('#a3a7b0')]
    vox = {}
    for x in range(-3, 3):
        for z in range(-3, 3):
            if abs(x + .5) + abs(z + .5) < 5: vox[(x, 0, z)] = (gray[(x + z) % 2], False)
    def shard(cx, cz, h, lean_x, lean_z, size):
        for y in range(1, h + 1):
            t = y / h; s = size if t < 0.65 else max(1, size - 1) if t < 0.85 else 1
            ox, oz = int(round(cx + lean_x * y)), int(round(cz + lean_z * y))
            for i in range(s):
                for j in range(s):
                    vox[(ox + i - s // 2, y, oz + j - s // 2)] = ((1, 1, 1), True)
    shard(0, 0, 10, 0, 0, 3)
    shard(2, 2, 6, 0.3, 0.15, 2)
    shard(-2, -1, 5, -0.35, -0.15, 2)
    shard(1, -2, 4, 0.1, -0.35, 1)
    return vox, rng

def write_glb(path, meshes):
    bufs, views, accs, gl_meshes, nodes = bytearray(), [], [], [], []
    def add(arr, target, comp, typ, minmax=False):
        nonlocal bufs
        while len(bufs) % 4: bufs += b'\0'
        off = len(bufs); data = arr.astype(np.float32 if comp == 5126 else np.uint32).tobytes(); bufs += data
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data), "target": target})
        acc = {"bufferView": len(views) - 1, "componentType": comp, "count": int(arr.shape[0]), "type": typ}
        if minmax: acc["min"] = arr.min(0).tolist(); acc["max"] = arr.max(0).tolist()
        accs.append(acc); return len(accs) - 1
    materials = [{"name": "Body", "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.7}},
                 {"name": "Glow", "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.3}, "emissiveFactor": [1, 1, 1]}]
    for name, m, mat in meshes:
        if m.count() == 0: continue
        P = np.array(m.p, np.float32); N = np.array(m.n, np.float32); C = np.array(m.c, np.float32)
        C = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4).astype(np.float32)  # glTF vertex colors are linear
        ip = add(P, 34962, 5126, "VEC3", True); inn = add(N, 34962, 5126, "VEC3"); ic = add(C, 34962, 5126, "VEC3")
        idx = add(np.arange(len(P), dtype=np.uint32), 34963, 5125, "SCALAR")
        gl_meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": ip, "NORMAL": inn, "COLOR_0": ic}, "indices": idx, "material": mat}]})
        nodes.append({"name": name, "mesh": len(gl_meshes) - 1})
    gltf = {"asset": {"version": "2.0", "generator": "meteor-rain gen_bricks.py"}, "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}],
            "nodes": nodes, "meshes": gl_meshes, "materials": materials, "accessors": accs, "bufferViews": views, "buffers": [{"byteLength": len(bufs)}]}
    js = json.dumps(gltf).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    while len(bufs) % 4: bufs += b'\0'
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bufs)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bufs), 0x004E4942) + bytes(bufs)
    path.write_bytes(out)

def main():
    OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
    for name, (vox, rng) in {
        "brick_meteor_small": meteor_voxels(3, 3.2), "brick_meteor_medium": meteor_voxels(7, 4.2), "brick_meteor_large": meteor_voxels(19, 5.2),
        "brick_crystal": crystal_voxels(5),
    }.items():
        body, glow = build(vox, rng)
        write_glb(OUT / f"{name}.glb", [("Body", body, 0), ("Glow", glow, 1)])
        print(f"{name}: body {body.count()} tris, glow {glow.count()} tris")


if __name__ == "__main__":
    main()
