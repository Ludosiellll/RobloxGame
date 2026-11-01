"""Procedural low-poly meshes for Meteor Rain: meteors and crystal clusters (OBJ, flat shaded)."""
import sys, pathlib
import numpy as np

OUT = pathlib.Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

def icosphere(level):
    t = (1 + 5 ** 0.5) / 2
    v = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
         (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
         (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    verts = [np.array(p, float) / np.linalg.norm(p) for p in v]
    for _ in range(level):
        cache, nf = {}, []
        def mid(a, b):
            k = (min(a, b), max(a, b))
            if k not in cache:
                m = verts[a] + verts[b]; verts.append(m / np.linalg.norm(m)); cache[k] = len(verts) - 1
            return cache[k]
        for a, b, c in f:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        f = nf
    return np.array(verts), np.array(f)

def write_obj(path, V, F, name):
    lines = [f"# Meteor Rain procedural mesh: {name}", f"o {name}"]
    vi = 1
    for a, b, c in F:
        pa, pb, pc = V[a], V[b], V[c]
        n = np.cross(pb - pa, pc - pa); n = n / (np.linalg.norm(n) + 1e-12)
        for p in (pa, pb, pc):
            lines.append(f"v {p[0]:.4f} {p[1]:.4f} {p[2]:.4f}")
        lines.append(f"vn {n[0]:.4f} {n[1]:.4f} {n[2]:.4f}")
    for i in range(len(F)):
        n = i + 1
        lines.append(f"f {vi}//{n} {vi+1}//{n} {vi+2}//{n}"); vi += 3
    path.write_text("\n".join(lines) + "\n")
    return len(F)

def meteor(seed, level=3):
    rng = np.random.default_rng(seed)
    V, F = icosphere(level)
    waves = [(rng.normal(size=3) * rng.uniform(1.2, 3.5), rng.uniform(0, 6.28), rng.uniform(0.02, 0.07)) for _ in range(9)]
    r = np.ones(len(V))
    for w, ph, a in waves:
        r += a * np.cos(V @ w + ph)
    craters = [(c / np.linalg.norm(c), rng.uniform(0.28, 0.55), rng.uniform(0.08, 0.16)) for c in rng.normal(size=(rng.integers(4, 7), 3))]
    for c, size, depth in craters:
        d = np.arccos(np.clip(V @ c, -1, 1)) / size
        inside = d < 1
        r[inside] -= depth * (1 - d[inside] ** 2)
        rim = (d >= 1) & (d < 1.35)
        r[rim] += depth * 0.35 * (1 - (d[rim] - 1) / 0.35)
    squash = rng.uniform(0.82, 1.0, 3)
    return V * r[:, None] * squash, F

def prism(radius, height, tip, taper=0.85):
    ang = np.arange(6) * np.pi / 3
    bot = np.stack([np.cos(ang) * radius, np.zeros(6), np.sin(ang) * radius], 1)
    top = np.stack([np.cos(ang) * radius * taper, np.full(6, height), np.sin(ang) * radius * taper], 1)
    apex = np.array([[0, height + tip, 0]]); center = np.array([[0, 0, 0]])
    V = np.vstack([bot, top, apex, center])
    F = []
    for i in range(6):
        j = (i + 1) % 6
        F += [(i, 6 + i, 6 + j), (i, 6 + j, j), (6 + i, 12, 6 + j), (13, i, j)]
    return V, np.array(F)

def rot(axis, a):
    axis = axis / np.linalg.norm(axis); x, y, z = axis; c, s = np.cos(a), np.sin(a)
    return np.array([[c + x*x*(1-c), x*y*(1-c) - z*s, x*z*(1-c) + y*s],
                     [y*x*(1-c) + z*s, c + y*y*(1-c), y*z*(1-c) - x*s],
                     [z*x*(1-c) - y*s, z*y*(1-c) + x*s, c + z*z*(1-c)]])

def crystal_cluster(seed, count):
    rng = np.random.default_rng(seed)
    parts = [(0.55, 3.2, 0.9, 0.0, 0.0, 0.0)]
    for i in range(count - 1):
        a = i / (count - 1) * 2 * np.pi + rng.uniform(-0.3, 0.3)
        parts.append((rng.uniform(0.3, 0.45), rng.uniform(1.3, 2.4), rng.uniform(0.45, 0.7), a, rng.uniform(0.35, 0.75), rng.uniform(0.35, 0.6)))
    Vs, Fs, off = [], [], 0
    for radius, h, tip, a, tilt, dist in parts:
        V, F = prism(radius, h, tip)
        V = V @ rot(np.array([0, 1, 0]), rng.uniform(0, 1)).T
        if tilt:
            V = V @ rot(np.array([-np.sin(a), 0, np.cos(a)]), tilt).T
            V = V + np.array([np.cos(a) * dist, -0.1, np.sin(a) * dist])
        Vs.append(V); Fs.append(F + off); off += len(V)
    return np.vstack(Vs), np.vstack(Fs)

def base_rock(seed):
    V, F = meteor(seed, level=2)
    V = V * np.array([1.25, 0.38, 1.25]) - np.array([0, 0.12, 0])
    return V, F

report = []
for i, s in enumerate([11, 23, 37], 1):
    V, F = meteor(s); report.append((f"meteor_{i}.obj", write_obj(OUT / f"meteor_{i}.obj", V, F, f"Meteor{i}")))
for i, (s, n) in enumerate([(5, 6), (8, 5)], 1):
    V, F = crystal_cluster(s, n); report.append((f"crystal_{i}.obj", write_obj(OUT / f"crystal_{i}.obj", V, F, f"Crystal{i}")))
V, F = base_rock(99); report.append(("crystal_base.obj", write_obj(OUT / "crystal_base.obj", V, F, "CrystalBase")))
for name, tris in report:
    print(f"{name}: {tris} triangles")
