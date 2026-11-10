"""Verkleinert ein Bild und gibt es als JPEG-Data-URL aus (für Rezept-Titelbilder).

Aufruf:
    python tools/bild.py <bilddatei> [--max-side 640]

Ausgabe (stdout): data:image/jpeg;base64,...  – max. 640 px an der längsten Seite, Qualität 78.
Benötigt Pillow (pip install pillow).
"""
import argparse
import base64
import io
import sys

from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('path')
    ap.add_argument('--max-side', type=int, default=640)
    args = ap.parse_args()

    with Image.open(args.path) as im:
        im = im.convert('RGB')
        scale = min(1.0, args.max_side / max(im.size))
        if scale < 1.0:
            im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=78, optimize=True)
    sys.stdout.write('data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii'))


if __name__ == '__main__':
    main()
