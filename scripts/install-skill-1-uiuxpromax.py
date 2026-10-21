#!/usr/bin/env python3
"""Install Skill 1/6: ui-ux-pro-max-skill (nextlevelbuilder) -> project skills dir.
Assembles SKILL.md from CLI templates (frontmatter + quick-reference + skill-content)
and bundles data/ + scripts/ from src/ui-ux-pro-max (v2.13.0 canonical source)."""
import shutil
import re
from pathlib import Path

SRC = Path("/home/z/my-project/scripts/skill-sources/ui-ux-pro-max-skill")
DEST = Path("/home/z/my-project/skills/ui-ux-pro-max-skill")

DESCRIPTION = (
    "UI/UX design intelligence for web, mobile, and desktop. This skill should be used "
    "when designing, building, reviewing, or fixing interfaces, including pages, "
    "components, design systems, accessibility, interaction, responsive layout, "
    "typography, color, charts, and stack-specific UI implementation. Searchable local "
    "data: 79 searchable styles (50 active), 192 product palettes and reasoning "
    "profiles, 74 font pairings, 119 UX guidelines, 105 icons, 17 GSAP presets, 25 "
    "chart types, and 22 stacks."
)

def main() -> None:
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir(parents=True)

    # 1) Bundle scripts (exclude tests) and data
    shutil.copytree(SRC / "src/ui-ux-pro-max/scripts", DEST / "scripts",
                    ignore=shutil.ignore_patterns("tests", "__pycache__"))
    shutil.copytree(SRC / "src/ui-ux-pro-max/data", DEST / "data")

    # 2) Compose SKILL.md exactly like uipro init --ai claude does
    quick_ref = (SRC / "cli/assets/templates/base/quick-reference.md").read_text()
    body = (SRC / "cli/assets/templates/base/skill-content.md").read_text()

    body = body.replace("{{TITLE}}", "UI/UX Pro Max - Design Intelligence")
    body = body.replace("{{DESCRIPTION}}", DESCRIPTION)
    body = body.replace("{{QUICK_REFERENCE}}", quick_ref)
    body = body.replace("{{SCRIPT_PATH}}", "scripts/search.py")
    # Neutralize any remaining template artifacts
    body = re.sub(r"\{\{[A-Z_]+\}\}", "", body)

    frontmatter = (
        "---\n"
        "name: ui-ux-pro-max-skill\n"
        f"description: {DESCRIPTION}\n"
        "---\n\n"
    )
    header = (
        "> Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill "
        "(v2.13.0, MIT) - installed independently, unmodified data/scripts.\n\n"
    )
    (DEST / "SKILL.md").write_text(frontmatter + header + body)

    # 3) Provenance file
    (DEST / "SOURCE.md").write_text(
        "# ui-ux-pro-max-skill\n\n"
        "- Repo: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill\n"
        "- Version: 2.13.0 (skill.json)\n"
        "- License: MIT\n"
        "- Installed: 2026-09-23\n"
        "- Assembly: SKILL.md = claude.json frontmatter + quick-reference.md + "
        "skill-content.md (placeholders resolved); scripts/ and data/ copied from "
        "src/ui-ux-pro-max (tests excluded).\n"
    )

    n_data = sum(1 for _ in (DEST / "data").rglob("*") if _.is_file())
    n_scripts = sum(1 for _ in (DEST / "scripts").rglob("*") if _.is_file())
    print(f"OK ui-ux-pro-max-skill: SKILL.md + {n_scripts} scripts + {n_data} data files")

if __name__ == "__main__":
    main()
