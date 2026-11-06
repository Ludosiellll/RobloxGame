"""Check that every creature id in the catalog exists as a model in the brainrot pack.

Usage: python3 tools/check_catalog.py assets/packs/Brainrots.rbxm src/shared/Catalog/Creatures.luau
Needs lz4 and zstandard (see tools/rbx_inspect.py).
"""
import re, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from rbx_inspect import load

EXCLUDED = {"69"}  # deliberately left out of the catalog (Roblox moderation risk)

pack_path, catalog_path = sys.argv[1], sys.argv[2]
roots, _, _ = load(pack_path)
models = set()
for root in roots:
    for child in (root.children if root.cls == "Folder" else [root]):
        if child.cls == "Model":
            models.add(child.name)
catalog = re.findall(r'\bid = "([^"]+)"', pathlib.Path(catalog_path).read_text(encoding="utf-8"))

missing_in_pack = sorted(set(catalog) - models)
missing_in_catalog = sorted(models - set(catalog) - EXCLUDED)
if missing_in_pack:
    print("In catalog but not in pack:", ", ".join(missing_in_pack))
if missing_in_catalog:
    print("In pack but not in catalog:", ", ".join(missing_in_catalog))
if missing_in_pack or missing_in_catalog or len(catalog) != len(set(catalog)):
    sys.exit(1)
print(f"OK {len(catalog)}/{len(models)} (excluded: {', '.join(sorted(EXCLUDED & models))})")
