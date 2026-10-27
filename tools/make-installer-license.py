#!/usr/bin/env python3
"""Convierte build/installer-license.txt en el .rtf que muestra el instalador.

El instalador NSIS dibuja la licencia con un control RichEdit: un .txt en UTF-8
saldría con los acentos rotos, y uno en UTF-16 no se lee bien en el diff. RTF es
ASCII puro con escapes \\uNNNN, así que se ve igual en cualquier Windows.

Uso:  python tools/make-installer-license.py
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "build" / "installer-license.txt"
TARGET = ROOT / "build" / "installer-license.rtf"

BODY = 18      # 9 pt
HEADING = 21   # 10.5 pt


def escape(text: str) -> str:
    out = []
    for char in text:
        if char == "\\":
            out.append("\\\\")
        elif char in "{}":
            out.append("\\" + char)
        elif char == "\t":
            out.append("\\tab ")
        elif ord(char) < 128:
            out.append(char)
        else:
            out.append("\\u%d?" % ord(char))
    return "".join(out)


def convert(source: str) -> str:
    parts = [
        r"{\rtf1\ansi\ansicpg1252\deff0",
        r"{\fonttbl{\f0\fswiss\fcharset0 Segoe UI;}}",
        r"\viewkind4\uc1\pard\fs%d" % BODY,
    ]

    for raw in source.replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("# "):
            parts.append(r"\pard\sb120\sa120\b\fs%d %s\b0\par" % (HEADING, escape(line[2:])))
        elif line.startswith("- "):
            parts.append(r"\pard\li360\fi-180\sa60\fs%d \u8226?  %s\par" % (BODY, escape(line[2:])))
        else:
            parts.append(r"\pard\sa120\fs%d %s\par" % (BODY, escape(line)))

    parts.append("}")
    return "\n".join(parts) + "\n"


def main() -> None:
    rtf = convert(SOURCE.read_text(encoding="utf-8"))
    TARGET.write_text(rtf, encoding="ascii")
    print(f"{TARGET.relative_to(ROOT)} — {len(rtf)} bytes")


if __name__ == "__main__":
    main()
