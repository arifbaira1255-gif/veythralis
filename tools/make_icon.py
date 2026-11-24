"""
Zuno app icon generator.

Draws the mark deterministically so the icon uses exactly the brand colours and stays
crisp at every size. A geometric shield with a hexagonal aperture at its centre — the
"closed eye" idea: protection, not surveillance. No text, no letters.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 2048  # draw large, downsample for clean edges
OUT = 1024

INK = (10, 10, 18)
INDIGO = (91, 75, 255)
VIOLET = (139, 92, 246)
MINT = (62, 230, 196)


def gradient(size, c1, c2, c3, angle_deg=128.0):
    """Three-stop diagonal gradient, vectorised."""
    ang = math.radians(angle_deg)
    dx, dy = math.cos(ang), math.sin(ang)
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float64)
    proj = xs * dx + ys * dy
    t = (proj - proj.min()) / (proj.max() - proj.min())

    a = np.array(c1, dtype=np.float64)
    b = np.array(c2, dtype=np.float64)
    c = np.array(c3, dtype=np.float64)

    lower = t < 0.5
    tt = np.where(lower, t / 0.5, (t - 0.5) / 0.5)
    stop_a = np.where(lower[..., None], a, b)
    stop_b = np.where(lower[..., None], b, c)
    arr = stop_a + (stop_b - stop_a) * tt[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def shield_points(cx, cy, w, h):
    """Shield outline: squared shoulders, gently curving to a point at the bottom."""
    top, bottom = cy - h / 2, cy + h / 2
    left, right = cx - w / 2, cx + w / 2
    return [
        (left + w * 0.22, top),
        (right - w * 0.22, top),
        (right, top + h * 0.09),
        (right, top + h * 0.34),
        (right - w * 0.06, top + h * 0.72),
        (cx, bottom),
        (left + w * 0.06, top + h * 0.72),
        (left, top + h * 0.34),
        (left, top + h * 0.09),
    ]


def hexagon(cx, cy, r, rot_deg=-30):
    return [
        (cx + r * math.cos(math.radians(60 * i + rot_deg)),
         cy + r * math.sin(math.radians(60 * i + rot_deg)))
        for i in range(6)
    ]


def soft_shield_mask(size, w, h, blur):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).polygon(shield_points(size / 2, size / 2, w, h), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(blur))


def additive(img, layer_mask, colour, strength):
    """Add `strength` of `colour` where the mask is bright."""
    base = np.asarray(img.convert("RGB"), dtype=np.float64)
    m = np.asarray(layer_mask, dtype=np.float64)[..., None] / 255.0 * strength
    col = np.array(colour, dtype=np.float64)[None, None, :]
    return Image.fromarray(np.clip(base + m * col, 0, 255).astype(np.uint8), "RGB")


def build():
    # 1. background — obsidian with a soft radial lift toward the centre
    ys, xs = np.mgrid[0:S, 0:S].astype(np.float64)
    dist = np.sqrt((xs - S / 2) ** 2 + (ys - S / 2) ** 2) / (S * 0.62)
    lift = np.clip(1.0 - dist, 0.0, 1.0) ** 1.6
    bg_arr = np.array(INK, dtype=np.float64)[None, None, :] + lift[..., None] * np.array(
        [16, 16, 30], dtype=np.float64
    )[None, None, :]
    bg = Image.fromarray(np.clip(bg_arr, 0, 255).astype(np.uint8), "RGB")

    # 2. the shield, filled with the brand gradient
    grad = gradient(S, INDIGO, VIOLET, MINT, angle_deg=124.0)
    mask = soft_shield_mask(S, S * 0.50, S * 0.58, S // 900)
    canvas = bg.copy()
    canvas.paste(grad, (0, 0), mask)

    # 3. inner shadow at the base of the shield, so it sits on the background
    inner = Image.new("L", (S, S), 0)
    ImageDraw.Draw(inner).polygon(
        shield_points(S / 2, S / 2 + S * 0.012, S * 0.50, S * 0.58), fill=255
    )
    inner = inner.filter(ImageFilter.GaussianBlur(S // 120))
    shadow = Image.new("L", (S, S), 0)
    shadow.paste(inner, (int(S * 0.012), int(S * 0.016)))
    rim = Image.fromarray(
        np.clip(
            np.asarray(mask, dtype=np.float64) - np.asarray(shadow, dtype=np.float64), 0, 255
        ).astype(np.uint8),
        "L",
    )
    canvas = additive(canvas, rim, (150, 140, 255), 0.30)

    # 4. the aperture — a hexagonal hole showing the background through the mark
    ap_r = S * 0.112
    hole = Image.new("L", (S, S), 0)
    ImageDraw.Draw(hole).polygon(hexagon(S / 2, S / 2 + S * 0.010, ap_r), fill=255)
    canvas.paste(bg, (0, 0), hole)

    # 5. a thin mint rim around the aperture
    rim_line = Image.new("L", (S, S), 0)
    ImageDraw.Draw(rim_line).line(
        hexagon(S / 2, S / 2 + S * 0.010, ap_r) + [hexagon(S / 2, S / 2 + S * 0.010, ap_r)[0]],
        fill=255,
        width=max(2, int(S * 0.0055)),
        joint="curve",
    )
    rim_line = rim_line.filter(ImageFilter.GaussianBlur(S // 1400))
    canvas = additive(canvas, rim_line, MINT, 0.55)

    # 6. specular sweep across the upper-left face
    spec = Image.new("L", (S, S), 0)
    ImageDraw.Draw(spec).polygon(
        [
            (S * 0.285, S * 0.215),
            (S * 0.430, S * 0.190),
            (S * 0.605, S * 0.505),
            (S * 0.400, S * 0.530),
        ],
        fill=255,
    )
    spec = spec.filter(ImageFilter.GaussianBlur(S // 60))
    spec = Image.fromarray(
        (np.asarray(spec, dtype=np.float64) * (np.asarray(mask, dtype=np.float64) / 255.0)).astype(
            np.uint8
        ),
        "L",
    )
    canvas = additive(canvas, spec, (255, 255, 255), 0.16)

    # 7. restrained outer glow
    glow = mask.filter(ImageFilter.GaussianBlur(S // 26))
    canvas = additive(canvas, glow, INDIGO, 0.20)

    return canvas


def main():
    os.makedirs("assets/images", exist_ok=True)
    canvas = build().resize((OUT, OUT), Image.LANCZOS)
    canvas.save("assets/images/icon.png", optimize=True)
    print("wrote assets/images/icon.png", canvas.size)

    canvas.resize((512, 512), Image.LANCZOS).save("assets/images/icon-512.png", optimize=True)
    canvas.resize((192, 192), Image.LANCZOS).save("assets/images/icon-192.png", optimize=True)
    print("wrote 512 and 192 variants")


if __name__ == "__main__":
    main()
