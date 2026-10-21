"""Répare l'ordre des sections du PRD Oryon (§8-§9 mal insérées avant §7)."""
from pathlib import Path

p = Path("/home/z/my-project/docs/specs/oryon-prd.md")
text = p.read_text(encoding="utf-8")

marker8 = "## 8. Spécification du sous-système de dessin"
marker71 = "### 7.1 Candidat retenu"
header7 = "## 7. Évaluation de la bibliothèque de charting"

idx8 = text.index(marker8)
idx71 = text.index(marker71)
assert idx8 < idx71, "ordre inattendu"

# Bloc mal placé = de §8 jusqu'au début de 7.1 (inclut §8, §9 et un sentinel)
misplaced = text[idx8:idx71]
# Retirer le sentinel et les blancs de fin du bloc déplacé
misplaced_clean = misplaced.replace("<!--SUITE-->", "").rstrip() + "\n\n"

# 1) Enlever le bloc mal placé et restaurer le titre §7 devant 7.1
text = text[:idx8] + header7 + "\n\n" + text[idx71:]

# 2) Réinsérer le bloc §8-§9 juste avant le sentinel final
sentinel = "<!--SUITE-->"
last = text.rindex(sentinel)
text = text[:last] + misplaced_clean + text[last:]

p.write_text(text, encoding="utf-8")

# Vérification d'ordre
import re
order = re.findall(r"^## \d+\..*$", text, flags=re.M)
print("Sections H2 dans l'ordre :")
for o in order:
    print("  ", o)
print("Sentinels restants :", text.count(sentinel))
