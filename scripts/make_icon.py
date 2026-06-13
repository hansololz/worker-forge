"""Generate the worker-forge app icon (1024x1024 PNG).

A rounded-square mark with three workflow nodes connected in series on a
dark→sky gradient. Run via scripts/make_icon.sh, which also builds the .icns.
"""

from __future__ import annotations

import sys

from PIL import Image, ImageDraw, ImageFilter

S = 1024


def lerp(a: int, b: int, t: float) -> int:
    return int(round(a + (b - a) * t))


def main(out_path: str) -> None:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Vertical gradient: deep navy (top) → sky blue (bottom).
    top = (15, 23, 42)  # slate-900
    bottom = (14, 165, 233)  # sky-500
    grad = Image.new("RGB", (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        t = y / (S - 1)
        gd.line(
            [(0, y), (S, y)],
            fill=(lerp(top[0], bottom[0], t), lerp(top[1], bottom[1], t), lerp(top[2], bottom[2], t)),
        )

    # Rounded-square mask (macOS "squircle"-style).
    margin = 96
    radius = 230
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [margin, margin, S - margin, S - margin], radius=radius, fill=255
    )
    img.paste(grad, (0, 0), mask)

    draw = ImageDraw.Draw(img)

    # Three nodes in a vertical series, connected by a pipe.
    cx = S // 2
    nodes = [(cx, 330), (cx, 512), (cx, 694)]
    node_r = 70

    # Connector line behind the nodes.
    draw.line([nodes[0], nodes[1], nodes[2]], fill=(255, 255, 255, 235), width=30, joint="curve")

    for x, y in nodes:
        draw.ellipse(
            [x - node_r, y - node_r, x + node_r, y + node_r],
            fill=(255, 255, 255, 255),
        )
        # inner accent dot
        ir = 26
        draw.ellipse([x - ir, y - ir, x + ir, y + ir], fill=(14, 165, 233, 255))

    # Subtle inner glow on the gradient edge.
    img = img.filter(ImageFilter.SMOOTH)

    img.save(out_path)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "build-assets/icon.png")
