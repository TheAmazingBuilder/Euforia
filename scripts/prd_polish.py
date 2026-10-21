"""Polish final du PRD Oryon : retire le sentinel, garantit les lignes vides avant H2/H3."""
import re
from pathlib import Path

p = Path("/home/z/my-project/docs/specs/oryon-prd.md")
text = p.read_text(encoding="utf-8")

# 1) Retirer le sentinel de concaténation
text = text.replace("<!--SUITE-->", "")

# 2) Garantir une ligne vide avant chaque titre (## / ###) si manquante
lines = text.split("\n")
out: list[str] = []
for i, line in enumerate(lines):
    if re.match(r"^#{2,3} ", line) and out and out[-1].strip() != "":
        out.append("")
    out.append(line)
text = "\n".join(out)

# 3) Nettoyage : pas de triples lignes vides
text = re.sub(r"\n{3,}", "\n\n", text)
if not text.endswith("\n"):
    text += "\n"

p.write_text(text, encoding="utf-8")

h2 = re.findall(r"^## (.+)$", text, flags=re.M)
words = len(re.findall(r"\S+", text))
print(f"Sections H2 ({len(h2)}) :")
for h in h2:
    print("  -", h)
print(f"Mots : {words} | Sentinel restant : {text.count('SUITE')}")
