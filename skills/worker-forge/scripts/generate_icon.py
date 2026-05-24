"""Render the worker-forge icon to PNG and ICO.

Mirrors the design in ``assets/icon.svg`` — two solid filled gears meshing
on the diagonal: a larger 12-tooth gear in the upper-left and a smaller
8-tooth gear in the lower-right. The gears share a common module
(pitch_diameter / teeth), so their tooth pitches line up at the contact
point; the larger gear is rotated so a tooth points down-right toward the
smaller gear, and the smaller gear is rotated so a gap faces up-left back
toward the larger one. Centers are spaced slightly farther than the ideal
mesh distance so bodies and tooth tips never overlap. Each gear has a
cream center hole. Drawn at high resolution and downsampled for smooth
edges.

Run from the repo root:
    python skills/worker-forge/scripts/generate_icon.py

Outputs:
    skills/worker-forge/assets/icon.png   (512x512)
    skills/worker-forge/assets/icon.ico   (multi-size: 16,32,48,64,128,256)
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw


CANVAS = 512
SCALE = 4
SIZE = CANVAS * SCALE


BG_COLOR = (255, 247, 237)
STROKE_COLOR = (28, 25, 23)


def rounded_rect_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def draw_tooth(canvas: Image.Image, cx: float, cy: float, angle_deg: float,
               half_width: float, top_y: float, bottom_y: float,
               corner_radius: float, color: tuple[int, int, int]) -> None:
    """Draw a rounded-rectangle tooth rotated to ``angle_deg`` around (cx, cy)."""
    pad = 4
    w = int(2 * half_width) + pad * 2
    h = int(bottom_y - top_y) + pad * 2

    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(
        (pad, pad, w - pad - 1, h - pad - 1),
        radius=int(corner_radius),
        fill=color,
    )

    rotated = layer.rotate(-angle_deg, expand=True, resample=Image.BICUBIC)

    py = (top_y + bottom_y) / 2.0
    a = math.radians(angle_deg)
    rpx = -py * math.sin(a)
    rpy = py * math.cos(a)

    paste_x = int(round(cx + rpx - rotated.width / 2.0))
    paste_y = int(round(cy + rpy - rotated.height / 2.0))
    canvas.alpha_composite(rotated, (paste_x, paste_y))


def draw_gear_filled(canvas: Image.Image, cx: float, cy: float,
                     teeth: int, rotation_deg: float,
                     body_r: float, tooth_half_width: float,
                     tooth_top: float, tooth_bottom: float, tooth_radius: float,
                     hole_r: float) -> None:
    """Draw a solid filled gear silhouette with a cream center hole."""
    step = 360.0 / teeth
    for i in range(teeth):
        draw_tooth(
            canvas, cx, cy,
            rotation_deg + i * step,
            tooth_half_width, tooth_top, tooth_bottom, tooth_radius,
            STROKE_COLOR,
        )
    d = ImageDraw.Draw(canvas)
    d.ellipse(
        (cx - body_r, cy - body_r, cx + body_r, cy + body_r),
        fill=STROKE_COLOR,
    )
    d.ellipse(
        (cx - hole_r, cy - hole_r, cx + hole_r, cy + hole_r),
        fill=BG_COLOR,
    )


def render(size: int = SIZE) -> Image.Image:
    canvas_scale = size / CANVAS

    def cs(v: float) -> float:
        return v * canvas_scale

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg = Image.new("RGBA", (size, size), BG_COLOR + (255,))
    mask = rounded_rect_mask((size, size), radius=int(cs(96)))
    img.paste(bg, (0, 0), mask)

    # Big gear: 12 teeth, pitch_r = (130+165)/2 = 147.5
    # Small gear: 8 teeth, pitch_r = (81+116)/2 = 98.5
    # Shared module = 2 * pitch_r / teeth ≈ 24.6 — required for meshing.
    # Same tooth tangential half-width (19) so teeth fit each other's slots.
    # Ideal center distance = pitch_r_big + pitch_r_small = 246.
    # Actual diagonal distance between (192,192) and (372,372) = 254,
    # giving an ~8 px safety gap (bodies and tooth tips never overlap).
    # Centers chosen so the combined gear bounding box is centered on the
    # 512 canvas (~33 px of cream margin on all four sides).

    # Big gear — upper-left, rotated 15° so a tooth points down-right (135°)
    draw_gear_filled(
        img,
        cx=cs(192), cy=cs(192),
        teeth=12, rotation_deg=15.0,
        body_r=cs(130),
        tooth_half_width=cs(19),
        tooth_top=cs(-165), tooth_bottom=cs(-100),
        tooth_radius=cs(13),
        hole_r=cs(42),
    )

    # Small gear — lower-right, rotated 22.5° so a gap faces up-left (315°)
    draw_gear_filled(
        img,
        cx=cs(372), cy=cs(372),
        teeth=8, rotation_deg=22.5,
        body_r=cs(81),
        tooth_half_width=cs(19),
        tooth_top=cs(-116), tooth_bottom=cs(-64),
        tooth_radius=cs(13),
        hole_r=cs(26),
    )

    return img


def main() -> None:
    here = Path(__file__).resolve().parent
    assets = here.parent / "assets"
    assets.mkdir(parents=True, exist_ok=True)

    hi = render(SIZE)
    final = hi.resize((CANVAS, CANVAS), Image.LANCZOS)

    png_path = assets / "icon.png"
    final.save(png_path, "PNG")
    print(f"wrote {png_path}")

    ico_path = assets / "icon.ico"
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    final.save(ico_path, sizes=ico_sizes)
    print(f"wrote {ico_path}")


if __name__ == "__main__":
    main()
