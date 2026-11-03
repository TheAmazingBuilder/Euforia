#!/usr/bin/env python3
"""Phase 01 documentation validation - validate JSONC examples in doc B.
This is documentation validation only (mandate §21: do not claim runtime tests
verified the architecture when no code was changed)."""
import json, re, sys

DOC = "/home/z/my-project/docs/architecture/accounts-connectivity-domain-contracts.md"
text = open(DOC).read()

# Extract ```json / ```jsonc blocks
blocks = re.findall(r"```jsonc?\n(.*?)```", text, re.DOTALL)
ok, fail = 0, 0
for i, b in enumerate(blocks):
    # strip // comments (jsonc) - line comments only
    cleaned = re.sub(r"^\s*//.*$", "", b, flags=re.MULTILINE).strip()
    # concatenated objects `}\n{` -> make it a JSON array
    arrayed = "[\n" + re.sub(r"\}\s*\n\s*\{", "},\n{", cleaned) + "\n]"
    try:
        arr = json.loads(arrayed)
        ok += 1
        print(f"BLOCK {i}: {len(arr)} object(s) valid")
        continue
    except json.JSONDecodeError as e:
        fail += 1
        print(f"BLOCK {i} INVALID: {e}\n---\n{cleaned[:300]}\n---")

print(f"json blocks: {len(blocks)}, parsed ok: {ok}, invalid parts: {fail}")
sys.exit(1 if fail else 0)
