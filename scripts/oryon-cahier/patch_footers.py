#!/usr/bin/env python3
"""Post-traitement docx - commutateurs de format des pieds de page (WPS) + purge pgNumType vides.

Règles toc.md :
  - pied de page romain (section TDM)   : instrText  PAGE \\* ROMAN \\* MERGEFORMAT
  - pied de page arabe (section corps)  : instrText  PAGE \\* arabic \\* MERGEFORMAT
  - jamais « \\* decimal » (invalide en champ Word) ;
  - supprimer les <w:pgNumType/> vides émis par docx-js (section couverture).
Les références de pied de page sont associées aux sections dans l'ordre d'apparition
de word/document.xml : 1re référence → romain, 2e → arabe.
"""
import re
import shutil
import sys
import tempfile
import zipfile

DOCX = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/download/Oryon-Cahier-des-charges-v1.0.docx"

with zipfile.ZipFile(DOCX, "r") as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

doc_xml = data["word/document.xml"].decode("utf-8")
rels_xml = data["word/_rels/document.xml.rels"].decode("utf-8")

# 1. Références de pied de page dans l'ordre du document
footer_rids = re.findall(r'<w:footerReference[^>]*r:id="(rId\d+)"', doc_xml)
print("footerReference trouvés (ordre) :", footer_rids)

# 2. rId → fichier cible
rid_to_target = dict(re.findall(r'<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"', rels_xml))

def footer_path(rid: str) -> str:
    target = rid_to_target.get(rid, "")
    target = target.lstrip("/")
    if not target.startswith("word/"):
        target = "word/" + target
    return target

# 3. Association : 1re → ROMAN, 2e → arabic
formats = ["ROMAN", "arabic"]
patched = []
for i, rid in enumerate(footer_rids[:2]):
    fpath = footer_path(rid)
    if fpath not in data:
        print(f"AVERTISSEMENT : {fpath} absent du paquet")
        continue
    fxml = data[fpath].decode("utf-8")
    fmt = formats[i]
    new_fxml, n = re.subn(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        rf"\1 PAGE \\* {fmt} \\* MERGEFORMAT \2",
        fxml,
    )
    data[fpath] = new_fxml.encode("utf-8")
    patched.append((fpath, fmt, n))
    print(f"{fpath} → PAGE \\* {fmt} ({n} champ(s))")

if len(patched) < 2:
    print("ERREUR : moins de deux pieds de page patchés - vérifier les sections")
    sys.exit(1)

# 4. Purge des pgNumType vides (couverture)
doc_xml2, n_purged = re.subn(r"<w:pgNumType/>", "", doc_xml)
data["word/document.xml"] = doc_xml2.encode("utf-8")
print(f"pgNumType vides purgés : {n_purged}")

# 5. Réécriture du paquet
tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
tmp.close()
with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(tmp.name, DOCX)
print("Paquet réécrit :", DOCX)
