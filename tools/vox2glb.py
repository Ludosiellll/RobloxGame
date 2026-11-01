"""Convert a MagicaVoxel .vox file into a brick-style .glb for Roblox.

Usage: python3 tools/vox2glb.py assets/vox/meteor_big.vox assets/bricks/meteor_big.glb
Voxels painted #FF00FF go to the 'Glow' mesh (Neon + rarity color in game), the rest to 'Body'.
"""
import sys, pathlib
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from vox import read_vox, GLOW_MARKER
from gen_bricks import build, write_glb


def is_glow(c):
    return all(abs(a - b) < 0.02 for a, b in zip(c, GLOW_MARKER))


def convert(src, dst, seed=1):
    vox = read_vox(src)
    voxels = {p: ((1.0, 1.0, 1.0), True) if is_glow(c) else (c, False) for p, c in vox.items()}
    body, glow = build(voxels, np.random.default_rng(seed))
    write_glb(pathlib.Path(dst), [("Body", body, 0), ("Glow", glow, 1)])
    for name, m in (("Body", body), ("Glow", glow)):
        if m.count() > 20000:
            print(f"WARNING: {name} has {m.count()} triangles, Roblox limit is about 20000 per mesh")
    return len(vox), body.count(), glow.count()


if __name__ == "__main__":
    n, b, g = convert(sys.argv[1], sys.argv[2])
    print(f"{sys.argv[1]}: {n} voxels -> body {b} tris, glow {g} tris")
