#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Genera las imagenes de marca del instalador NSIS a partir del logo de YANCO.

    python tools/make-installer-art.py

Salidas (las dos que consume electron-builder.yml):

    build/installerHeader.bmp    150x57   cabecera de las paginas internas
    build/installerSidebar.bmp   164x314  lateral de la pagina final y del desinstalador

Por que BMP y de 24 bits: NSIS dibuja los mapas de bits de MUI con CreateBitmap
y no sabe leer un PNG. Y los tamanos 150x57 y 164x314 no son eleccion nuestra:
son los huecos fijos de MUI2, y si no coinciden el compilador de NSIS falla.

El logo original viaja sobre una tarjeta blanca con un marco oscuro desigual,
resto de la exportacion. Aqui se recorta el marco y los margenes blancos para
que el dibujo quede sobre blanco puro y se mezcle con el fondo del instalador.
No se amplia por encima de su tamano nativo: los 147 px de ancho del original
dan para los 148 px utiles del lateral, asi que no hay perdida visible.
"""

import sys
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "build" / "brand" / "yanco-logo.png"

HEADER_PATH = ROOT / "build" / "installerHeader.bmp"
SIDEBAR_PATH = ROOT / "build" / "installerSidebar.bmp"

# Huecos fijos de MUI2. No cambiar sin cambiar el instalador entero.
HEADER_SIZE = (150, 57)
SIDEBAR_SIZE = (164, 314)

# Margen blanco alrededor del logo dentro de cada lienzo.
HEADER_PAD = 4
SIDEBAR_PAD = 8

WHITE = (255, 255, 255)
FRAME_LEVEL = 90     # por debajo de esto un pixel cuenta como marco oscuro
CONTENT_LEVEL = 26   # diferencia con el blanco para contar como dibujo
INSET = 2            # pixeles que se tiran por lado para evitar el antialias del marco


def strip_frame(image):
    """Recorta el marco oscuro del borde, sea del grosor que sea."""
    width, height = image.size
    pixels = image.load()

    def dark_row(offset):
        return all(sum(pixels[x, offset][:3]) / 3 < FRAME_LEVEL for x in range(width))

    def dark_column(offset):
        return all(sum(pixels[offset, y][:3]) / 3 < FRAME_LEVEL for y in range(height))

    top = 0
    while top < height // 2 and dark_row(top):
        top += 1
    bottom = 0
    while bottom < height // 2 and dark_row(height - 1 - bottom):
        bottom += 1
    left = 0
    while left < width // 2 and dark_column(left):
        left += 1
    right = 0
    while right < width // 2 and dark_column(width - 1 - right):
        right += 1

    card = image.crop((left, top, width - right, height - bottom))
    return card, (top, bottom, left, right)


def strip_margins(image):
    """Quita el blanco sobrante para aprovechar el tamano nativo del dibujo."""
    diff = ImageChops.difference(image, Image.new("RGB", image.size, WHITE)).convert("L")
    box = diff.point(lambda value: 255 if value > CONTENT_LEVEL else 0).getbbox()
    if box is None:
        raise SystemExit("el logo es una imagen en blanco: no hay nada que colocar")
    return image.crop(box)


def fit(content, size, pad):
    """Escala el dibujo para que quepa entero, sin deformarlo, y lo centra."""
    box_w = size[0] - pad * 2
    box_h = size[1] - pad * 2
    scale = min(box_w / content.width, box_h / content.height)
    target = (max(1, round(content.width * scale)), max(1, round(content.height * scale)))
    resized = content.resize(target, Image.LANCZOS) if target != content.size else content

    canvas = Image.new("RGB", size, WHITE)
    canvas.paste(resized, ((size[0] - target[0]) // 2, (size[1] - target[1]) // 2))
    return canvas, scale


def main():
    if not SOURCE.exists():
        raise SystemExit(f"falta el logo de origen: {SOURCE.relative_to(ROOT)}")

    original = Image.open(SOURCE)
    # El PNG lleva canal alfa aunque hoy este todo opaco: se aplana sobre blanco
    # para que un logo con transparencia no acabe con fondo negro.
    if original.mode in ("RGBA", "LA", "P"):
        original = original.convert("RGBA")
        flat = Image.new("RGBA", original.size, WHITE + (255,))
        flat.alpha_composite(original)
        original = flat.convert("RGB")
    else:
        original = original.convert("RGB")

    card, frame = strip_frame(original)
    # El marco deja un pixel de transicion gris: se descarta.
    card = card.crop((INSET, INSET, card.width - INSET, card.height - INSET))
    content = strip_margins(card)

    print(f"origen           {original.size[0]}x{original.size[1]}  marco {frame}")
    print(f"dibujo recortado {content.size[0]}x{content.size[1]}")

    header, header_scale = fit(content, HEADER_SIZE, HEADER_PAD)
    sidebar, sidebar_scale = fit(content, SIDEBAR_SIZE, SIDEBAR_PAD)

    header.save(HEADER_PATH, "BMP")
    sidebar.save(SIDEBAR_PATH, "BMP")

    print(f"cabecera         {HEADER_PATH.name}  {HEADER_SIZE[0]}x{HEADER_SIZE[1]}  escala {header_scale:.2f}")
    print(f"lateral          {SIDEBAR_PATH.name}  {SIDEBAR_SIZE[0]}x{SIDEBAR_SIZE[1]}  escala {sidebar_scale:.2f}")


if __name__ == "__main__":
    sys.exit(main())
