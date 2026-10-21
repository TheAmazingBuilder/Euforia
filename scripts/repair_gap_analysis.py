#!/usr/bin/env python3
"""Gap analysis: apiPaths.X, queryKeys.X, mockStore.Y references vs definitions."""
import re
from collections import defaultdict
from pathlib import Path

WEB = Path("/home/z/my-project/apps/web/src")

def members(path, pattern):
    src = path.read_text()
    return set(re.findall(pattern, src))

# ── apiPaths ────────────────────────────────────────────────────────────────
endpoints_src = (WEB / "lib/api/endpoints.ts").read_text()
defined_paths = set(re.findall(r"^\s{2}(\w+)\s*[:=]", endpoints_src, re.M))
used_paths = defaultdict(set)
for f in list(WEB.rglob("*.ts")) + list(WEB.rglob("*.tsx")):
    for m in re.finditer(r"apiPaths\.(\w+)", f.read_text()):
        used_paths[m.group(1)].add(str(f.relative_to(WEB)))
print("=== apiPaths USED BUT NOT DEFINED ===")
for k in sorted(set(used_paths) - defined_paths):
    print(f"  {k}  <- {sorted(used_paths[k])[:4]}")

# ── queryKeys ───────────────────────────────────────────────────────────────
keys_src = (WEB / "lib/api/keys.ts").read_text()
defined_keys = set(re.findall(r"^\s{2}(\w+)\s*[:=]", keys_src, re.M))
used_keys = defaultdict(set)
for f in list(WEB.rglob("*.ts")) + list(WEB.rglob("*.tsx")):
    for m in re.finditer(r"queryKeys\.(\w+)", f.read_text()):
        used_keys[m.group(1)].add(str(f.relative_to(WEB)))
print("=== queryKeys USED BUT NOT DEFINED ===")
for k in sorted(set(used_keys) - defined_keys):
    print(f"  {k}  <- {sorted(used_keys[k])[:4]}")

# ── mockStore members ───────────────────────────────────────────────────────
store_src = (WEB / "mocks/store.ts").read_text()
store_methods = set(re.findall(r"^\s{2}(?:async )?(\w+)\s*\(", store_src, re.M))
store_props = set(re.findall(r"^\s{2}(?:readonly |private |public )?(\w+)\s*[:=]", store_src, re.M))
store_defined = store_methods | store_props
used_store = defaultdict(set)
for f in (list(WEB.rglob("*.ts")) + list(WEB.rglob("*.tsx"))):
    if f.parent.name == "store" and f.name != "store.ts":
        pass
    txt = f.read_text()
    for m in re.finditer(r"mockStore\.(\w+)", txt):
        used_store[m.group(1)].add(str(f.relative_to(WEB)))
print("=== mockStore USED BUT NOT DEFINED ===")
for k in sorted(set(used_store) - store_defined):
    print(f"  {k}  <- {sorted(used_store[k])[:5]}")

# ── handler files vs index registration ─────────────────────────────────────
hdir = WEB / "mocks/handlers"
files = sorted(p.stem for p in hdir.glob("*.ts") if p.name != "index.ts")
idx = (hdir / "index.ts").read_text()
print("=== HANDLER FILES NOT REGISTERED IN index.ts ===")
for f in files:
    if f"{f}Handlers" not in idx:
        print(f"  {f}")
print("=== HANDLER EXPORT NAMES ===")
for f in files:
    m = re.search(r"export const (\w+)", (hdir / f"{f}.ts").read_text())
    print(f"  {f}: {m.group(1) if m else '??'}")
