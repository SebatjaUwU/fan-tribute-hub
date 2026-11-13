"""Fondo de la boleta TRIBUTIES de Last Summer 2016 (1080x1920).
Deja vacíos el número (arriba a la derecha) y el recuadro blanco del QR:
esos los pone Apps Script con Google Slides para cada comprador."""
import sys, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

A = '/home/claude/sebatjauwu/fan-tribute-hub/edc-preparty/ASSETS/'
FONT = sys.argv[1] if len(sys.argv) > 1 else 'bebas.ttf'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'fondo-tributies.png'
W, H = 1080, 1920
CREAM = (253, 244, 232)
DIM = (180, 170, 205)
GOLD = (255, 194, 75)

def f(size): return ImageFont.truetype(FONT, size)

def text_w(t, font, sp):
    return sum(font.getlength(c) for c in t) + sp * (len(t) - 1)

def draw_text(d, cx, y, t, font, fill, sp=0, anchor='c'):
    w = text_w(t, font, sp)
    x = cx - w / 2 if anchor == 'c' else (cx - w if anchor == 'r' else cx)
    for c in t:
        d.text((x, y), c, font=font, fill=fill)
        x += font.getlength(c) + sp
    return w

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def gradient_h(w, h, stops):
    g = Image.new('RGB', (w, h))
    px = g.load()
    for x in range(w):
        t = x / max(1, w - 1)
        for k in range(1, len(stops)):
            if t <= stops[k][0]:
                a, b = stops[k - 1], stops[k]
                c = lerp(a[1], b[1], (t - a[0]) / (b[0] - a[0]))
                break
        for y in range(h): px[x, y] = c
    return g

# --- fondo: degradado vertical morado-noche
img = Image.new('RGB', (W, H))
d = ImageDraw.Draw(img)
top, bot = (15, 12, 36), (40, 20, 62)
for y in range(H):
    d.line([(0, y), (W, y)], fill=lerp(top, bot, y / H))

# brillo suave detrás del título
glow = Image.new('L', (W, H), 0)
ImageDraw.Draw(glow).ellipse([140, 440, 940, 900], fill=45)
glow = glow.filter(ImageFilter.GaussianBlur(120))
img = Image.composite(Image.new('RGB', (W, H), (110, 40, 120)), img, glow)
d = ImageDraw.Draw(img)

# franjas de color arriba y abajo (naranja -> rosa -> azul)
STRIP = [(0, (255, 140, 40)), (.5, (255, 79, 163)), (1, (63, 140, 255))]
img.paste(gradient_h(W, 12, [(0, (120, 80, 255)), (.5, (255, 79, 163)), (1, (255, 150, 60))]), (0, 0))
img.paste(gradient_h(W, 12, STRIP), (0, H - 12))

# --- logo Last Summer 2016 (arriba izquierda)
ls = Image.open(A + 'ls-bogota-wordmark.webp').convert('RGBA')
ls.thumbnail((240, 240))
img.paste(ls, (70, 90), ls)

# --- "BOLETA DIGITAL" (arriba derecha). El N° lo pone Apps Script.
draw_text(d, 1010, 120, 'BOLETA DIGITAL', f(36), DIM, sp=5, anchor='r')

# --- logo Fan Tribute (centro)
ft = Image.open(A + 'qr-medellin/fantribute-logo.png').convert('RGBA')
ft = ft.resize((760, int(ft.size[1] * 760 / ft.size[0])), Image.LANCZOS)
img.paste(ft, ((W - ft.size[0]) // 2, 300), ft)

# --- TRIBUTIES con degradado dorado -> naranja -> rosa y brillo
tf = f(224)
tw = text_w('TRIBUTIES', tf, 6)
mask = Image.new('L', (W, 300), 0)
mx = (W - tw) / 2
x = mx
md = ImageDraw.Draw(mask)
for c in 'TRIBUTIES':
    md.text((x, 0), c, font=tf, fill=255)
    x += tf.getlength(c) + 6
TY = 575
title_grad = gradient_h(W, 300, [(0, (246, 232, 204)), (.2, (246, 232, 204)), (.4, (150, 195, 245)), (.56, (110, 110, 240)), (.72, (180, 90, 220)), (.86, (240, 90, 140)), (1, (255, 150, 60))])
halo = mask.filter(ImageFilter.GaussianBlur(22)).point(lambda v: int(v * .45))
img.paste(Image.new('RGB', (W, 300), (235, 215, 255)), (0, TY), halo)
img.paste(title_grad, (0, TY), mask)
d = ImageDraw.Draw(img)

# --- frase + corazón
sub = 'GRACIAS POR CREER HASTA EL FINAL'
sf = f(48)
sw = text_w(sub, sf, 4)
sx = (W - sw - 52) / 2
draw_text(d, sx, 800, sub, sf, CREAM, sp=4, anchor='l')
hx, hy, hs = sx + sw + 18, 812, 34
d.ellipse([hx, hy, hx + hs * .6, hy + hs * .6], fill=(255, 140, 40))
d.ellipse([hx + hs * .4, hy, hx + hs, hy + hs * .6], fill=(255, 140, 40))
d.polygon([(hx + 1, hy + hs * .38), (hx + hs - 1, hy + hs * .38), (hx + hs / 2, hy + hs * 1.0)], fill=(255, 140, 40))

# --- fila de datos
cols = [(230, 'FECHA', 'SÁB 19 DIC'), (540, 'ADMITE', '1 PERSONA'), (852, 'ETAPA', 'TRIBUTIES')]
for cx, lab, val in cols:
    draw_text(d, cx, 872, lab, f(28), DIM, sp=5)
    draw_text(d, cx, 906, val, f(52), CREAM, sp=2)

# --- línea punteada y muescas
LY = 1015
for x in range(90, 990, 26):
    d.line([(x, LY), (x + 13, LY)], fill=(120, 105, 160), width=3)
for cx in (0, W):
    d.ellipse([cx - 30, LY - 30, cx + 30, LY + 30], fill=(12, 8, 26))

# --- recuadro blanco del QR (vacío) con brillo
QX, QY, QS = 290, 1070, 500
qg = Image.new('L', (W, H), 0)
ImageDraw.Draw(qg).rounded_rectangle([QX, QY, QX + QS, QY + QS], 44, fill=150)
qg = qg.filter(ImageFilter.GaussianBlur(30))
img = Image.composite(Image.new('RGB', (W, H), (255, 236, 220)), img, qg)
d = ImageDraw.Draw(img)
d.rounded_rectangle([QX, QY, QX + QS, QY + QS], 44, fill=(255, 255, 255))

# --- textos de abajo (el nombre y el código los pone Apps Script entre el QR y estos)
draw_text(d, W / 2, 1612, 'PRESENTA ESTE CÓDIGO EN LA ENTRADA', f(44), CREAM, sp=4)
draw_text(d, W / 2, 1668, 'PERSONAL E INTRANSFERIBLE · UN SOLO USO', f(30), DIM, sp=5)
draw_text(d, W / 2, 1832, 'PARA LA GENTE QUE CREE EN ESTE FINAL', f(32), CREAM, sp=6)

img.save(OUT, optimize=True)
# posiciones (px sobre 1080x1920) que usa Apps Script
print(json.dumps({'qr': [QX + 40, QY + 40, QS - 80], 'num': [1010, 160], 'nombre_y': 1742}))
