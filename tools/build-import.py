"""Baut aus den Daten der Instagram-Sync die Import-Datei für die Küchenvorrat-App.

Aufruf:
    python tools/build-import.py --src <Sync-Ordner> --out <Ausgabedatei> [--max-side 640]

Der Sync-Ordner enthält data/recipes.json und optional data/images/<id>.jpg (ein Bild vom
Gericht je Rezept, kein Video). Die Bilder werden auf max. 640 px verkleinert und als Data-URL
in die Import-Datei geschrieben (Einstellungen -> Instagram-Rezepte importieren).

Die Ausgabe enthält fremde Rezepte und Bilder und gehört NICHT ins Git-Repository
(Ordner out/ und _tmp/ sind in .gitignore).
"""
import argparse
import base64
import io
import json
import os
import sys
from datetime import date

try:
    from PIL import Image
except ImportError:  # Bilder sind optional
    Image = None


def image_data_url(path, max_side):
    if Image is None or not os.path.isfile(path):
        return None
    with Image.open(path) as im:
        im = im.convert('RGB')
        scale = min(1.0, max_side / max(im.size))
        if scale < 1.0:
            im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=78, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='Sync-Ordner mit data/recipes.json')
    ap.add_argument('--out', required=True, help='Ausgabedatei (JSON)')
    ap.add_argument('--max-side', type=int, default=640)
    args = ap.parse_args()

    with open(os.path.join(args.src, 'data', 'recipes.json'), encoding='utf-8') as f:
        src = json.load(f)

    out, with_img, skipped = [], 0, 0
    for r in src.get('recipes', []):
        if r.get('demo'):
            skipped += 1
            continue
        item = dict(r)
        rid = str(r.get('id') or r.get('igId') or '')
        url = None
        for ext in ('.jpg', '.jpeg', '.png', '.webp'):
            url = image_data_url(os.path.join(args.src, 'data', 'images', rid + ext), args.max_side)
            if url:
                break
        if url:
            item['imageData'] = url
            with_img += 1
        item.pop('image', None)
        out.append(item)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    payload = {
        'app': 'kuechenvorrat-instagram',
        'version': 1,
        'generatedAt': str(date.today()),
        'recipes': out,
    }
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False)
    size_kb = os.path.getsize(args.out) // 1024
    print(f'{len(out)} Rezepte, {with_img} mit Bild, {skipped} Beispiele übersprungen -> {args.out} ({size_kb} KB)')
    if Image is None:
        print('Hinweis: Pillow fehlt, Bilder wurden nicht eingebunden (pip install pillow).', file=sys.stderr)


if __name__ == '__main__':
    main()
