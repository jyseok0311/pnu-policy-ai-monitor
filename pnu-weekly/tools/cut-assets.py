# -*- coding: utf-8 -*-
"""산지니 자산 정리 — 표정 시트를 6칸으로 자르고 전신 3종을 정사각 캔버스로 맞춘다."""
import os, sys
from PIL import Image

SRC = sys.argv[1]          # 프로젝트 루트
OUT = os.path.join(SRC, 'pnu-weekly', 'dist', 'assets', 'sanjini')
os.makedirs(OUT, exist_ok=True)
CH = os.path.join(SRC, '산지니 케릭터')

def bbox_nonwhite(im, tol=246):
    """흰/투명 배경을 제외한 실제 그림 영역"""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    x0, y0, x1, y1 = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 20 and not (r > tol and g > tol and b > tol):
                if x < x0: x0 = x
                if y < y0: y0 = y
                if x > x1: x1 = x
                if y > y1: y1 = y
    return (x0, y0, x1 + 1, y1 + 1) if x1 > x0 else None

def square(im, pad=0.06, size=256):
    """투명 배경 정사각형으로 맞춘다"""
    im = im.convert('RGBA')
    b = bbox_nonwhite(im)
    if b: im = im.crop(b)
    # 흰 배경을 투명으로
    px = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, bl, a = px[x, y]
            if r > 244 and g > 244 and bl > 244:
                px[x, y] = (r, g, bl, 0)
    w, h = im.size
    side = int(max(w, h) * (1 + pad * 2))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2), im)
    return canvas.resize((size, size), Image.LANCZOS)

# ── 1) 표정 시트 6칸 (3열 x 2행)
sheet = Image.open(os.path.join(CH, '스크린샷 2026-09-11 150158.png'))
W, H = sheet.size
# 라벨(기본/기쁨/…)을 제외하고 얼굴만 포함되도록 행 높이를 잡는다
ROWS = [(30, 170), (188, 320)]
COLS = [(0, W // 3), (W // 3, 2 * W // 3), (2 * W // 3, W)]
NAMES = [['base', 'happy', 'love'], ['sad', 'angry', 'tense']]
for ri, (ry0, ry1) in enumerate(ROWS):
    for ci, (cx0, cx1) in enumerate(COLS):
        name = NAMES[ri][ci]
        if name == 'love':      # '반함' 은 이 보고서에 쓸 자리가 없다
            continue
        cell = sheet.crop((cx0, ry0, cx1, ry1))
        square(cell).save(os.path.join(OUT, name + '.png'))
        print('  표정', name)

# ── 2) 전신 3종
FULL = {
    '스크린샷 2026-09-11 145950.png': 'grad',      # 졸업모 + 가리키기
    '스크린샷 2026-09-11 145958.png': 'question',  # 물음표
    '스크린샷 2026-09-11 150003.png': 'idea',      # 전구
}
for fn, name in FULL.items():
    p = os.path.join(CH, fn)
    if not os.path.exists(p):
        print('  없음', fn); continue
    square(Image.open(p)).save(os.path.join(OUT, name + '.png'))
    print('  전신', name)

# ── 3) 부산대 상징(원형) — 헤더 로고용 흰 배경 제거
sym = os.path.join(SRC, '부산대 로고', 'symbol0401.jpg')
if os.path.exists(sym):
    im = Image.open(sym).convert('RGBA')
    px = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = px[x, y]
            if r > 243 and g > 243 and b > 243:
                px[x, y] = (r, g, b, 0)
    b = bbox_nonwhite(im)
    if b: im = im.crop(b)
    side = max(im.size)
    cv = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    cv.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2), im)
    cv.resize((256, 256), Image.LANCZOS).save(
        os.path.join(SRC, 'pnu-weekly', 'dist', 'assets', 'pnu-symbol.png'))
    print('  상징 pnu-symbol.png')

print('완료 →', OUT)
