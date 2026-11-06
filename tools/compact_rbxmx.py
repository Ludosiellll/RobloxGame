"""Make a Roblox XML model smaller without changing any value: numbers lose trailing zeros
(-15.000000000000 -> -15, 0.250000000000 -> 0.25) and whitespace between tags is removed.

  python tools/compact_rbxmx.py IN.rbxmx OUT.rbxmx
"""
import re
import sys

NUM = re.compile(r">(-?\d+\.\d+)<")


def trim(m: re.Match) -> str:
    text = m.group(1).rstrip("0").rstrip(".")
    return ">" + (text if text not in ("", "-", "-0") else "0") + "<"


def main():
    src, out = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as f:
        data = f.read()
    data = re.sub(r">\s+<", "><", data)
    data = NUM.sub(trim, data)
    with open(out, "w", encoding="utf-8") as f:
        f.write(data)


if __name__ == "__main__":
    main()
