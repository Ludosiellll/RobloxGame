"""Voxel art: detailed legendary meteor with glowing cracks, a molten crater and crystal shards.

Usage: python3 tools/models/hero_meteor.py assets/vox/legendary_meteor.vox
"""
import sys, pathlib
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from vox import write_vox, GLOW_MARKER

SEED, R = 4, 8.0
rng = np.random.default_rng(SEED)
hexc = lambda h: tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
STONE = [hexc(h) for h in ("#2a2522", "#3d3632", "#554c46", "#71665d", "#8f8377")]
LIGHT = np.array([-0.45, 1.0, 0.35]); LIGHT /= np.linalg.norm(LIGHT)

bumps = [(d / np.linalg.norm(d), rng.uniform(0.06, 0.16), rng.uniform(0.15, 0.35)) for d in rng.normal(size=(7, 3))]
waves = [(rng.normal(size=3) * rng.uniform(1.5, 3.0), rng.uniform(0, 6.3), rng.uniform(0.02, 0.05)) for _ in range(6)]
def radius(u):
    r = 1 + sum(a * np.exp(-(1 - u @ d) / w) for d, a, w in bumps) + sum(a * np.cos(u @ w + ph) for w, ph, a in waves)
    return R * r

crater_dirs = [np.array(v, float) for v in ((0.35, 0.75, 0.55), (-0.8, 0.25, 0.5), (0.6, -0.1, -0.8), (-0.3, 0.55, -0.75))]
craters = []
for i, d in enumerate(crater_dirs):
    d = d / np.linalg.norm(d)
    craters.append((d * radius(d) * 1.13, 3.0 if i == 0 else rng.uniform(1.9, 2.4)))

n = int(R * 1.6)
inside = {}
for x in range(-n, n + 1):
    for y in range(-n, n + 1):
        for z in range(-n, n + 1):
            p = np.array([x, y / 0.9, z], float); r = np.linalg.norm(p)
            if r < 1e-6: inside[(x, y, z)] = True; continue
            u = p / r
            if r >= radius(u): continue
            if any(np.linalg.norm(np.array([x, y, z]) - c) < cr for c, cr in craters): continue
            inside[(x, y, z)] = True
# crater rims
for (c, cr) in craters:
    for x in range(int(c[0] - cr - 2), int(c[0] + cr + 3)):
        for y in range(int(c[1] - cr - 2), int(c[1] + cr + 3)):
            for z in range(int(c[2] - cr - 2), int(c[2] + cr + 3)):
                q = np.array([x, y, z], float); dist = np.linalg.norm(q - c)
                if cr <= dist < cr + 1.1 and np.linalg.norm(q) < np.linalg.norm(c) + 0.6 and np.linalg.norm(q) > np.linalg.norm(c) - cr:
                    inside[(x, y, z)] = True

filled = set(inside)
N6 = ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))
def normal(p):
    v = np.zeros(3)
    for d in N6:
        if (p[0] + d[0], p[1] + d[1], p[2] + d[2]) not in filled: v += d
    l = np.linalg.norm(v); return v / l if l else None

crack_waves = [(rng.normal(size=3) * rng.uniform(0.35, 0.6), rng.uniform(0, 6.3)) for _ in range(4)]
def crack_field(p):
    return abs(sum(np.cos(np.array(p) @ w + ph) for w, ph in crack_waves))

colors, glow = {}, set()
for p in filled:
    nrm = normal(p)
    if nrm is None:
        colors[p] = STONE[0]; continue
    light = float(nrm @ LIGHT)
    t = (light + 1) / 2 * 4.6 - 0.3 + rng.normal(0, 0.3)
    colors[p] = STONE[int(np.clip(round(t), 0, 4))]
    if crack_field(p) < 0.2:
        glow.add(p)
        inner = tuple(int(round(v)) for v in np.array(p) - nrm)
        if inner in filled: glow.add(inner)
# molten floor of the main crater
c0, cr0 = craters[0]
for p in filled:
    if normal(p) is not None and np.linalg.norm(np.array(p) - c0) < cr0 + 1.0:
        glow.add(p)
# crystal shards growing out of the rock
for d, length in (((0.85, 0.45, -0.25), 3.5), ((-0.45, 0.85, 0.25), 3.5), ((0.15, -0.15, 0.95), 2.5)):
    d = np.array(d) / np.linalg.norm(d); base = d * radius(d) * 0.92
    side = np.cross(d, [0, 1, 0]); side = side / (np.linalg.norm(side) + 1e-9)
    for s in np.arange(0, length + 0.01, 0.5):
        core = base + d * s
        width = 1 if s < length * 0.6 else 0
        for a in range(-width, width + 1):
            for b in range(-width, width + 1):
                q = tuple(int(round(v)) for v in core + side * a * 0.6 + np.cross(d, side) * b * 0.6)
                filled.add(q); colors[q] = GLOW_MARKER; glow.add(q)

voxels = {p: (GLOW_MARKER if p in glow else colors[p]) for p in filled}
out = pathlib.Path(sys.argv[1]); out.parent.mkdir(parents=True, exist_ok=True)
write_vox(out, voxels)
print(f"{out}: {len(voxels)} voxels, {len(glow)} glowing")
