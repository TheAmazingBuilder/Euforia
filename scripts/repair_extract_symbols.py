#!/usr/bin/env python3
"""Repair helper — map what the web app imports from @cosmoz/shared and what
the shared package exports, then diff. Also detect duplicate export names
between schema files that would break star-exports."""
import re
import sys
from collections import defaultdict
from pathlib import Path

WEB = Path("/home/z/my-project/apps/web/src")
SHARED = Path("/home/z/my-project/packages/shared/src")

# ── 1. Symbols the app imports from @cosmoz/shared ──────────────────────────
needed = defaultdict(set)  # symbol -> set of consuming files
imp_re = re.compile(r"import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+[\"']@cosmoz/shared[\"']", re.S)
for f in list(WEB.rglob("*.ts")) + list(WEB.rglob("*.tsx")):
    text = f.read_text(encoding="utf-8", errors="replace")
    for m in imp_re.finditer(text):
        for raw in m.group(1).split(","):
            name = raw.strip().replace("type ", "").strip()
            if name:
                needed[name].add(str(f.relative_to(WEB)))

# ── 2. Symbols the shared package currently exports ─────────────────────────
index = (SHARED / "index.ts").read_text()
star_files = re.findall(r'export \* from "(\./[^"]+)"', index)
named_exports = re.findall(r"export \{([^}]*)\}", index)
exported = set()
for star in star_files:
    p = SHARED / star.replace("./", "")
    if p.suffix == "":
        p = p.with_suffix(".ts")
    for m in re.finditer(r"^export (?:const|type|interface|enum|function|class) (\w+)", p.read_text(), re.M):
        exported.add(m.group(1))
for block in named_exports:
    for raw in block.split(","):
        name = raw.strip().split(" as ")[0].strip()
        if name:
            exported.add(name)

missing = sorted(set(needed) - exported)
print("=== MISSING FROM @cosmoz/shared (used by app) ===")
for name in missing:
    files = sorted(needed[name])
    print(f"{name:42s} <- {', '.join(files[:3])}{' …' if len(files) > 3 else ''}")

# ── 3. Duplicate export names across ALL schema files (star-export safety) ──
by_name = defaultdict(set)
for p in (SHARED / "schemas").glob("*.ts"):
    for m in re.finditer(r"^export (?:const|type|interface|enum|function|class) (\w+)", p.read_text(), re.M):
        by_name[m.group(1)].add(p.stem)
dupes = {k: v for k, v in by_name.items() if len(v) > 1}
print("\n=== DUPLICATE EXPORT NAMES BETWEEN SCHEMA FILES ===")
for k in sorted(dupes):
    print(f"{k}: {sorted(dupes[k])}")
if not dupes:
    print("(none)")
