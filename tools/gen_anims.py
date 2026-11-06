"""Generate R15 KeyframeSequence files (.rbxmx) for player animations.

The animations are made in code (poses below), so they belong to us. Denis publishes them once
from Studio under his account (docs/ANIMATIONS.md), then the ids go into Config.PlayerAnims.

Usage: python3 tools/gen_anims.py  ->  src/studio/Anims/{Carry,Push,Celebrate}.rbxmx
"""
import math
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "src" / "studio" / "Anims"

# R15 joint tree: pose name -> children (pose names are Motor6D Part1 names)
TREE = {
    "HumanoidRootPart": ["LowerTorso"],
    "LowerTorso": ["UpperTorso", "LeftUpperLeg", "RightUpperLeg"],
    "UpperTorso": ["Head", "LeftUpperArm", "RightUpperArm"],
    "LeftUpperArm": ["LeftLowerArm"],
    "LeftLowerArm": ["LeftHand"],
    "RightUpperArm": ["RightLowerArm"],
    "RightLowerArm": ["RightHand"],
    "LeftUpperLeg": ["LeftLowerLeg"],
    "LeftLowerLeg": ["LeftFoot"],
    "RightUpperLeg": ["RightLowerLeg"],
    "RightLowerLeg": ["RightFoot"],
}

LINEAR, CUBIC = 0, 3
IN_OUT = 2
PRIORITY_ACTION = 2


def angles(rx, ry, rz):
    """Rotation matrix of CFrame.Angles(rx, ry, rz) = Rx * Ry * Rz (degrees in)."""
    rx, ry, rz = (math.radians(a) for a in (rx, ry, rz))
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    rxm = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
    rym = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
    rzm = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]

    def mul(a, b):
        return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]

    return mul(mul(rxm, rym), rzm)


class Writer:
    def __init__(self):
        self.ref = 0
        self.lines = []

    def next_ref(self):
        self.ref += 1
        return f"RBX{self.ref:08X}"

    def cframe(self, rot, pos=(0, 0, 0)):
        r = [f"<R{i}{j}>{rot[i][j]:.6f}</R{i}{j}>" for i in range(3) for j in range(3)]
        return f'<CoordinateFrame name="CFrame"><X>{pos[0]}</X><Y>{pos[1]}</Y><Z>{pos[2]}</Z>{"".join(r)}</CoordinateFrame>'

    def pose(self, name, poses, depth):
        ind = "  " * depth
        keyed = name in poses
        rot = angles(*poses[name]) if keyed else angles(0, 0, 0)
        self.lines.append(f'{ind}<Item class="Pose" referent="{self.next_ref()}"><Properties>'
                          f'<string name="Name">{name}</string>{self.cframe(rot)}'
                          f'<token name="EasingDirection">{IN_OUT}</token><token name="EasingStyle">{CUBIC}</token>'
                          f'<float name="Weight">{1 if keyed else 0}</float></Properties>')
        for child in TREE.get(name, []):
            if self.subtree_needed(child, poses):
                self.pose(child, poses, depth + 1)
        self.lines.append(f"{ind}</Item>")

    def subtree_needed(self, name, poses):
        return name in poses or any(self.subtree_needed(c, poses) for c in TREE.get(name, []))

    def sequence(self, name, loop, frames):
        self.lines.append('<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" '
                          'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
                          'xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">')
        self.lines.append(f'<Item class="KeyframeSequence" referent="{self.next_ref()}"><Properties>'
                          f'<string name="Name">{name}</string><bool name="Loop">{"true" if loop else "false"}</bool>'
                          f'<token name="Priority">{PRIORITY_ACTION}</token></Properties>')
        for t, poses in frames:
            self.lines.append(f'  <Item class="Keyframe" referent="{self.next_ref()}"><Properties>'
                              f'<string name="Name">Keyframe</string><float name="Time">{t}</float></Properties>')
            self.pose("HumanoidRootPart", poses, 2)
            self.lines.append("  </Item>")
        self.lines.append("</Item>")
        self.lines.append("</roblox>")
        return "\n".join(self.lines) + "\n"


REST_ARMS = {"LeftUpperArm": (0, 0, 0), "RightUpperArm": (0, 0, 0), "LeftLowerArm": (0, 0, 0), "RightLowerArm": (0, 0, 0)}


def arms(up, spread=0.0, elbow=0.0):
    return {
        "LeftUpperArm": (up, 0, -spread),
        "RightUpperArm": (up, 0, spread),
        "LeftLowerArm": (elbow, 0, 0),
        "RightLowerArm": (elbow, 0, 0),
    }


# Нести над головой: руки вверх, лёгкое покачивание, петля.
CARRY = [
    (0.0, arms(165, 8, 20)),
    (0.6, arms(158, 10, 28)),
    (1.2, arms(165, 8, 20)),
]

# Толчок: короткий замах и руки вперёд, корпус наклоняется.
PUSH = [
    (0.0, {**REST_ARMS, "UpperTorso": (0, 0, 0)}),
    (0.08, {**arms(-25, 5, 10), "UpperTorso": (6, 0, 0)}),
    (0.2, {**arms(95, 4, 0), "UpperTorso": (-14, 0, 0)}),
    (0.45, {**REST_ARMS, "UpperTorso": (0, 0, 0)}),
]

# Празднование перерождения: руки вверх буквой V, два взмаха.
CELEBRATE = [
    (0.0, REST_ARMS),
    (0.2, arms(160, 25, 10)),
    (0.5, arms(140, 35, 30)),
    (0.8, arms(160, 25, 10)),
    (1.1, arms(140, 35, 30)),
    (1.6, REST_ARMS),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, loop, frames in (("Carry", True, CARRY), ("Push", False, PUSH), ("Celebrate", False, CELEBRATE)):
        (OUT / f"{name}.rbxmx").write_text(Writer().sequence(name, loop, frames), encoding="utf-8")
        print("wrote", OUT / f"{name}.rbxmx")


if __name__ == "__main__":
    main()
