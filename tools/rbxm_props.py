"""List or strip properties in binary Roblox model files (.rbxm/.rbxl).

  python tools/rbxm_props.py list FILE            # property chunks: class, name, type id
  python tools/rbxm_props.py strip FILE NAME ...  # remove property chunks by name (in place)

Removing a PROP chunk is safe: instances fall back to the property's default value. We use it to drop
properties that older Rojo versions can't read (e.g. Tags saved in a newer format). Needs lz4 and zstandard.
"""
import pathlib
import struct
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import rbx_inspect as R  # noqa: E402


def chunks(data: bytes):
    pos = 32
    while pos < len(data):
        start = pos
        name = data[pos:pos + 4]
        comp, ulen = struct.unpack("<II", data[pos + 4:pos + 12])
        pos += 16 + (comp or ulen)
        yield name, start, pos, comp, ulen


def classes(data: bytes):
    out = {}
    for name, start, end, comp, ulen in chunks(data):
        if name == b"INST":
            body = R._decompress(comp, ulen, data[start + 16:end])
            cid, = struct.unpack("<i", body[:4])
            ln, = struct.unpack("<I", body[4:8])
            out[cid] = body[8:8 + ln].decode()
    return out


def props(data: bytes):
    names = classes(data)
    for name, start, end, comp, ulen in chunks(data):
        if name == b"PROP":
            body = R._decompress(comp, ulen, data[start + 16:end])
            cid, = struct.unpack("<i", body[:4])
            ln, = struct.unpack("<I", body[4:8])
            yield names.get(cid, "?"), body[8:8 + ln].decode(), body[8 + ln], start, end


def main():
    mode, path = sys.argv[1], pathlib.Path(sys.argv[2])
    data = path.read_bytes()
    assert data[:8] == b"<roblox!", "not a binary Roblox file"
    if mode == "list":
        seen = {}
        for cls, prop, typ, _, _ in props(data):
            seen[(prop, typ)] = seen.get((prop, typ), 0) + 1
        for (prop, typ), n in sorted(seen.items()):
            print(f"{prop:32} type 0x{typ:02X}  classes {n}")
    elif mode == "strip":
        drop = set(sys.argv[3:])
        cut = [(s, e) for cls, prop, typ, s, e in props(data) if prop in drop]
        out = bytearray()
        last = 0
        for s, e in cut:
            out += data[last:s]
            last = e
        out += data[last:]
        path.write_bytes(bytes(out))
        print(f"{path.name}: removed {len(cut)} chunks ({', '.join(sorted(drop))})")


if __name__ == "__main__":
    main()
