"""Cut one instance (with everything inside it) out of a binary Roblox place or model (.rbxl/.rbxm)
and save it as an XML model (.rbxmx) that Rojo can sync.

  python tools/rbxl_to_rbxmx.py INPUT.rbxl "ReplicatedStorage/FireballVFX" OUTPUT.rbxmx [--skip-class MeshPart ...]

Scripts are never copied. Properties that only matter to Studio or that older Rojo can't read are dropped
(UniqueId, HistoryId, Capabilities, Tags saved as SharedString, WorldPivotData, EmissiveMaskContent, ...):
the instances fall back to defaults for those. Needs lz4 and zstandard.
"""
import base64
import pathlib
import struct
import sys
from xml.sax.saxutils import escape

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import rbx_inspect as R  # noqa: E402

SCRIPTS = {"Script", "LocalScript", "ModuleScript"}
DROP = {"UniqueId", "HistoryId", "Capabilities", "WorldPivotData", "EmissiveMaskContent", "SerializedOverrides",
        "DefinesCapabilities", "ScriptGuid", "SourceAssetId", "Tags", "VoxelGridAssetContentMap"}
CONTENT = {"Texture", "TextureID", "TextureId", "MeshId", "SoundId", "AnimationId", "Image", "HoverImage", "PressedImage",
           "ColorMap", "NormalMap", "MetalnessMap", "RoughnessMap", "LinkedSource", "CageMeshId", "SkyboxBk", "SkyboxDn",
           "SkyboxFt", "SkyboxLf", "SkyboxRt", "SkyboxUp", "SunTextureId", "MoonTextureId", "CursorIcon", "AssetId",
           "Graphic", "VideoContent", "Video"}
BINARY = {"AttributesSerialize", "PhysicsData", "MeshData", "ChildData", "SmoothGrid", "PhysicsGrid", "MaterialColors",
          "CollisionGroupData"}


def f32(v: float) -> str:
    return repr(float(v))


def interleave_u64(data: bytes, n: int):
    raw = R._deinterleave(data, n, 8)
    vals = struct.unpack(f">{n}Q", raw)
    return [(v >> 1) ^ -(v & 1) for v in vals]


def read_strings(body: bytes, n: int):
    out, q = [], 0
    for _ in range(n):
        ln, = struct.unpack("<I", body[q:q + 4])
        q += 4
        out.append(body[q:q + ln])
        q += ln
    return out, q


def decode(ptype: int, body: bytes, n: int, sstr):
    """Returns a list of (xml_tag, inner_xml) per instance, or None if the type is skipped."""
    if ptype == 0x01:
        vals, _ = read_strings(body, n)
        return [("string", v) for v in vals]
    if ptype == 0x02:
        return [("bool", "true" if b else "false") for b in body[:n]]
    if ptype == 0x03:
        return [("int", str(v)) for v in R._ints(body, n)]
    if ptype == 0x04:
        return [("float", f32(v)) for v in R._floats(body, n)]
    if ptype == 0x05:
        return [("double", repr(v)) for v in struct.unpack(f"<{n}d", body[:8 * n])]
    if ptype == 0x06:
        s = R._floats(body, n)
        o = R._ints(body[4 * n:], n)
        return [("UDim", f"<S>{f32(a)}</S><O>{b}</O>") for a, b in zip(s, o)]
    if ptype == 0x07:
        xs, ys = R._floats(body, n), R._floats(body[4 * n:], n)
        xo, yo = R._ints(body[8 * n:], n), R._ints(body[12 * n:], n)
        return [("UDim2", f"<XS>{f32(a)}</XS><XO>{c}</XO><YS>{f32(b)}</YS><YO>{d}</YO>") for a, b, c, d in zip(xs, ys, xo, yo)]
    if ptype == 0x0B:
        return [("BrickColor", str(v)) for v in R._uints(body, n)]
    if ptype == 0x0C:
        r, g, b = (R._floats(body[i * 4 * n:], n) for i in range(3))
        return [("Color3", f"<R>{f32(a)}</R><G>{f32(c)}</G><B>{f32(d)}</B>") for a, c, d in zip(r, g, b)]
    if ptype == 0x0D:
        x, y = R._floats(body, n), R._floats(body[4 * n:], n)
        return [("Vector2", f"<X>{f32(a)}</X><Y>{f32(b)}</Y>") for a, b in zip(x, y)]
    if ptype == 0x0E:
        x, y, z = (R._floats(body[i * 4 * n:], n) for i in range(3))
        return [("Vector3", f"<X>{f32(a)}</X><Y>{f32(b)}</Y><Z>{f32(c)}</Z>") for a, b, c in zip(x, y, z)]
    if ptype == 0x10:
        return [("CoordinateFrame", v) for v in decode_cframes(body, n)]
    if ptype == 0x12:
        return [("token", str(v)) for v in R._uints(body, n)]
    if ptype == 0x13:
        return [("Ref", v) for v in R._refs(body, n)]
    if ptype == 0x15:
        out, q = [], 0
        for _ in range(n):
            cnt, = struct.unpack("<I", body[q:q + 4])
            q += 4
            pts = struct.unpack(f"<{cnt * 3}f", body[q:q + 12 * cnt])
            q += 12 * cnt
            out.append(("NumberSequence", " ".join(f32(v) for v in pts) + " "))
        return out
    if ptype == 0x16:
        out, q = [], 0
        for _ in range(n):
            cnt, = struct.unpack("<I", body[q:q + 4])
            q += 4
            pts = struct.unpack(f"<{cnt * 5}f", body[q:q + 20 * cnt])
            q += 20 * cnt
            out.append(("ColorSequence", " ".join(f32(v) for v in pts) + " "))
        return out
    if ptype == 0x17:
        vals = struct.unpack(f"<{2 * n}f", body[:8 * n])
        return [("NumberRange", f"{f32(vals[2 * i])} {f32(vals[2 * i + 1])} ") for i in range(n)]
    if ptype == 0x18:
        a, b, c, d = (R._floats(body[i * 4 * n:], n) for i in range(4))
        return [("Rect2D", f"<min><X>{f32(w)}</X><Y>{f32(x)}</Y></min><max><X>{f32(y)}</X><Y>{f32(z)}</Y></max>") for w, x, y, z in zip(a, b, c, d)]
    if ptype == 0x19:
        out, q = [], 0
        for _ in range(n):
            flag = body[q]
            q += 1
            if flag == 0:
                out.append(("PhysicalProperties", "<CustomPhysics>false</CustomPhysics>"))
            else:
                count = 6 if flag & 2 else 5
                v = struct.unpack(f"<{count}f", body[q:q + 4 * count])
                q += 4 * count
                out.append(("PhysicalProperties", "<CustomPhysics>true</CustomPhysics>" + "".join(
                    f"<{k}>{f32(x)}</{k}>" for k, x in zip(("Density", "Friction", "Elasticity", "FrictionWeight", "ElasticityWeight"), v))))
        return out
    if ptype == 0x1A:
        r, g, b = body[:n], body[n:2 * n], body[2 * n:3 * n]
        return [("Color3uint8", str(0xFF000000 | x << 16 | y << 8 | z)) for x, y, z in zip(r, g, b)]
    if ptype == 0x1B:
        return [("int64", str(v)) for v in interleave_u64(body, n)]
    if ptype == 0x1C:
        return [("SharedString", sstr[i][0]) for i in R._uints(body, n)]
    if ptype == 0x20:
        out, q = [], 0
        for _ in range(n):
            ln, = struct.unpack("<I", body[q:q + 4])
            fam = body[q + 4:q + 4 + ln].decode("utf-8", "replace")
            q += 4 + ln
            weight, = struct.unpack("<H", body[q:q + 2])
            style = body[q + 2]
            q += 3
            ln2, = struct.unpack("<I", body[q:q + 4])
            q += 4 + ln2
            out.append(("Font", f"<Family><url>{escape(fam)}</url></Family><Weight>{weight}</Weight><Style>{'Italic' if style == 1 else 'Normal'}</Style>"))
        return out
    return None


def decode_cframes(body: bytes, n: int):
    q, rots = 0, []
    for _ in range(n):
        rid = body[q]
        q += 1
        if rid == 0:
            rots.append(struct.unpack("<9f", body[q:q + 36]))
            q += 36
        else:
            rots.append(special_rotation(rid))
    xs, ys, zs = (R._floats(body[q + i * 4 * n:], n) for i in range(3))
    out = []
    for rot, x, y, z in zip(rots, xs, ys, zs):
        cells = "".join(f"<R{i}{j}>{f32(rot[i * 3 + j])}</R{i}{j}>" for i in range(3) for j in range(3))
        out.append(f"<X>{f32(x)}</X><Y>{f32(y)}</Y><Z>{f32(z)}</Z>{cells}")
    return out


def special_rotation(rid: int):
    # axis-aligned rotations: id = 6*right + up + 1 over the axes (+X,+Y,+Z,-X,-Y,-Z)
    axes = [(1, 0, 0), (0, 1, 0), (0, 0, 1), (-1, 0, 0), (0, -1, 0), (0, 0, -1)]
    k = rid - 1
    right, up = axes[k // 6], axes[k % 6]
    back = (right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0])
    return (right[0], up[0], back[0], right[1], up[1], back[1], right[2], up[2], back[2])


def load(path: pathlib.Path):
    data = path.read_bytes()
    assert data[:8] == b"<roblox!", "binary Roblox file expected"
    classes, insts, sstr, parent = {}, {}, [], {}
    pos = 32
    while pos < len(data):
        name = data[pos:pos + 4]
        comp, ulen = struct.unpack("<II", data[pos + 4:pos + 12])
        pos += 16
        payload = data[pos:pos + (comp or ulen)]
        pos += comp or ulen
        chunk = R._decompress(comp, ulen, payload)
        if name == b"END\0":
            break
        if name == b"INST":
            cid, = struct.unpack("<i", chunk[:4])
            ln, = struct.unpack("<I", chunk[4:8])
            cname = chunk[8:8 + ln].decode()
            p = 9 + ln
            cnt, = struct.unpack("<I", chunk[p:p + 4])
            refs = R._refs(chunk[p + 4:p + 4 + 4 * cnt], cnt)
            classes[cid] = (cname, refs)
            for r in refs:
                insts[r] = {"class": cname, "props": {}, "children": []}
        elif name == b"SSTR":
            p, out = 4, []
            cnt, = struct.unpack("<I", chunk[p:p + 4])
            p += 4
            for _ in range(cnt):
                md5 = chunk[p:p + 16]
                p += 16
                ln, = struct.unpack("<I", chunk[p:p + 4])
                p += 4
                out.append((base64.b64encode(md5).decode(), chunk[p:p + ln]))
                p += ln
            sstr = out
        elif name == b"PROP":
            cid, = struct.unpack("<i", chunk[:4])
            ln, = struct.unpack("<I", chunk[4:8])
            pname = chunk[8:8 + ln].decode()
            ptype = chunk[8 + ln]
            cname, refs = classes[cid]
            if pname in DROP:
                continue
            try:
                vals = decode(ptype, chunk[9 + ln:], len(refs), sstr)
            except Exception as err:  # noqa: BLE001
                print(f"skip {cname}.{pname} (type 0x{ptype:02X}): {err}", file=sys.stderr)
                continue
            if vals is None:
                continue
            for r, v in zip(refs, vals):
                insts[r]["props"][pname] = v
        elif name == b"PRNT":
            cnt, = struct.unpack("<I", chunk[1:5])
            kids = R._refs(chunk[5:5 + 4 * cnt], cnt)
            pars = R._refs(chunk[5 + 4 * cnt:5 + 8 * cnt], cnt)
            for k, pr in zip(kids, pars):
                parent[k] = pr
                if pr in insts:
                    insts[pr]["children"].append(k)
    roots = [r for r in insts if parent.get(r, -1) not in insts]
    return insts, roots, sstr


def find(insts, roots, path: str):
    node_list = roots
    found = None
    for part in path.split("/"):
        found = next((r for r in node_list if insts[r]["props"].get("Name", ("", b""))[1].decode("utf-8", "replace") == part), None)
        if found is None:
            raise SystemExit(f"not found: {part} in {path}")
        node_list = insts[found]["children"]
    return found


def write(insts, root: int, sstr, out: pathlib.Path, skip: set):
    keep = []

    def collect(r):
        cls = insts[r]["class"]
        if cls in SCRIPTS or cls in skip:
            return
        keep.append(r)
        for c in insts[r]["children"]:
            collect(c)

    collect(root)
    ids = {r: f"RBX{i:X}" for i, r in enumerate(keep)}
    used_sstr = set()
    lines = ['<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">']

    def emit(r, depth):
        inst = insts[r]
        lines.append(f'<Item class="{inst["class"]}" referent="{ids[r]}"><Properties>')
        for name, (tag, value) in sorted(inst["props"].items()):
            if tag == "string":
                if name in CONTENT:
                    text = value.decode("utf-8", "replace")
                    lines.append(f'<Content name="{name}">' + (f"<url>{escape(text)}</url>" if text else "<null></null>") + "</Content>")
                elif name in BINARY:
                    lines.append(f'<BinaryString name="{name}">{base64.b64encode(value).decode()}</BinaryString>')
                else:
                    lines.append(f'<string name="{name}">{escape(value.decode("utf-8", "replace"))}</string>')
            elif tag == "Ref":
                lines.append(f'<Ref name="{name}">{ids.get(value, "null")}</Ref>')
            elif tag == "SharedString":
                used_sstr.add(value)
                lines.append(f'<SharedString name="{name}">{value}</SharedString>')
            else:
                lines.append(f'<{tag} name="{name}">{value}</{tag}>')
        lines.append("</Properties>")
        for c in inst["children"]:
            if c in ids:
                emit(c, depth + 1)
        lines.append("</Item>")

    emit(root, 0)
    if used_sstr:
        lines.append("<SharedStrings>")
        for key, data in sstr:
            if key in used_sstr:
                lines.append(f'<SharedString md5="{key}">{base64.b64encode(data).decode()}</SharedString>')
        lines.append("</SharedStrings>")
    lines.append("</roblox>")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(keep)


def main():
    args = sys.argv[1:]
    skip = set()
    while "--skip-class" in args:
        i = args.index("--skip-class")
        skip.add(args[i + 1])
        del args[i:i + 2]
    src, path, out = pathlib.Path(args[0]), args[1], pathlib.Path(args[2])
    insts, roots, sstr = load(src)
    root = find(insts, roots, path)
    count = write(insts, root, sstr, out, skip)
    print(f"{out.name}: {count} instances from {src.name}:{path}")


if __name__ == "__main__":
    main()
