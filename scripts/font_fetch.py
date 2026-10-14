"""Download candidate fonts from google/fonts GitHub and render a comparison sheet
against the user's screenshot to identify the title font."""
import os
import urllib.request

CACHE = "/home/z/my-project/scripts/font-cache"
os.makedirs(CACHE, exist_ok=True)

BASE = "https://github.com/google/fonts/raw/main/ofl/"
CANDIDATES = {
    "SchibstedGrotesk": "schibstedgrotesk/SchibstedGrotesk%5Bwght%5D.ttf",
    "Archivo": "archivo/Archivo%5Bwdth,wght%5D.ttf",
    "Inter": "inter/Inter%5Bopsz,wght%5D.ttf",
    "InstrumentSans": "instrumentsans/InstrumentSans%5Bwdth,wght%5D.ttf",
    "Arimo": "arimo/Arimo%5Bwght%5D.ttf",
    "Roboto": "roboto/Roboto%5Bwdth,wght%5D.ttf",
    "HankenGrotesk": "hankengrotesk/HankenGrotesk%5Bwght%5D.ttf",
    "FamiljenGrotesk": "familjengrotesk/FamiljenGrotesk%5Bwght%5D.ttf",
}

for name, rel in CANDIDATES.items():
    dest = os.path.join(CACHE, f"{name}.ttf")
    if os.path.exists(dest) and os.path.getsize(dest) > 10000:
        print("cached", name)
        continue
    url = BASE + rel
    try:
        urllib.request.urlretrieve(url, dest)
        print("ok", name, os.path.getsize(dest))
    except Exception as e:
        print("FAIL", name, e)
