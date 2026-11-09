"""Hicret Derneği ve Kardeşlik Payı sitelerinin illüstrasyonlarını üretir.

İnsan figürü içermeyen, medrese ve bağış geleneğine uygun sahneler: cami ve medrese
mimarisi, rahle üzerinde Mushaf, tesbih, kuyu, kurbanlık koç, erzak kolisi, kandiller.
Görseller apps/web/public/images/<kurum>/ altına mevcut dosya adları ve ölçüleriyle yazılır.

Kullanım:  python scripts/generate_site_images.py [--out DİZİN]
Gerekli:   Pillow
"""
import argparse
import math
import random
from contextlib import contextmanager
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

S = 3  # supersampling factor; drawn S times larger, then reduced for smooth edges


def rgb(value: str, alpha: int = 255):
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha


def mix(a: str, b: str, t: float) -> str:
    ca, cb = rgb(a), rgb(b)
    return "#" + "".join(f"{round(ca[i] + (cb[i] - ca[i]) * t):02x}" for i in range(3))


PALETTES = {
    "hicret": {
        "night": "#06200f", "dark": "#0b2e17", "mid": "#1e7a34", "light": "#5fb474",
        "accent": "#d9ad55", "cream": "#f6edd6", "stone": "#c9b48a", "wood": "#8a5a2b",
    },
    "kardeslik": {
        "night": "#2a0405", "dark": "#4a0a0b", "mid": "#c2181b", "light": "#e8735f",
        "accent": "#f2c14e", "cream": "#f8e8d0", "stone": "#d6b98f", "wood": "#7a4a22",
    },
}


# --- Drawing primitives ------------------------------------------------------------------

def bezier(p0, p1, p2, p3, steps=24):
    points = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        points.append((
            u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
            u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
        ))
    return points


class Pen:
    """ImageDraw wrapper that takes coordinates in output pixels."""

    def __init__(self, draw: ImageDraw.ImageDraw):
        self.d = draw

    @staticmethod
    def _pts(points):
        return [(x * S, y * S) for x, y in points]

    def poly(self, points, fill):
        self.d.polygon(self._pts(points), fill=rgb(fill) if isinstance(fill, str) else fill)

    def rect(self, x0, y0, x1, y1, fill, radius=0):
        color = rgb(fill) if isinstance(fill, str) else fill
        if radius:
            self.d.rounded_rectangle((x0 * S, y0 * S, x1 * S, y1 * S), radius=radius * S, fill=color)
        else:
            self.d.rectangle((x0 * S, y0 * S, x1 * S, y1 * S), fill=color)

    def ellipse(self, cx, cy, rx, ry, fill):
        self.d.ellipse(((cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S),
                       fill=rgb(fill) if isinstance(fill, str) else fill)

    def circle(self, cx, cy, r, fill):
        self.ellipse(cx, cy, r, r, fill)

    def line(self, points, fill, width):
        self.d.line(self._pts(points), fill=rgb(fill) if isinstance(fill, str) else fill,
                    width=max(1, round(width * S)), joint="curve")

    def arc(self, cx, cy, rx, ry, start, end, fill, width):
        self.d.arc(((cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S), start, end,
                   fill=rgb(fill) if isinstance(fill, str) else fill, width=max(1, round(width * S)))

    def erase_poly(self, points):
        self.d.polygon(self._pts(points), fill=(0, 0, 0, 0))

    def erase_circle(self, cx, cy, r):
        self.d.ellipse(((cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S), fill=(0, 0, 0, 0))


_MASK = None


def _radial_mask():
    """Soft disc: 255 in the centre, 0 at the radius and beyond (smooth falloff)."""
    global _MASK
    if _MASK is None:
        n = 256
        data = []
        for y in range(n):
            for x in range(n):
                d = math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2)
                data.append(int(255 * max(0.0, 1 - d) ** 2))
        _MASK = Image.new("L", (n, n))
        _MASK.putdata(data)
    return _MASK


class Canvas:
    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 255))

    @contextmanager
    def layer(self, opacity: float = 1.0, blur: float = 0):
        lay = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        yield Pen(ImageDraw.Draw(lay))
        if blur:
            lay = lay.filter(ImageFilter.GaussianBlur(blur * S))
        if opacity < 1:
            lay.putalpha(lay.getchannel("A").point(lambda v: int(v * opacity)))
        self.img.alpha_composite(lay)

    def gradient(self, stops, horizontal=False):
        """stops: [(0..1, '#hex'), ...] top→bottom (or left→right)."""
        n = (self.w if horizontal else self.h) * S
        strip = Image.new("RGBA", (n, 1) if horizontal else (1, n))
        for i in range(n):
            t = i / max(1, n - 1)
            for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
                if t0 <= t <= t1:
                    color = rgb(mix(c0, c1, (t - t0) / max(1e-6, t1 - t0)))
                    break
            else:
                color = rgb(stops[-1][1])
            strip.putpixel((i, 0) if horizontal else (0, i), color)
        self.img.alpha_composite(strip.resize(self.img.size))

    def glow(self, cx, cy, radius, color, opacity=0.6):
        size = max(2, int(radius * 2 * S))
        mask = _radial_mask().resize((size, size), Image.Resampling.BILINEAR).point(lambda v: int(v * opacity))
        spot = Image.new("RGBA", (size, size), rgb(color))
        spot.putalpha(mask)
        lay = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        lay.paste(spot, (int((cx - radius) * S), int((cy - radius) * S)))
        self.img.alpha_composite(lay)

    def save(self, path: Path):
        out = self.img.resize((self.w, self.h), Image.Resampling.LANCZOS)
        if out.getchannel("A").getextrema()[0] == 255:
            out = out.convert("RGB")
        path.parent.mkdir(parents=True, exist_ok=True)
        out.save(path, optimize=True)


# --- Ornaments ---------------------------------------------------------------------------

def star8(cx, cy, r, inner=0.72):
    points = []
    for i in range(16):
        angle = math.pi / 8 * i - math.pi / 2
        radius = r if i % 2 == 0 else r * inner
        points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return points


def star5(cx, cy, r):
    points = []
    for i in range(10):
        angle = math.pi / 5 * i - math.pi / 2
        radius = r if i % 2 == 0 else r * 0.45
        points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return points


def girih(c: Canvas, color, opacity=0.08, cell=120, width=1.6):
    """Eight-pointed star lattice (girih) across the canvas."""
    with c.layer(opacity) as p:
        for row in range(-1, c.h // cell + 2):
            for col in range(-1, c.w // cell + 2):
                cx, cy = col * cell + (cell / 2 if row % 2 else 0), row * cell * 0.87
                pts = star8(cx, cy, cell * 0.36, inner=0.78)
                p.line(pts + [pts[0]], color, width)
                p.circle(cx, cy, cell * 0.05, color)


def crescent(c: Canvas, cx, cy, r, color, opacity=0.9, star=True):
    with c.layer(opacity) as p:
        p.circle(cx, cy, r, color)
        p.erase_circle(cx + r * 0.38, cy - r * 0.12, r * 0.84)
        if star:
            p.poly(star5(cx + r * 0.62, cy - r * 0.05, r * 0.22), color)


def stars(c: Canvas, color, count, top, bottom, seed, opacity=0.8):
    rnd = random.Random(seed)
    with c.layer(opacity) as p:
        for _ in range(count):
            x, y = rnd.uniform(0, c.w), rnd.uniform(top, bottom)
            r = rnd.choice([0.8, 1.0, 1.3, 1.8, 2.4])
            p.circle(x, y, r, color)
            if r > 2:
                p.line([(x - r * 3, y), (x + r * 3, y)], color, 0.6)
                p.line([(x, y - r * 3), (x, y + r * 3)], color, 0.6)


def lantern(c: Canvas, x, top, length, size, frame, light):
    """Hanging oil lamp (kandil) with a warm halo."""
    y = top + length
    c.glow(x, y + size * 0.6, size * 4.5, light, 0.55)
    with c.layer() as p:
        p.line([(x, top), (x, y)], frame, max(1.2, size * 0.06))
        p.poly([(x - size * 0.35, y), (x + size * 0.35, y), (x + size * 0.15, y + size * 0.25),
                (x - size * 0.15, y + size * 0.25)], frame)
        body = bezier((x - size * 0.5, y + size * 0.3), (x - size * 0.75, y + size * 0.9),
                      (x - size * 0.35, y + size * 1.4), (x, y + size * 1.55))
        body += bezier((x, y + size * 1.55), (x + size * 0.35, y + size * 1.4),
                       (x + size * 0.75, y + size * 0.9), (x + size * 0.5, y + size * 0.3))
        p.poly(body, frame)
        inner = [(px + (x - px) * 0.25, py + (y + size * 0.9 - py) * 0.2) for px, py in body]
        p.poly(inner, light)
        p.poly([(x - size * 0.12, y + size * 1.55), (x + size * 0.12, y + size * 1.55), (x, y + size * 1.9)], frame)


# --- Architecture ------------------------------------------------------------------------

def arch(x0, x1, y_spring, y_tip, y_base):
    """Pointed (ogee-ish) arch outline from the base up; returns a closed polygon."""
    xc, h = (x0 + x1) / 2, y_spring - y_tip
    left = bezier((x0, y_spring), (x0, y_spring - h * 0.62), (xc - (xc - x0) * 0.3, y_tip + h * 0.18), (xc, y_tip))
    right = bezier((xc, y_tip), (xc + (x1 - xc) * 0.3, y_tip + h * 0.18), (x1, y_spring - h * 0.62), (x1, y_spring))
    return [(x0, y_base)] + left + right[1:] + [(x1, y_base)]


def dome(p: Pen, xc, y_base, w, h, color, finial=True):
    x0, x1 = xc - w / 2, xc + w / 2
    left = bezier((x0, y_base), (x0 - w * 0.04, y_base - h * 0.7), (xc - w * 0.18, y_base - h * 0.95), (xc, y_base - h))
    right = bezier((xc, y_base - h), (xc + w * 0.18, y_base - h * 0.95), (x1 + w * 0.04, y_base - h * 0.7), (x1, y_base))
    p.poly(left + right[1:], color)
    if finial:
        top = y_base - h
        p.line([(xc, top), (xc, top - h * 0.28)], color, max(1.2, w * 0.018))
        p.circle(xc, top - h * 0.1, w * 0.025, color)
        p.arc(xc, top - h * 0.32, w * 0.05, w * 0.05, 110, 430 - 120, color, max(1, w * 0.012))


def minaret(p: Pen, x, y_base, height, width, color):
    """Slender Ottoman 'pencil' minaret with two balconies."""
    p.rect(x - width / 2, y_base - height, x + width / 2, y_base, color)
    p.rect(x - width * 0.8, y_base - height * 0.12, x + width * 0.8, y_base, color)
    for t in (0.45, 0.72):
        y = y_base - height * t
        p.rect(x - width * 0.95, y - width * 0.35, x + width * 0.95, y, color)
        p.poly([(x - width * 0.95, y), (x + width * 0.95, y), (x + width * 0.5, y + width * 0.6),
                (x - width * 0.5, y + width * 0.6)], color)
    top = y_base - height
    p.poly([(x - width * 0.6, top), (x + width * 0.6, top), (x, top - height * 0.2)], color)
    p.line([(x, top - height * 0.2), (x, top - height * 0.26)], color, max(1, width * 0.15))


def mosque(p: Pen, cx, ground, scale, color, minarets=2, wide=1.0):
    """Ottoman mosque silhouette: main dome on a drum, half domes, minarets."""
    s = scale
    p.rect(cx - 210 * s * wide, ground - 70 * s, cx + 210 * s * wide, ground, color)
    for side in (-1, 1):
        dome(p, cx + side * 120 * s * wide, ground - 70 * s, 110 * s, 55 * s, color, finial=False)
        dome(p, cx + side * 185 * s * wide, ground - 70 * s, 55 * s, 30 * s, color, finial=False)
    p.rect(cx - 95 * s, ground - 120 * s, cx + 95 * s, ground - 60 * s, color)
    dome(p, cx, ground - 118 * s, 200 * s, 105 * s, color)
    positions = [-255, 255] if minarets == 2 else [-255, -235, 235, 255][:minarets]
    for dx in positions:
        minaret(p, cx + dx * s * wide, ground, 330 * s, 13 * s, color)


def hills(c: Canvas, base_y, amp, color, seed, opacity=1.0):
    rnd = random.Random(seed)
    pts = [(0, c.h)]
    phase = rnd.uniform(0, 6)
    for i in range(0, c.w + 21, 20):
        y = base_y - amp * (0.5 + 0.5 * math.sin(i / c.w * 4.2 + phase)) - amp * 0.25 * math.sin(i / c.w * 11 + phase * 2)
        pts.append((i, y))
    pts.append((c.w, c.h))
    with c.layer(opacity) as p:
        p.poly(pts, color)


# --- Objects -----------------------------------------------------------------------------

def rahle_with_mushaf(c: Canvas, cx, base, size, wood, page, cover, accent):
    """X-shaped folding Quran stand with an open Mushaf and a bookmark ribbon."""
    s = size
    c.glow(cx, base - s * 0.55, s * 1.1, accent, 0.35)
    with c.layer() as p:
        # legs of the stand
        p.poly([(cx - s * 0.55, base), (cx - s * 0.42, base), (cx + s * 0.12, base - s * 0.55),
                (cx - s * 0.02, base - s * 0.55)], mix(wood, "#000000", 0.25))
        p.poly([(cx + s * 0.55, base), (cx + s * 0.42, base), (cx - s * 0.12, base - s * 0.55),
                (cx + s * 0.02, base - s * 0.55)], wood)
        # carved knot in the middle
        p.circle(cx, base - s * 0.27, s * 0.045, accent)
        # book boards (cover), slightly wider than pages
        p.poly([(cx - s * 0.62, base - s * 0.68), (cx, base - s * 0.5), (cx + s * 0.62, base - s * 0.68),
                (cx + s * 0.58, base - s * 0.62), (cx, base - s * 0.44), (cx - s * 0.58, base - s * 0.62)], cover)
        for side in (-1, 1):
            outer = cx + side * s * 0.58
            pts = bezier((cx, base - s * 0.52), (cx + side * s * 0.18, base - s * 0.68),
                         (cx + side * s * 0.4, base - s * 0.74), (outer, base - s * 0.7))
            pts += [(outer, base - s * 1.18)]
            pts += bezier((outer, base - s * 1.18), (cx + side * s * 0.4, base - s * 1.22),
                          (cx + side * s * 0.18, base - s * 1.16), (cx, base - s * 1.0))[1:]
            p.poly(pts, page)
            # text lines
            for k in range(7):
                y0 = base - s * (1.08 - k * 0.055)
                x_in, x_out = cx + side * s * 0.08, cx + side * s * 0.5
                p.line([(x_in, y0 + abs(side) * s * 0.01), (x_out, y0 - s * 0.02)],
                       mix(cover, page, 0.55), max(1, s * 0.012))
            # illuminated header frame
            p.rect(min(cx + side * s * 0.1, cx + side * s * 0.48), base - s * 1.15,
                   max(cx + side * s * 0.1, cx + side * s * 0.48), base - s * 1.12, accent)
        p.line([(cx, base - s * 1.0), (cx, base - s * 0.5)], mix(page, "#000000", 0.18), max(1, s * 0.01))
        # ribbon
        p.poly([(cx - s * 0.01, base - s * 0.98), (cx + s * 0.02, base - s * 0.98),
                (cx + s * 0.04, base - s * 0.3), (cx + s * 0.01, base - s * 0.35), (cx - s * 0.01, base - s * 0.3)], accent)


def tesbih(c: Canvas, cx, cy, r, bead, tassel):
    with c.layer() as p:
        n = 33
        for i in range(n):
            a = math.pi * 0.15 + (math.pi * 1.7) * i / (n - 1)
            x, y = cx + r * math.cos(a), cy + r * 0.55 * math.sin(a)
            p.circle(x, y, r * 0.075, bead)
            p.circle(x - r * 0.02, y - r * 0.025, r * 0.025, mix(bead, "#ffffff", 0.45))
        # imame and tassel
        x0, y0 = cx + r * math.cos(math.pi * 0.15), cy + r * 0.55 * math.sin(math.pi * 0.15)
        p.rect(x0 - r * 0.05, y0, x0 + r * 0.05, y0 + r * 0.3, bead, radius=r * 0.04)
        for k in range(-3, 4):
            p.line([(x0, y0 + r * 0.3), (x0 + k * r * 0.04, y0 + r * 0.62)], tassel, max(1, r * 0.018))


def medallion(c: Canvas, cx, cy, r, line, fill, opacity=1.0):
    with c.layer(opacity) as p:
        p.circle(cx, cy, r, fill)
        for k, rr in enumerate((r * 0.94, r * 0.8)):
            pts = star8(cx, cy, rr, inner=0.8 if k == 0 else 0.7)
            p.line(pts + [pts[0]], line, max(1.2, r * 0.025))
        p.circle(cx, cy, r * 0.32, line)
        p.circle(cx, cy, r * 0.22, fill)
        for i in range(8):
            a = math.pi / 4 * i
            p.circle(cx + r * 0.55 * math.cos(a), cy + r * 0.55 * math.sin(a), r * 0.05, line)


def book(p: Pen, x, y, w, h, color, band):
    p.rect(x, y, x + w, y + h, color, radius=min(w, h) * 0.08)
    p.rect(x + w * 0.06, y + h * 0.15, x + w * 0.94, y + h * 0.22, band)
    p.rect(x + w * 0.06, y + h * 0.78, x + w * 0.94, y + h * 0.85, band)


def ram(p: Pen, cx, ground, s, body, horn):
    """Kurbanlık koç silüeti (side view, facing left)."""
    p.ellipse(cx, ground - s * 0.62, s * 0.62, s * 0.34, body)
    for dx in (-0.4, -0.2, 0.25, 0.42):
        p.rect(cx + dx * s - s * 0.045, ground - s * 0.4, cx + dx * s + s * 0.045, ground, body, radius=s * 0.02)
    # neck and head
    p.poly([(cx - s * 0.45, ground - s * 0.8), (cx - s * 0.62, ground - s * 1.05), (cx - s * 0.82, ground - s * 0.98),
            (cx - s * 0.68, ground - s * 0.6)], body)
    p.ellipse(cx - s * 0.78, ground - s * 0.95, s * 0.17, s * 0.13, body)
    p.poly([(cx - s * 0.9, ground - s * 1.0), (cx - s * 1.06, ground - s * 0.86), (cx - s * 0.92, ground - s * 0.82)], body)
    # curled horn
    p.arc(cx - s * 0.68, ground - s * 0.98, s * 0.14, s * 0.14, 180, 520, horn, s * 0.07)
    # wool texture
    for i in range(14):
        a = i / 14 * math.pi * 2
        p.circle(cx + s * 0.42 * math.cos(a) * 1.1, ground - s * 0.62 + s * 0.22 * math.sin(a), s * 0.12, body)
    p.poly([(cx + s * 0.6, ground - s * 0.72), (cx + s * 0.74, ground - s * 0.6), (cx + s * 0.6, ground - s * 0.55)], body)


def well(c: Canvas, cx, ground, s, stone, wood, rope, water):
    with c.layer() as p:
        # posts and roof
        for side in (-1, 1):
            p.rect(cx + side * s * 0.55 - s * 0.04, ground - s * 1.25, cx + side * s * 0.55 + s * 0.04, ground - s * 0.4, wood)
        p.poly([(cx - s * 0.78, ground - s * 1.22), (cx, ground - s * 1.6), (cx + s * 0.78, ground - s * 1.22),
                (cx + s * 0.7, ground - s * 1.15), (cx, ground - s * 1.48), (cx - s * 0.7, ground - s * 1.15)],
               mix(wood, "#000000", 0.2))
        p.rect(cx - s * 0.6, ground - s * 1.12, cx + s * 0.6, ground - s * 1.06, wood)
        # rope and bucket
        p.line([(cx + s * 0.1, ground - s * 1.06), (cx + s * 0.1, ground - s * 0.68)], rope, s * 0.02)
        p.poly([(cx - s * 0.02, ground - s * 0.68), (cx + s * 0.22, ground - s * 0.68), (cx + s * 0.19, ground - s * 0.5),
                (cx + s * 0.01, ground - s * 0.5)], wood)
        p.arc(cx + s * 0.1, ground - s * 0.68, s * 0.12, s * 0.1, 180, 360, rope, s * 0.015)
        # stone ring
        p.rect(cx - s * 0.62, ground - s * 0.45, cx + s * 0.62, ground, stone, radius=s * 0.04)
        p.ellipse(cx, ground - s * 0.45, s * 0.62, s * 0.1, mix(stone, "#ffffff", 0.2))
        p.ellipse(cx, ground - s * 0.45, s * 0.52, s * 0.07, mix(water, "#000000", 0.35))
        dark = mix(stone, "#000000", 0.25)
        for row in range(3):
            y = ground - s * (0.32 - row * 0.13)
            p.line([(cx - s * 0.62, y), (cx + s * 0.62, y)], dark, s * 0.012)
            offset = 0.1 if row % 2 else 0
            for k in range(-3, 4):
                x = cx + (k * 0.2 + offset) * s
                if abs(x - cx) < s * 0.6:
                    p.line([(x, y), (x, y + s * 0.13)], dark, s * 0.012)
        # spilled water and drops
        p.ellipse(cx + s * 0.85, ground + s * 0.03, s * 0.35, s * 0.05, water)
        for k, (dx, dy) in enumerate(((0.12, -0.42), (0.16, -0.32), (0.08, -0.25))):
            x, y = cx + dx * s, ground + dy * s
            p.poly([(x, y - s * 0.04), (x + s * 0.025, y + s * 0.01), (x, y + s * 0.03), (x - s * 0.025, y + s * 0.01)], water)


def acacia(p: Pen, x, ground, s, color):
    p.poly([(x - s * 0.04, ground), (x + s * 0.04, ground), (x + s * 0.02, ground - s * 0.7), (x - s * 0.02, ground - s * 0.7)], color)
    p.line([(x, ground - s * 0.55), (x - s * 0.35, ground - s * 0.85)], color, s * 0.03)
    p.line([(x, ground - s * 0.6), (x + s * 0.3, ground - s * 0.9)], color, s * 0.03)
    p.ellipse(x - s * 0.2, ground - s * 0.92, s * 0.45, s * 0.1, color)
    p.ellipse(x + s * 0.25, ground - s * 0.95, s * 0.4, s * 0.09, color)


def aid_box(p: Pen, cx, ground, s, box, tape, label, accent, goods=True):
    if goods:
        # bottle, flour sack, dates peeking from the box
        p.rect(cx - s * 0.32, ground - s * 1.05, cx - s * 0.18, ground - s * 0.6, "#e9d27a", radius=s * 0.03)
        p.rect(cx - s * 0.29, ground - s * 1.12, cx - s * 0.21, ground - s * 1.04, accent)
        p.ellipse(cx + s * 0.05, ground - s * 0.8, s * 0.2, s * 0.24, "#efe6d2")
        p.line([(cx - s * 0.08, ground - s * 0.98), (cx + s * 0.18, ground - s * 0.98)], "#bca983", s * 0.025)
        for k in range(5):
            p.ellipse(cx + s * (0.26 + 0.05 * (k % 3)), ground - s * (0.72 + 0.05 * (k // 3)), s * 0.04, s * 0.025, "#6b3a1c")
    p.poly([(cx - s * 0.5, ground - s * 0.72), (cx + s * 0.5, ground - s * 0.72), (cx + s * 0.5, ground), (cx - s * 0.5, ground)], box)
    p.poly([(cx - s * 0.5, ground - s * 0.72), (cx - s * 0.68, ground - s * 0.9), (cx - s * 0.2, ground - s * 0.86),
            (cx - s * 0.02, ground - s * 0.72)], mix(box, "#ffffff", 0.15))
    p.poly([(cx + s * 0.5, ground - s * 0.72), (cx + s * 0.68, ground - s * 0.9), (cx + s * 0.2, ground - s * 0.86),
            (cx + s * 0.02, ground - s * 0.72)], mix(box, "#000000", 0.1))
    p.rect(cx - s * 0.05, ground - s * 0.72, cx + s * 0.05, ground, tape)
    p.rect(cx - s * 0.32, ground - s * 0.45, cx + s * 0.32, ground - s * 0.15, label, radius=s * 0.04)
    p.poly(star8(cx, ground - s * 0.3, s * 0.1), accent)


# --- Backdrops ---------------------------------------------------------------------------

def backdrop(c: Canvas, pal, warm=0.35, pattern=True):
    c.gradient([(0, pal["night"]), (0.55, pal["dark"]), (1, mix(pal["mid"], pal["accent"], warm))])
    if pattern:
        girih(c, pal["cream"], opacity=0.06, cell=max(90, c.w // 9))


# --- Scenes ------------------------------------------------------------------------------

def scene_hero(pal, seed, variant):
    c = Canvas(1600, 900)
    c.gradient([(0, pal["night"]), (0.45, pal["dark"]), (0.78, pal["mid"]), (1, mix(pal["mid"], pal["accent"], 0.55))])
    girih(c, pal["cream"], opacity=0.05, cell=150)
    stars(c, pal["cream"], 90, 0, 420, seed, 0.7)
    if variant == "medrese":
        crescent(c, 1330, 300, 52, pal["cream"], 0.92)
    else:
        crescent(c, 1290, 170, 85, pal["cream"], 0.92)
    c.glow(1100, 640, 520, pal["accent"], 0.35)
    if variant == "medrese":
        hills(c, 760, 25, mix(pal["mid"], pal["night"], 0.6), seed, 0.9)
        with c.layer(0.9) as p:
            mosque(p, 1130, 790, 0.95, pal["night"])
            p.rect(0, 785, 1600, 900, pal["night"])
    else:
        with c.layer(0.35) as p:
            mosque(p, 1080, 690, 1.05, pal["night"], wide=1.1)
        with c.layer(0.85) as p:
            mosque(p, 980, 720, 1.3, pal["night"])
    if variant == "medrese":
        # looking out through a large medrese gate: tiled wall, one great pointed arch on the right
        gate = arch(760, 1500, 470, 110, 900)
        with c.layer() as p:
            wall = mix(pal["night"], "#000000", 0.35)
            p.rect(0, 0, 1600, 900, wall)
            p.erase_poly(gate)
        with c.layer(0.9) as p:
            p.line(gate[1:-1], mix(pal["accent"], "#000000", 0.25), 14)
        with c.layer(0.55) as p:
            p.line(arch(735, 1525, 470, 80, 900)[1:-1], mix(pal["accent"], "#000000", 0.45), 5)
        with c.layer(0.07) as p:
            for row in range(9):
                for col in range(7):
                    pts = star8(60 + col * 110 + (55 if row % 2 else 0), 50 + row * 100, 40, inner=0.75)
                    p.line(pts + [pts[0]], pal["accent"], 2)
        # columns flanking the gate and a stone threshold
        with c.layer() as p:
            for x in (745, 1515):
                p.rect(x - 26, 470, x + 26, 860, mix(pal["night"], pal["stone"], 0.22))
                p.rect(x - 34, 452, x + 34, 474, mix(pal["night"], pal["accent"], 0.35))
                p.rect(x - 34, 850, x + 34, 870, mix(pal["night"], pal["accent"], 0.25))
            p.rect(700, 860, 1560, 900, mix(pal["night"], pal["stone"], 0.3))
        lantern(c, 1130, 110, 90, 30, mix(pal["accent"], "#000000", 0.35), pal["accent"])
        for x, length in ((120, 60), (300, 120), (480, 80)):
            lantern(c, x, 0, length, 18, mix(pal["accent"], "#000000", 0.35), pal["accent"])
    else:
        # festive lamps strung across the sky over a city skyline
        hills(c, 760, 30, pal["night"], seed, 1.0)
        with c.layer() as p:
            for x, sc in ((180, 0.45), (420, 0.35), (1420, 0.42)):
                mosque(p, x, 790, sc, pal["night"], minarets=2)
            p.rect(0, 780, 1600, 900, pal["night"])
        with c.layer(0.7) as p:
            pts = [(x, 60 + 70 * math.sin(x / 1600 * math.pi)) for x in range(0, 1601, 20)]
            p.line(pts, mix(pal["accent"], "#000000", 0.4), 2)
        for k, x in enumerate(range(90, 1600, 150)):
            y = 60 + 70 * math.sin(x / 1600 * math.pi)
            lantern(c, x, y, 30 + (k % 3) * 22, 15, mix(pal["accent"], "#000000", 0.35), pal["accent"])
    # leave the left side calmer for the headline text
    shade = Image.linear_gradient("L").rotate(-90).resize(c.img.size).point(lambda v: int(v * 0.4))
    dark = Image.new("RGBA", c.img.size, rgb(pal["night"]))
    dark.putalpha(shade)
    c.img.alpha_composite(dark)
    return c


def card(pal, seed, draw, warm=0.35, pattern=True):
    c = Canvas(800, 500)
    backdrop(c, pal, warm, pattern)
    draw(c, pal, random.Random(seed))
    return c


def draw_hafizlik(c, pal, rnd):
    medallion(c, 400, 200, 210, pal["accent"], pal["dark"], 0.18)
    with c.layer() as p:
        p.rect(0, 430, 800, 500, mix(pal["night"], pal["wood"], 0.35))
        p.rect(0, 425, 800, 432, mix(pal["accent"], "#000000", 0.3))
    rahle_with_mushaf(c, 400, 440, 290, pal["wood"], pal["cream"], pal["mid"], pal["accent"])
    tesbih(c, 640, 445, 70, mix(pal["accent"], "#3a2410", 0.55), pal["accent"])


def draw_arapca(c, pal, rnd):
    with c.layer() as p:
        p.rect(0, 420, 800, 500, mix(pal["night"], pal["wood"], 0.35))
        # framed levha with ornament (no lettering)
        p.rect(215, 55, 585, 345, mix(pal["accent"], "#000000", 0.35), radius=8)
        p.rect(228, 68, 572, 332, pal["cream"], radius=4)
        p.rect(240, 80, 560, 320, mix(pal["cream"], pal["accent"], 0.15))
    medallion(c, 400, 200, 95, pal["mid"], mix(pal["cream"], pal["accent"], 0.15))
    with c.layer() as p:
        for side in (-1, 1):
            for k in range(3):
                p.line([(400 + side * 125, 120 + k * 80), (400 + side * 150, 120 + k * 80)], pal["mid"], 3)
        # inkwell (hokka) and reed pens (kalem)
        p.ellipse(560, 430, 55, 14, mix(pal["night"], "#000000", 0.2))
        dome(p, 560, 430, 90, 70, pal["mid"], finial=False)
        p.rect(540, 352, 580, 365, pal["accent"], radius=3)
        p.line([(555, 360), (500, 230)], pal["stone"], 7)
        p.line([(570, 360), (610, 235)], mix(pal["stone"], "#000000", 0.2), 7)
        for i, (x, color) in enumerate(((150, pal["mid"]), (210, pal["accent"]), (260, pal["light"]))):
            book(p, x - 40 + i * 5, 380 - i * 22, 170 - i * 20, 24, color, pal["cream"])


def draw_classroom(c, pal, rnd, rows=3):
    """Rows of small rahles with open books — sıbyan / ibtida classroom, no people."""
    with c.layer() as p:
        p.rect(0, 300, 800, 500, mix(pal["dark"], pal["wood"], 0.25))
        # back wall with three arched windows
        p.rect(0, 0, 800, 300, mix(pal["dark"], pal["night"], 0.4))
        for x in (170, 400, 630):
            p.poly(arch(x - 55, x + 55, 170, 60, 270), mix(pal["mid"], pal["accent"], 0.25))
            p.line([(x, 70), (x, 270)], mix(pal["dark"], pal["night"], 0.4), 4)
            p.line([(x - 55, 190), (x + 55, 190)], mix(pal["dark"], pal["night"], 0.4), 4)
        # carpet pattern stripes
        for k in range(6):
            p.rect(0, 320 + k * 32, 800, 324 + k * 32, mix(pal["mid"], pal["dark"], 0.4))
    for x in (170, 400, 630):
        c.glow(x, 170, 160, pal["accent"], 0.25)
    for row in range(rows):
        size = 70 + row * 32
        base = 345 + row * 55
        for k in range(3 + (1 if row == 0 else 0)):
            count = 3 + (1 if row == 0 else 0)
            x = 400 + (k - (count - 1) / 2) * (190 + row * 60)
            rahle_with_mushaf(c, x, base, size, pal["wood"], pal["cream"], pal["mid"], pal["accent"])


def draw_kurban(c, pal, rnd):
    c.img = Image.new("RGBA", c.img.size)
    c.gradient([(0, pal["dark"]), (0.6, mix(pal["mid"], pal["accent"], 0.5)), (1, pal["accent"])])
    c.glow(560, 300, 230, pal["cream"], 0.6)
    with c.layer() as p:
        p.circle(560, 300, 70, mix(pal["cream"], pal["accent"], 0.35))
    hills(c, 360, 40, mix(pal["mid"], pal["night"], 0.5), 3, 0.8)
    hills(c, 478, 14, pal["night"], 5, 1.0)
    with c.layer(0.85) as p:
        mosque(p, 150, 380, 0.28, mix(pal["mid"], pal["night"], 0.5))
    with c.layer() as p:
        ram(p, 430, 470, 165, pal["night"], mix(pal["night"], pal["accent"], 0.25))
        for x, h in ((660, 60), (690, 40), (715, 70)):
            p.line([(x, 472), (x + 8, 472 - h)], pal["night"], 4)


def draw_su(c, pal, rnd):
    c.img = Image.new("RGBA", c.img.size)
    c.gradient([(0, "#2b5b86"), (0.55, mix("#8fc3e6", pal["accent"], 0.25)), (1, "#f2d7a0")])
    c.glow(640, 120, 160, "#fff6d8", 0.7)
    with c.layer() as p:
        p.circle(640, 120, 46, "#fff3cf")
        p.rect(0, 400, 800, 500, "#c99a5b")
        for k in range(12):
            x = rnd.uniform(0, 800)
            p.line([(x, 440 + rnd.uniform(0, 50)), (x + 30, 445 + rnd.uniform(0, 50))], "#a57a43", 2)
        acacia(p, 150, 405, 190, "#3d2a18")
        acacia(p, 700, 405, 120, "#3d2a18")
    hills(c, 400, 25, "#b8864b", 8, 1.0)
    well(c, 420, 440, 210, pal["stone"], pal["wood"], "#5a3d1e", "#4fa3d9")


def draw_yetim(c, pal, rnd):
    with c.layer() as p:
        p.rect(0, 0, 800, 500, mix(pal["dark"], pal["stone"], 0.18))
        for row in range(10):
            for col in range(12):
                x = col * 70 + (35 if row % 2 else 0)
                p.rect(x, row * 45, x + 66, row * 45 + 41, mix(pal["dark"], pal["stone"], 0.22 + 0.04 * ((row + col) % 3)))
        door = arch(300, 500, 150, 40, 440)
        p.poly(arch(285, 515, 150, 25, 440), mix(pal["accent"], "#000000", 0.35))
        p.poly(door, pal["mid"])
        p.line([(400, 60), (400, 440)], mix(pal["mid"], "#000000", 0.3), 4)
        for side in (-1, 1):
            for k in range(3):
                p.rect(400 + side * 20 if side > 0 else 330, 190 + k * 80, 470 if side > 0 else 380, 250 + k * 80,
                       mix(pal["mid"], "#000000", 0.18), radius=4)
        p.circle(380, 300, 7, pal["accent"])
        p.circle(420, 300, 7, pal["accent"])
        p.rect(0, 440, 800, 500, mix(pal["night"], pal["stone"], 0.25))
        p.rect(260, 440, 540, 452, mix(pal["stone"], "#000000", 0.2))
    lantern(c, 580, 0, 120, 26, mix(pal["accent"], "#000000", 0.4), pal["accent"])
    c.glow(400, 470, 260, pal["accent"], 0.25)
    with c.layer() as p:
        aid_box(p, 230, 470, 120, "#c79a5c", pal["mid"], pal["cream"], pal["accent"], goods=False)
        # gift box with bow
        p.rect(560, 395, 650, 470, pal["mid"], radius=4)
        p.rect(553, 383, 657, 400, mix(pal["mid"], "#ffffff", 0.15), radius=3)
        p.rect(598, 383, 612, 470, pal["accent"])
        p.ellipse(588, 375, 16, 9, pal["accent"])
        p.ellipse(622, 375, 16, 9, pal["accent"])


def draw_courtyard(c, pal, rnd):
    """Mosque courtyard with an octagonal şadırvan under a small dome."""
    c.img = Image.new("RGBA", c.img.size)
    c.gradient([(0, pal["mid"]), (0.6, mix(pal["light"], pal["accent"], 0.35)), (1, pal["cream"])])
    with c.layer(0.9) as p:
        mosque(p, 400, 300, 0.75, mix(pal["night"], pal["mid"], 0.25))
    with c.layer() as p:
        p.rect(0, 300, 800, 500, mix(pal["stone"], "#ffffff", 0.25))
        for k in range(9):
            p.line([(400, 300), (-400 + k * 200, 500)], mix(pal["stone"], "#000000", 0.12), 2)
        for k in range(5):
            y = 320 + k * k * 9
            p.line([(0, y), (800, y)], mix(pal["stone"], "#000000", 0.1), 2)
        # şadırvan
        p.rect(300, 395, 500, 450, mix(pal["stone"], "#000000", 0.1))
        p.rect(290, 385, 510, 400, mix(pal["stone"], "#000000", 0.25))
        for x in (310, 365, 435, 490):
            p.rect(x - 5, 300, x + 5, 390, mix(pal["night"], pal["mid"], 0.4))
        p.poly([(285, 305), (515, 305), (500, 290), (300, 290)], mix(pal["night"], pal["mid"], 0.3))
        dome(p, 400, 292, 230, 70, mix(pal["night"], pal["mid"], 0.3))
        for x in (335, 400, 465):
            p.rect(x - 3, 420, x + 3, 440, pal["accent"])
            p.ellipse(x, 448, 10, 3, "#7cc4ea")
    with c.layer(0.6) as p:
        for x in (90, 710):
            p.ellipse(x, 270, 60, 90, mix(pal["mid"], pal["night"], 0.3))
            p.rect(x - 6, 280, x + 6, 340, mix(pal["wood"], "#000000", 0.3))


def draw_library(c, pal, rnd):
    with c.layer() as p:
        p.rect(0, 0, 800, 500, mix(pal["night"], pal["wood"], 0.35))
        colors = [pal["mid"], pal["accent"], pal["dark"], pal["light"], mix(pal["wood"], "#000000", 0.2), pal["cream"]]
        for shelf in range(4):
            y = 40 + shelf * 105
            p.rect(30, y + 92, 770, y + 104, mix(pal["wood"], "#000000", 0.35))
            x = 40
            while x < 750:
                w = rnd.randint(16, 32)
                h = rnd.randint(62, 90)
                color = rnd.choice(colors)
                if rnd.random() < 0.08:
                    x += 20
                    continue
                p.rect(x, y + 92 - h, x + w, y + 92, color, radius=2)
                p.rect(x + 3, y + 92 - h + 8, x + w - 3, y + 92 - h + 11, pal["accent"] if color != pal["accent"] else pal["cream"])
                p.rect(x + 3, y + 80, x + w - 3, y + 83, pal["accent"] if color != pal["accent"] else pal["cream"])
                x += w + 2
    c.glow(400, 250, 330, pal["accent"], 0.25)
    with c.layer(0.92) as p:
        p.rect(270, 300, 530, 500, mix(pal["wood"], "#000000", 0.15))
    rahle_with_mushaf(c, 400, 470, 170, pal["wood"], pal["cream"], pal["mid"], pal["accent"])


def draw_night(c, pal, rnd):
    c.img = Image.new("RGBA", c.img.size)
    c.gradient([(0, pal["night"]), (0.7, pal["dark"]), (1, pal["mid"])])
    stars(c, pal["cream"], 70, 0, 300, 11, 0.8)
    crescent(c, 600, 110, 55, pal["cream"])
    c.glow(400, 470, 330, pal["accent"], 0.3)
    with c.layer() as p:
        mosque(p, 400, 470, 0.9, mix(pal["night"], "#000000", 0.4))
        p.rect(0, 465, 800, 500, mix(pal["night"], "#000000", 0.4))
        for x in (330, 370, 430, 470):
            p.rect(x - 7, 425, x + 7, 450, mix(pal["accent"], "#000000", 0.1), radius=3)


def draw_egitim(c, pal, rnd):
    medallion(c, 400, 230, 200, pal["cream"], pal["dark"], 0.12)
    with c.layer() as p:
        p.rect(0, 420, 800, 500, mix(pal["night"], pal["wood"], 0.3))
        colors = [pal["mid"], pal["accent"], pal["cream"], pal["light"], mix(pal["mid"], "#000000", 0.3)]
        for i in range(5):
            w = 300 - i * 18
            book(p, 400 - w / 2 + (i % 2) * 12, 395 - i * 34, w, 32, colors[i], mix(colors[i], "#000000", 0.25))
        # pencil leaning on the stack
        p.poly([(560, 420), (575, 415), (690, 205), (675, 200)], pal["accent"])
        p.poly([(675, 200), (690, 205), (694, 180)], pal["cream"])
        p.poly([(560, 420), (575, 415), (566, 432)], mix(pal["wood"], "#000000", 0.2))
        # graduation cap on top of the stack
        p.poly([(300, 220), (400, 175), (500, 220), (400, 262)], pal["night"])
        p.rect(345, 225, 455, 255, pal["night"], radius=10)
        p.line([(500, 220), (505, 280)], pal["accent"], 4)
        p.circle(505, 285, 9, pal["accent"])


def draw_fatura(c, pal, rnd):
    with c.layer() as p:
        p.rect(240, 60, 560, 450, pal["cream"], radius=12)
        p.rect(240, 60, 560, 120, pal["mid"], radius=12)
        p.rect(240, 100, 560, 120, pal["mid"])
        for k in range(6):
            p.rect(275, 160 + k * 32, 275 + (230 if k % 2 == 0 else 160), 170 + k * 32, mix(pal["cream"], "#000000", 0.18), radius=4)
        p.rect(275, 380, 525, 420, mix(pal["accent"], "#ffffff", 0.3), radius=8)
        # zigzag bottom edge
        pts = [(240 + k * 20, 450 + (8 if k % 2 else 0)) for k in range(17)]
        p.poly([(240, 430)] + pts + [(560, 430)], pal["cream"])
    icons = ((140, 160, "bulb"), (660, 160, "drop"), (140, 360, "flame"), (660, 360, "drop2"))
    for x, y, kind in icons:
        c.glow(x, y, 90, pal["accent"], 0.3)
        with c.layer() as p:
            p.circle(x, y, 58, mix(pal["mid"], pal["accent"], 0.15))
            if kind == "bulb":
                p.circle(x, y - 8, 26, "#fff2b8")
                p.rect(x - 12, y + 16, x + 12, y + 32, pal["cream"], radius=3)
            elif kind == "flame":
                p.poly(bezier((x, y - 35), (x + 40, y), (x + 25, y + 30), (x, y + 32))
                       + bezier((x, y + 32), (x - 25, y + 30), (x - 40, y), (x, y - 35))[1:], "#ffd27a")
                p.poly(bezier((x, y - 5), (x + 18, y + 12), (x + 10, y + 28), (x, y + 28))
                       + bezier((x, y + 28), (x - 10, y + 28), (x - 18, y + 12), (x, y - 5))[1:], "#ff9b4a")
            else:
                color = "#9ed7f5" if kind == "drop" else "#cdeefe"
                p.poly(bezier((x, y - 38), (x + 10, y - 20), (x + 30, y), (x + 26, y + 15))
                       + bezier((x + 26, y + 15), (x + 20, y + 38), (x - 20, y + 38), (x - 26, y + 15))[1:]
                       + bezier((x - 26, y + 15), (x - 30, y), (x - 10, y - 20), (x, y - 38))[1:], color)


def draw_gida(c, pal, rnd):
    c.glow(400, 330, 280, pal["accent"], 0.35)
    with c.layer() as p:
        p.rect(0, 440, 800, 500, mix(pal["night"], pal["wood"], 0.3))
        aid_box(p, 400, 450, 330, "#c79a5c", pal["mid"], pal["cream"], pal["mid"])
        # bread and wheat at the sides
        p.ellipse(150, 425, 70, 28, "#d8a35a")
        for k in range(4):
            p.arc(115 + k * 22, 418, 10, 12, 200, 340, "#9e6a2c", 3)
        for side, x in ((-1, 640), (1, 680)):
            p.line([(x, 450), (x + side * 20, 300)], "#e0b866", 4)
            for k in range(6):
                y = 320 + k * 18
                p.ellipse(x + side * (20 - k * 3) - 7, y, 6, 11, "#e0b866")
                p.ellipse(x + side * (20 - k * 3) + 7, y, 6, 11, "#e0b866")


def draw_asevi(c, pal, rnd):
    """Big cooking cauldron (kazan) with steam — aşevi / iftar."""
    c.glow(400, 300, 260, pal["accent"], 0.35)
    with c.layer() as p:
        p.rect(0, 430, 800, 500, mix(pal["night"], pal["wood"], 0.3))
        # fire
        for k, x in enumerate(range(300, 520, 40)):
            h = 60 + (k % 2) * 25
            p.poly(bezier((x, 430), (x - 25, 400), (x + 5, 430 - h * 0.7), (x + 10, 430 - h))
                   + bezier((x + 10, 430 - h), (x + 25, 430 - h * 0.6), (x + 40, 400), (x + 20, 430))[1:], "#ffb347")
        # cauldron
        p.ellipse(400, 330, 170, 95, mix(pal["night"], "#000000", 0.3))
        p.rect(225, 245, 575, 268, mix(pal["night"], pal["stone"], 0.3), radius=10)
        p.ellipse(400, 252, 160, 18, "#e7c27a")
        for side in (-1, 1):
            p.arc(400 + side * 185, 290, 22, 22, 0, 360, mix(pal["night"], pal["stone"], 0.3), 6)
        # ladle
        p.line([(470, 255), (560, 150)], mix(pal["wood"], "#000000", 0.2), 9)
    with c.layer(0.55, blur=6) as p:
        for k, x in enumerate((340, 400, 460)):
            pts = [(x + 18 * math.sin(t / 10 + k), 235 - t * 3.5) for t in range(0, 40)]
            p.line(pts, pal["cream"], 14)


def draw_aid_stack(c, pal, rnd):
    with c.layer() as p:
        p.rect(0, 430, 800, 500, mix(pal["night"], pal["wood"], 0.3))
    c.glow(400, 330, 300, pal["accent"], 0.3)
    with c.layer() as p:
        boxes = [(250, 450, 170), (430, 450, 170), (610, 450, 170), (340, 330, 150), (520, 330, 150), (430, 225, 130)]
        for x, ground, s in boxes:
            aid_box(p, x, ground, s, "#c79a5c", pal["mid"], pal["cream"], pal["mid"], goods=False)
        crescent_x = 130
        p.circle(crescent_x, 120, 50, pal["cream"])
        p.erase_circle(crescent_x + 20, 110, 42)


def icon(pal, glyph):
    c = Canvas(200, 200)
    c.img = Image.new("RGBA", c.img.size, (0, 0, 0, 0))
    with c.layer() as p:
        p.circle(100, 100, 100, pal["mid"])
    c.glow(70, 60, 110, mix(pal["mid"], "#ffffff", 0.4), 0.45)
    with c.layer(0.12) as p:
        pts = star8(100, 100, 88, inner=0.8)
        p.line(pts + [pts[0]], "#ffffff", 3)
    white = "#ffffff"
    with c.layer() as p:
        if glyph == "asevi":
            p.ellipse(100, 115, 50, 28, white)
            p.rect(45, 103, 155, 112, white, radius=4)
            for x in (80, 100, 120):
                p.arc(x, 72, 6, 14, 90, 270, white, 4)
        elif glyph == "barinma":
            p.poly([(45, 100), (100, 52), (155, 100)], white)
            p.rect(60, 98, 140, 150, white)
            p.poly(arch(88, 112, 128, 112, 151), pal["mid"])
        elif glyph == "egitim":
            for side in (-1, 1):
                p.poly([(100, 140), (100 + side * 55, 130), (100 + side * 55, 70), (100, 80)], white)
            p.line([(100, 80), (100, 140)], pal["mid"], 4)
        elif glyph == "fatura":
            p.rect(62, 50, 138, 150, white, radius=8)
            for k in range(4):
                p.rect(75, 70 + k * 16, 125 - (k % 2) * 18, 77 + k * 16, pal["mid"], radius=2)
            p.poly([(108, 118), (92, 140), (104, 140), (96, 160), (118, 132), (106, 132), (114, 118)], pal["accent"])
        elif glyph == "genel":
            p.poly(bezier((100, 150), (40, 110), (55, 50), (100, 80))
                   + bezier((100, 80), (145, 50), (160, 110), (100, 150))[1:], white)
        elif glyph == "gida":
            p.line([(100, 155), (100, 60)], white, 6)
            for k in range(5):
                y = 70 + k * 16
                p.ellipse(88, y, 9, 13, white)
                p.ellipse(112, y, 9, 13, white)
        elif glyph == "saglik":
            p.rect(85, 50, 115, 150, white, radius=6)
            p.rect(50, 85, 150, 115, white, radius=6)
        elif glyph == "zekat":
            for k in range(4):
                p.ellipse(100, 140 - k * 18, 42, 13, white)
                p.ellipse(100, 140 - k * 18 - 3, 42, 13, mix(pal["accent"], "#ffffff", 0.3))
            p.poly(star8(100, 62, 16), white)
    return c


# --- Output -------------------------------------------------------------------------------

def build(out: Path):
    h, k = PALETTES["hicret"], PALETTES["kardeslik"]
    jobs = {
        "hicret/hicret-hero.png": lambda: scene_hero(h, 1, "medrese"),
        "hicret/h-hafizlik.png": lambda: card(h, 2, draw_hafizlik),
        "hicret/h-arapca.png": lambda: card(h, 3, draw_arapca),
        "hicret/h-ibtida.png": lambda: card(h, 4, lambda c, p, r: draw_classroom(c, p, r, rows=3)),
        "hicret/h-sibyan.png": lambda: card(h, 5, lambda c, p, r: draw_classroom(c, p, r, rows=2)),
        "hicret/h-kurban.png": lambda: card(h, 6, draw_kurban),
        "hicret/h-su.png": lambda: card(h, 7, draw_su),
        "hicret/h-yetim.png": lambda: card(h, 8, draw_yetim),
        "hicret/h-news1.png": lambda: card(h, 9, draw_courtyard),
        "hicret/h-news2.png": lambda: card(h, 10, draw_library),
        "hicret/h-news3.png": lambda: card(h, 11, draw_night),
        "kardeslik/kp-hero.png": lambda: scene_hero(k, 21, "sehir"),
        "kardeslik/kp-egitim.png": lambda: card(k, 22, draw_egitim),
        "kardeslik/kp-fatura.png": lambda: card(k, 23, draw_fatura),
        "kardeslik/kp-gida.png": lambda: card(k, 24, draw_gida),
        "kardeslik/kp-news1.png": lambda: card(k, 25, draw_asevi),
        "kardeslik/kp-news2.png": lambda: card(k, 26, draw_aid_stack),
        "kardeslik/kp-news3.png": lambda: card(k, 27, draw_night),
    }
    for glyph in ("asevi", "barinma", "egitim", "fatura", "genel", "gida", "saglik", "zekat"):
        jobs[f"kardeslik/kp-ic-{glyph}.png"] = (lambda g: lambda: icon(k, g))(glyph)
    for name, make in jobs.items():
        make().save(out / name)
        print("yazıldı:", name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "apps" / "web" / "public" / "images"))
    build(Path(parser.parse_args().out))
