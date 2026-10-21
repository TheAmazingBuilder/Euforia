"""Charty removal — line-range surgery on store.ts (mock engine) and
trading-account.service.ts (broker session aggregate). Asserts exact anchor
content before cutting so a drifted line number can never corrupt a file."""
from pathlib import Path

STORE = Path("/home/z/my-project/apps/web/src/mocks/store.ts")
SVC = Path("/home/z/my-project/apps/api/src/modules/accounts/trading-account.service.ts")


def cut(path: Path, start: int, end: int, must_start: str, must_end_after: str) -> None:
    lines = path.read_text().splitlines(keepends=True)
    assert must_start in lines[start - 1], f"{path.name}:{start} expected anchor, got: {lines[start - 1]!r}"
    assert must_end_after in lines[end], f"{path.name}:{end + 1} expected keeper, got: {lines[end]!r}"
    del lines[start - 1 : end]
    path.write_text("".join(lines))
    print(f"OK {path.name}: removed lines {start}..{end}")


# store.ts — the whole Session Live section: header line .. blank before the
# PATCH /trades/:id/notes comment (updateNotes stays).
cut(STORE, 3643, 4021, "── Session Live", "PATCH /trades/:id/notes")

# trading-account.service.ts — broker session aggregate section: comment
# line .. blank line before "── internals ──".
cut(SVC, 497, 594, "Broker session (Session-Live panel", "── internals ──")
