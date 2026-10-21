"""Apply the identified title font look (Schibsted Grotesk ExtraBold 800) to all
h1 page titles + profile hero name, and fix stale font docs in AGENTS.md."""
import os
import re

ROOT = "/home/z/my-project/apps/web/src"
changed = []

for dirpath, _, files in os.walk(ROOT):
    for fn in files:
        if not fn.endswith(".tsx"):
            continue
        path = os.path.join(dirpath, fn)
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        orig = lines[:]
        for i, line in enumerate(lines):
            is_h1 = "<h1" in line
            is_hero = "profile-hero-name" in line
            if not (is_h1 or is_hero):
                continue
            if "font-heading" not in line:
                continue
            new = line.replace("font-bold", "font-extrabold").replace(
                "font-semibold", "font-extrabold"
            )
            if new != line:
                lines[i] = new
        if lines != orig:
            with open(path, "w", encoding="utf-8") as f:
                f.writelines(lines)
            changed.append(os.path.relpath(path, "/home/z/my-project"))

print(f"modified {len(changed)} tsx files:")
for c in changed:
    print(" -", c)

# AGENTS.md doc fixes
ag = "/home/z/my-project/AGENTS.md"
with open(ag, "r", encoding="utf-8") as f:
    content = f.read()
subs = [
    (
        "Fonts: next/font/google — Space Grotesk (headings), Inter (UI), JetBrainsMono (ALL numbers)",
        "Fonts: next/font/google — Schibsted Grotesk (headings; page titles render ExtraBold 800 per brand reference), Inter (UI), JetBrainsMono (ALL numbers)",
    ),
    ('--font-heading: "Space Grotesk", sans-serif;', '--font-heading: "Schibsted Grotesk", sans-serif;'),
    (
        "import { Space_Grotesk, Inter, JetBrains_Mono } from \"next/font/google\";",
        "import { Schibsted_Grotesk, Inter, JetBrains_Mono } from \"next/font/google\";",
    ),
]
for old, new in subs:
    if old in content:
        content = content.replace(old, new)
        print("AGENTS.md:", old[:60], "-> fixed")
    else:
        print("AGENTS.md: pattern not found:", old[:60])
with open(ag, "w", encoding="utf-8") as f:
    f.write(content)
