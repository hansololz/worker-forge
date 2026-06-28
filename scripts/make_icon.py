"""Generate the worker-forge app icon (1024x1024 PNG).

The brand mark: a macOS-squircle rounded square in the accent orange
(`--accent` ≈ #e8833a) with the FontAwesome solid `hammer` glyph in white —
the same mark shown in the in-app sidebar brand and the startup splash. The
hammer is rendered from its real SVG path via a tiny self-contained path
flattener (cubic-bezier sampling) so there are no SVG-renderer / native deps;
only Pillow is required. Run via scripts/make_icon.sh, which also builds .icns.
"""

from __future__ import annotations

import math
import re
import sys

from PIL import Image, ImageDraw, ImageFilter

OUT = 1024      # final icon size
SS = 2          # supersample factor for anti-aliasing
S = OUT * SS

# Accent orange (design --accent oklch(0.74 0.155 52)), gentle top→bottom shade.
ACCENT_TOP = (240, 149, 82)
ACCENT_BOT = (223, 119, 44)

# FontAwesome Free 6 solid `hammer`, viewBox 576x512 — identical to the splash.
HAMMER = (
    "M413.5 237.5c-28.2 4.8-58.2-3.6-80-25.4l-38.1-38.1C280.4 159 272 138.8 272 117.6l0-12.1L192.3 62"
    "c-5.3-2.9-8.6-8.6-8.3-14.7s3.9-11.5 9.5-14l47.2-21C259.1 4.2 279 0 299.2 0l18.1 0c36.7 0 72 14 98.7 39.1"
    "l44.6 42c24.2 22.8 33.2 55.7 26.6 86L503 183l8-8c9.4-9.4 24.6-9.4 33.9 0l24 24c9.4 9.4 9.4 24.6 0 33.9"
    "l-88 88c-9.4 9.4-24.6 9.4-33.9 0l-24-24c-9.4-9.4-9.4-24.6 0-33.9l8-8-17.5-17.5zM27.4 377.1L260.9 182.6"
    "c3.5 4.9 7.5 9.6 11.8 14l38.1 38.1c6 6 12.4 11.2 19.2 15.7L134.9 484.6c-14.5 17.4-36 27.4-58.6 27.4"
    "C34.1 512 0 477.8 0 435.7c0-22.6 10.1-44.1 27.4-58.6z"
)
HVW, HVH = 576, 512


def lerp(a: int, b: int, t: float) -> int:
    return int(round(a + (b - a) * t))


def flatten_path(d: str, steps: int = 24):
    """Parse an SVG path (M/L/H/V/C/S/Z, abs+rel) into filled polygon subpaths."""
    subpaths: list[list[tuple[float, float]]] = []
    pts: list[tuple[float, float]] = []
    cx = cy = sx = sy = 0.0
    last_c2: tuple[float, float] | None = None

    cmd_re = re.compile(r"([A-Za-z])([^A-Za-z]*)")
    num_re = re.compile(r"-?\d*\.?\d+(?:[eE][-+]?\d+)?")

    def cubic(p0, p1, p2, p3):
        out = []
        for i in range(1, steps + 1):
            t = i / steps
            mt = 1 - t
            x = mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0]
            y = mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1]
            out.append((x, y))
        return out

    for m in cmd_re.finditer(d):
        c = m.group(1)
        nums = [float(x) for x in num_re.findall(m.group(2))]
        rel = c.islower()
        C = c.upper()
        i = 0
        if C == "M":
            x = nums[0] + (cx if rel else 0)
            y = nums[1] + (cy if rel else 0)
            if pts:
                subpaths.append(pts)
            pts = [(x, y)]
            cx, cy = x, y
            sx, sy = x, y
            i = 2
            while i + 1 < len(nums):  # extra pairs are implicit linetos
                x = nums[i] + (cx if rel else 0)
                y = nums[i + 1] + (cy if rel else 0)
                pts.append((x, y))
                cx, cy = x, y
                i += 2
            last_c2 = None
        elif C == "L":
            while i + 1 < len(nums):
                x = nums[i] + (cx if rel else 0)
                y = nums[i + 1] + (cy if rel else 0)
                pts.append((x, y))
                cx, cy = x, y
                i += 2
            last_c2 = None
        elif C == "H":
            for n in nums:
                cx = n + (cx if rel else 0)
                pts.append((cx, cy))
            last_c2 = None
        elif C == "V":
            for n in nums:
                cy = n + (cy if rel else 0)
                pts.append((cx, cy))
            last_c2 = None
        elif C == "C":
            while i + 5 < len(nums):
                if rel:
                    p1 = (cx + nums[i], cy + nums[i + 1])
                    p2 = (cx + nums[i + 2], cy + nums[i + 3])
                    p3 = (cx + nums[i + 4], cy + nums[i + 5])
                else:
                    p1 = (nums[i], nums[i + 1])
                    p2 = (nums[i + 2], nums[i + 3])
                    p3 = (nums[i + 4], nums[i + 5])
                pts += cubic((cx, cy), p1, p2, p3)
                cx, cy = p3
                last_c2 = p2
                i += 6
        elif C == "S":
            while i + 3 < len(nums):
                p1 = (2 * cx - last_c2[0], 2 * cy - last_c2[1]) if last_c2 else (cx, cy)
                if rel:
                    p2 = (cx + nums[i], cy + nums[i + 1])
                    p3 = (cx + nums[i + 2], cy + nums[i + 3])
                else:
                    p2 = (nums[i], nums[i + 1])
                    p3 = (nums[i + 2], nums[i + 3])
                pts += cubic((cx, cy), p1, p2, p3)
                cx, cy = p3
                last_c2 = p2
                i += 4
        elif C == "Z":
            if pts:
                subpaths.append(pts)
            pts = []
            cx, cy = sx, sy
            last_c2 = None
    if pts:
        subpaths.append(pts)
    return subpaths


def main(out_path: str) -> None:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Accent gradient clipped to a macOS-squircle rounded square.
    grad = Image.new("RGB", (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        t = y / (S - 1)
        gd.line(
            [(0, y), (S, y)],
            fill=(
                lerp(ACCENT_TOP[0], ACCENT_BOT[0], t),
                lerp(ACCENT_TOP[1], ACCENT_BOT[1], t),
                lerp(ACCENT_TOP[2], ACCENT_BOT[2], t),
            ),
        )
    margin = 96 * SS
    radius = 228 * SS
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [margin, margin, S - margin, S - margin], radius=radius, fill=255
    )
    img.paste(grad, (0, 0), mask)

    # Place the hammer: scale to ~52% of the canvas, slight -8° tilt, centered.
    target_w = 0.52 * S
    scale = target_w / HVW
    ang = math.radians(-8)
    ca, sa = math.cos(ang), math.sin(ang)
    cxoff, cyoff = S / 2, S / 2 + 6 * SS  # nudge down to optically center

    def xf(p):
        x = (p[0] - HVW / 2) * scale
        y = (p[1] - HVH / 2) * scale
        return (x * ca - y * sa + cxoff, x * sa + y * ca + cyoff)

    subpaths = [[xf(p) for p in sp] for sp in flatten_path(HAMMER)]

    # Soft drop shadow under the glyph for depth.
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    off = 7 * SS
    for sp in subpaths:
        sdraw.polygon([(x + off, y + off) for (x, y) in sp], fill=(60, 26, 4, 130))
    shadow = shadow.filter(ImageFilter.GaussianBlur(9 * SS))
    img = Image.alpha_composite(img, shadow)

    # White hammer on top.
    draw = ImageDraw.Draw(img)
    for sp in subpaths:
        draw.polygon(sp, fill=(255, 255, 255, 255))

    img = img.resize((OUT, OUT), Image.LANCZOS)
    img.save(out_path)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "build-assets/icon.png")
