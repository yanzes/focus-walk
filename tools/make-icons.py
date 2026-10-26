"""
Genera los iconos de la app a partir del mockup aprobado.

- Recorta el recuadro grande del mockup (fondo gris incluido).
- Devuelve transparencia a las esquinas redondeadas.
- Escribe assets/icon.png (256), assets/icon.ico (256…16) y assets/tray.png.

Uso:
    python tools/make-icons.py "C:\\ruta\\al\\mockup.jpg"
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads" / "Gemini_Generated_Image_4spw24spw24spw24.jpg"

ACCENT = (124, 92, 255, 255)  # #7C5CFF, el acento de la app
ICO_SIZES = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
CORNER = 0.22  # radio del recuadro redondeado, proporción del lado


def find_tile(img):
    """Bounding box del recuadro: el único bloque casi negro y ancho del mockup."""
    px = img.load()
    xs, ys = [], []
    for y in range(100, min(img.height, 570)):
        for x in range(400, min(img.width, 1000)):
            if sum(px[x, y]) < 58:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise SystemExit("no encuentro el recuadro oscuro en el mockup")
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def make_tray():
    """Bandeja: doble chevron en el acento, legible a 16 px sobre barra clara y oscura."""
    base, ss = 512, 4
    canvas = Image.new("RGBA", (base * ss, base * ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    stroke = 64 * ss
    cx, half = base * ss // 2, 120 * ss

    for top in (132 * ss, 268 * ss):
        pts = [(cx - half, top + 112 * ss), (cx, top), (cx + half, top + 112 * ss)]
        draw.line(pts, fill=ACCENT, width=stroke, joint="curve")
        for x, y in (pts[0], pts[2]):
            r = stroke // 2
            draw.ellipse([x - r, y - r, x + r, y + r], fill=ACCENT)

    tray = canvas.resize((128, 128), Image.LANCZOS)
    tray.save(ASSETS / "tray.png")
    return tray


def main():
    if not SOURCE.exists():
        raise SystemExit(f"no encuentro el mockup: {SOURCE}")

    img = Image.open(SOURCE).convert("RGB")
    box = find_tile(img)
    side = min(box[2] - box[0], box[3] - box[1])
    # Un píxel de recorte por lado: el JPEG deja un halo gris en el borde.
    crop = img.crop((box[0] + 1, box[1] + 1, box[0] + side - 1, box[1] + side - 1))

    master = crop.convert("RGBA")
    master.putalpha(rounded_mask(master.size, round(master.width * CORNER)))
    master.save(ASSETS / "icon-source.png")

    icon256 = master.resize((256, 256), Image.LANCZOS)
    icon256.save(ASSETS / "icon.png")
    master.resize((512, 512), Image.LANCZOS).save(ASSETS / "icon-512.png")

    frames = [master.resize(size, Image.LANCZOS) for size in ICO_SIZES]
    frames[0].save(ASSETS / "icon.ico", format="ICO", sizes=ICO_SIZES, append_images=frames[1:])

    make_tray()

    print(f"recorte: {box[0]},{box[1]} {side}x{side}  (origen {img.width}x{img.height})")
    for name in ("icon.png", "icon-512.png", "icon.ico", "icon-source.png", "tray.png"):
        path = ASSETS / name
        print(f"  ok assets/{name}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
