"""Rewrite part properties in Roblox XML models (.rbxmx) to the names Roblox itself saves.

Some save tools write BasePart properties by their script names (Color as Color3, Size, Shape). Studio
reads those, but Rojo's XML reader expects the serialized names: Color3uint8, size, shape.

Usage: python tools/normalize_rbxmx.py FILE...   (files are rewritten in place)
"""
import sys
import xml.etree.ElementTree as ET

PART_CLASSES = {"Part", "WedgePart", "CornerWedgePart", "TrussPart", "SpawnLocation", "Seat", "VehicleSeat",
                "UnionOperation", "NegateOperation", "IntersectOperation", "MeshPart"}


def to_uint8(color: ET.Element) -> str:
    def channel(tag: str) -> int:
        node = color.find(tag)
        return max(0, min(255, round(float(node.text if node is not None and node.text else "0") * 255)))
    return str(0xFF000000 | channel("R") << 16 | channel("G") << 8 | channel("B"))


def normalize(path: str) -> int:
    tree = ET.parse(path)
    changed = 0
    for item in tree.getroot().iter("Item"):
        if item.get("class") not in PART_CLASSES:
            continue
        props = item.find("Properties")
        if props is None:
            continue
        for i, p in enumerate(list(props)):
            name = p.get("name")
            if p.tag == "Color3" and name == "Color":
                new = ET.Element("Color3uint8", {"name": "Color3uint8"})
                new.text = to_uint8(p)
                new.tail = p.tail
                props.remove(p)
                props.insert(i, new)
                changed += 1
            elif p.tag == "Vector3" and name == "Size":
                p.set("name", "size")
                changed += 1
            elif p.tag == "token" and name == "Shape":
                p.set("name", "shape")
                changed += 1
    tree.write(path, encoding="utf-8")
    return changed


if __name__ == "__main__":
    for f in sys.argv[1:]:
        print(f, normalize(f))
