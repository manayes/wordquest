# -*- coding: utf-8 -*-
"""WordQuest 앱 아이콘 생성 -> icons/
실행: python build_icons.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "icons")
os.makedirs(OUT, exist_ok=True)

SIZE = 512
TOP = (0x5B, 0x7C, 0xF7)      # 밝은 인디고
BOTTOM = (0x35, 0x49, 0xC9)   # 진한 인디고
GOLD = (0xFB, 0xBF, 0x24)

def gradient(size):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        c = tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        d.line([(0, y), (size, y)], fill=c)
    return img

def star(draw, cx, cy, r, fill):
    # 4꼭지 반짝이 별
    pts = []
    for i in range(8):
        rad = r if i % 2 == 0 else r * 0.35
        ang = i * 45
        from math import sin, cos, radians
        pts.append((cx + rad * sin(radians(ang)), cy - rad * cos(radians(ang))))
    draw.polygon(pts, fill=fill)

def draw_content(img, scale=1.0):
    """W 모노그램 + 금색 별. scale<1이면 중앙으로 축소 (maskable 안전 영역용)"""
    d = ImageDraw.Draw(img)
    s = img.width
    font_size = int(300 * scale)
    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", font_size)
    text = "W"
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (s - tw) / 2 - bbox[0]
    y = (s - th) / 2 - bbox[1] + int(10 * scale)
    # 그림자
    d.text((x + int(8 * scale), y + int(10 * scale)), text, font=font, fill=(30, 40, 100))
    d.text((x, y), text, font=font, fill=(255, 255, 255))
    # 반짝이 별 (오른쪽 위)
    star(d, s * (0.5 + 0.27 * scale), s * (0.5 - 0.30 * scale), 52 * scale, GOLD)
    star(d, s * (0.5 + 0.35 * scale), s * (0.5 - 0.18 * scale), 24 * scale, GOLD)
    return img

def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=radius, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

# 일반 아이콘 (둥근 모서리)
base = draw_content(gradient(SIZE), scale=1.0)
icon = rounded(base, 115)
icon.save(os.path.join(OUT, "icon-512.png"))
icon.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, "icon-192.png"))

# maskable 아이콘 (풀블리드, 콘텐츠는 중앙 80% 안)
maskable = draw_content(gradient(SIZE), scale=0.72)
maskable.save(os.path.join(OUT, "icon-maskable-512.png"))

print("아이콘 3종 생성 완료 ->", OUT)
