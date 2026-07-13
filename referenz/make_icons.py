# Erzeugt die PWA-Icons (Vorratsglas im App-Farbschema).
from PIL import Image, ImageDraw
import os

BG = (30, 42, 32)        # --bg
JAR = (193, 120, 23)     # --accent
LID = (239, 230, 214)    # --surface
DOT = (239, 230, 214)

os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'icons'), exist_ok=True)

def make(size, path):
    s = size / 512.0
    img = Image.new('RGB', (size, size), BG)
    d = ImageDraw.Draw(img)

    def r(x0, y0, x1, y1):
        return [x0 * s, y0 * s, x1 * s, y1 * s]

    # Deckel
    d.rounded_rectangle(r(150, 90, 362, 150), radius=22 * s, fill=LID)
    # Glas-Korpus
    d.rounded_rectangle(r(120, 170, 392, 430), radius=48 * s, fill=JAR)
    # Hals zwischen Deckel und Korpus
    d.rectangle(r(170, 140, 342, 190), fill=JAR)
    # "Inhalt": drei helle Punkte
    for cx in (196, 256, 316):
        rad = 26 * s
        d.ellipse([cx * s - rad, 320 * s - rad, cx * s + rad, 320 * s + rad], fill=DOT)
    # Etikett
    d.rounded_rectangle(r(170, 210, 342, 270), radius=16 * s, fill=LID)

    img.save(path)
    print('geschrieben:', path, img.size)

base = os.path.join(os.path.dirname(__file__), '..', 'icons')
make(192, os.path.join(base, 'icon-192.png'))
make(512, os.path.join(base, 'icon-512.png'))
