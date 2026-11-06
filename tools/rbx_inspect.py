"""Inspect Roblox model/place files (.rbxm, .rbxl binary and .rbxmx, .rbxlx XML) without Studio.

Builds the instance tree, reads names, script sources and asset references, and flags
suspicious script patterns (backdoors). Needs `lz4` and `zstandard` for binary files.

Usage:
  python3 tools/rbx_inspect.py FILE [--tree DEPTH] [--json OUT.json] [--dump-scripts DIR]
"""
import argparse, json, re, struct, sys, pathlib
from collections import Counter, defaultdict

ASSET_RE = re.compile(rb"(?:rbxassetid://|roblox\.com/asset/\?id=|rbxthumb://type=Asset&id=)(\d{3,})", re.I)

SUSPICIOUS = [
    (r"\brequire\s*\(\s*\d{5,}\s*\)", "require(<asset id>) loads remote code"),
    (r"\brequire\s*\(\s*tonumber", "require(tonumber(...)) hides a remote module id"),
    (r"\bloadstring\s*\(", "loadstring runs code from a string"),
    (r"\bgetfenv\s*\(|\bsetfenv\s*\(", "getfenv/setfenv environment tampering"),
    (r"InsertService\s*[:\.]\s*LoadAsset", "InsertService:LoadAsset loads remote models"),
    (r"discord(?:app)?\.com/api/webhooks", "Discord webhook (data exfiltration)"),
    (r"HttpService\s*[:\.]\s*(?:Get|Post|Request)Async|(?:Get|Post)Async\s*\(\s*[\"']https?://", "HTTP request"),
    (r"PromptPurchase|PromptProductPurchase|PromptGamePassPurchase", "purchase prompt"),
    (r"TeleportService", "teleports players"),
    (r"\\\d{2,3}\\\d{2,3}\\\d{2,3}", "escaped byte string (obfuscation)"),
    (r"string\.reverse|string\.char\s*\(\s*\d+\s*,\s*\d+", "string tricks (possible obfuscation)"),
    (r":Kick\s*\(|:Ban\s*\(|BanAsync", "kicks/bans players"),
    (r"MarketplaceService\s*[:\.]\s*PromptPurchase", "prompts purchase of an asset"),
]
SCRIPT_CLASSES = {"Script", "LocalScript", "ModuleScript"}


class Inst:
    __slots__ = ("ref", "cls", "props", "children", "parent")

    def __init__(self, ref, cls):
        self.ref, self.cls, self.props, self.children, self.parent = ref, cls, {}, [], None

    @property
    def name(self):
        return self.props.get("Name", "")


# ---------------- binary format ----------------
def _deinterleave(data, count, width):
    out = bytearray(count * width)
    for b in range(width):
        out[b::width] = data[b * count:(b + 1) * count]
    return bytes(out)  # each value now big-endian `width` bytes


def _ints(data, count):
    raw = _deinterleave(data, count, 4)
    vals = struct.unpack(f">{count}I", raw)
    return [(v >> 1) ^ -(v & 1) for v in vals]


def _uints(data, count):
    return list(struct.unpack(f">{count}I", _deinterleave(data, count, 4)))


def _floats(data, count):
    out = []
    for v in struct.unpack(f">{count}I", _deinterleave(data, count, 4)):
        v = ((v >> 1) | ((v & 1) << 31)) & 0xFFFFFFFF
        out.append(struct.unpack("<f", struct.pack("<I", v))[0])
    return out


def _refs(data, count):
    acc, out = 0, []
    for d in _ints(data, count):
        acc += d
        out.append(acc)
    return out


def _decompress(comp, ulen, payload):
    if comp == 0:
        return payload[:ulen]
    if payload[:4] == b"\x28\xb5\x2f\xfd":
        import zstandard
        return zstandard.ZstdDecompressor().decompress(payload, max_output_size=ulen)
    import lz4.block
    return lz4.block.decompress(payload, uncompressed_size=ulen)


def read_binary(data):
    if data[:8] != b"<roblox!":
        raise ValueError("not a binary Roblox file")
    pos = 32
    classes, insts, sstr, raw_props = {}, {}, [], defaultdict(bytes)
    order = []
    while pos < len(data):
        name = data[pos:pos + 4]
        comp, ulen = struct.unpack("<II", data[pos + 4:pos + 12])
        pos += 16
        payload = data[pos:pos + (comp or ulen)]
        pos += comp or ulen
        chunk = _decompress(comp, ulen, payload)
        if name == b"END\0":
            break
        if name == b"INST":
            cid, = struct.unpack("<i", chunk[:4])
            ln, = struct.unpack("<I", chunk[4:8])
            cname = chunk[8:8 + ln].decode("utf-8", "replace")
            p = 8 + ln
            p += 1  # object format (service flag)
            cnt, = struct.unpack("<I", chunk[p:p + 4]); p += 4
            refs = _refs(chunk[p:p + 4 * cnt], cnt)
            classes[cid] = (cname, refs)
            for r in refs:
                insts[r] = Inst(r, cname); order.append(r)
        elif name == b"SSTR":
            p = 4
            cnt, = struct.unpack("<I", chunk[p:p + 4]); p += 4
            for _ in range(cnt):
                p += 16
                ln, = struct.unpack("<I", chunk[p:p + 4]); p += 4
                sstr.append(chunk[p:p + ln]); p += ln
        elif name == b"PROP":
            cid, = struct.unpack("<i", chunk[:4])
            ln, = struct.unpack("<I", chunk[4:8])
            pname = chunk[8:8 + ln].decode("utf-8", "replace")
            p = 8 + ln
            ptype = chunk[p]; p += 1
            cname, refs = classes.get(cid, ("?", []))
            cnt = len(refs)
            body = chunk[p:]
            for m in ASSET_RE.finditer(body):
                raw_props[("assets", cname, pname)] += m.group(1) + b","
            try:
                vals = None
                if ptype == 0x01:  # String / ProtectedString / Content (legacy)
                    vals, q = [], 0
                    for _ in range(cnt):
                        sl, = struct.unpack("<I", body[q:q + 4]); q += 4
                        vals.append(body[q:q + sl]); q += sl
                    vals = [v.decode("utf-8", "replace") for v in vals]
                elif ptype == 0x02:
                    vals = [bool(b) for b in body[:cnt]]
                elif ptype == 0x03:
                    vals = _ints(body, cnt)
                elif ptype == 0x04:
                    vals = _floats(body, cnt)
                elif ptype == 0x0C:  # Color3
                    r, g, b = (_floats(body[i * 4 * cnt:(i + 1) * 4 * cnt], cnt) for i in range(3))
                    vals = list(zip(r, g, b))
                elif ptype == 0x0E:  # Vector3
                    x, y, z = (_floats(body[i * 4 * cnt:(i + 1) * 4 * cnt], cnt) for i in range(3))
                    vals = list(zip(x, y, z))
                elif ptype == 0x12:  # Enum
                    vals = _uints(body, cnt)
                elif ptype == 0x1A:  # Color3uint8
                    vals = list(zip(body[:cnt], body[cnt:2 * cnt], body[2 * cnt:3 * cnt]))
                elif ptype == 0x1C:  # SharedString
                    vals = [sstr[i] if i < len(sstr) else b"" for i in _uints(body, cnt)]
                    vals = [f"<shared {len(v)} bytes>" for v in vals]
                if vals is not None:
                    for r, v in zip(refs, vals):
                        insts[r].props[pname] = v
            except Exception:
                pass
        elif name == b"PRNT":
            cnt, = struct.unpack("<I", chunk[1:5])
            kids = _refs(chunk[5:5 + 4 * cnt], cnt)
            pars = _refs(chunk[5 + 4 * cnt:5 + 8 * cnt], cnt)
            for k, pr in zip(kids, pars):
                if k in insts and pr in insts:
                    insts[k].parent = insts[pr]; insts[pr].children.append(insts[k])
    roots = [insts[r] for r in order if insts[r].parent is None]
    assets = defaultdict(set)
    for (_, cname, pname), blob in raw_props.items():
        for a in blob.decode().strip(",").split(","):
            if a:
                assets[f"{cname}.{pname}"].add(a)
    return roots, list(insts.values()), assets


# ---------------- XML format ----------------
def read_xml(path):
    import xml.etree.ElementTree as ET
    roots, all_insts, assets = [], [], defaultdict(set)
    stack = []
    for ev, el in ET.iterparse(path, events=("start", "end")):
        tag = el.tag
        if ev == "start" and tag == "Item":
            inst = Inst(el.get("referent"), el.get("class"))
            if stack:
                inst.parent = stack[-1]; stack[-1].children.append(inst)
            else:
                roots.append(inst)
            stack.append(inst); all_insts.append(inst)
        elif ev == "end":
            if tag == "Item":
                stack.pop(); el.clear()
            elif stack and el.get("name") is not None and tag in ("string", "ProtectedString", "Content", "url", "bool", "int", "float", "token"):
                pname = el.get("name")
                text = "".join(el.itertext()) if tag != "Content" else "".join(el.itertext())
                if tag in ("string", "ProtectedString"):
                    stack[-1].props[pname] = text
                elif tag in ("Content", "url"):
                    stack[-1].props[pname] = text
                for m in ASSET_RE.finditer(text.encode()):
                    assets[f"{stack[-1].cls}.{pname}"].add(m.group(1).decode())
    return roots, all_insts, assets


def load(path):
    path = pathlib.Path(path)
    head = path.open("rb").read(16)
    if head.startswith(b"<roblox!"):
        return read_binary(path.read_bytes())
    return read_xml(str(path))


def full_name(inst):
    parts = []
    while inst is not None:
        parts.append(inst.name or inst.cls)
        inst = inst.parent
    return ".".join(reversed(parts))


def scan_script(src):
    hits = []
    for pat, why in SUSPICIOUS:
        for m in re.finditer(pat, src):
            line = src.count("\n", 0, m.start()) + 1
            hits.append((why, line, src.splitlines()[line - 1].strip()[:140] if src else ""))
    longest = max((len(l) for l in src.splitlines()), default=0)
    if longest > 1500:
        hits.append(("very long line (packed/obfuscated code?)", 0, f"{longest} chars"))
    return hits


def tree_lines(inst, depth, max_depth, max_children=12):
    lines = [f"{'  ' * depth}- {inst.name} ({inst.cls})" + (f" ×{len(inst.children)} children" if inst.children and depth == max_depth else "")]
    if depth < max_depth:
        kids = inst.children
        shown = kids[:max_children]
        for k in shown:
            lines += tree_lines(k, depth + 1, max_depth, max_children)
        if len(kids) > max_children:
            rest = Counter(k.cls for k in kids[max_children:])
            lines.append(f"{'  ' * (depth + 1)}- … and {len(kids) - max_children} more: " + ", ".join(f"{c}×{n}" for c, n in rest.most_common(6)))
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--tree", type=int, default=3)
    ap.add_argument("--json")
    ap.add_argument("--dump-scripts")
    a = ap.parse_args()
    roots, insts, assets = load(a.file)
    counts = Counter(i.cls for i in insts)
    print(f"# {pathlib.Path(a.file).name}\n")
    print(f"Instances: {len(insts)}; top classes: " + ", ".join(f"{c}×{n}" for c, n in counts.most_common(14)))
    print("\n## Tree\n")
    for r in roots:
        print("\n".join(tree_lines(r, 0, a.tree)))
    scripts = [i for i in insts if i.cls in SCRIPT_CLASSES]
    print(f"\n## Scripts ({len(scripts)})\n")
    report = []
    for s in scripts:
        src = s.props.get("Source", "")
        hits = scan_script(src)
        lines = src.count("\n") + 1 if src else 0
        flag = " ⚠ " + "; ".join(sorted({h[0] for h in hits})) if hits else ""
        print(f"- {full_name(s)} [{s.cls}, {lines} lines]{flag}")
        report.append({"path": full_name(s), "class": s.cls, "lines": lines, "hits": hits})
        if a.dump_scripts and src:
            out = pathlib.Path(a.dump_scripts) / (re.sub(r"[^\w.\-]+", "_", full_name(s))[:150] + ".luau")
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(src)
    all_ids = sorted({x for v in assets.values() for x in v})
    print(f"\n## Asset references ({len(all_ids)} unique ids)\n")
    for k in sorted(assets):
        print(f"- {k}: {len(assets[k])}")
    if a.json:
        pathlib.Path(a.json).write_text(json.dumps({"counts": counts, "scripts": report, "assets": {k: sorted(v) for k, v in assets.items()}}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
