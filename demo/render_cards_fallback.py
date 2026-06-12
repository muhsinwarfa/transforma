# Sandbox fallback for cards.mjs (no Chromium here). Reproduces the cardHtml CSS:
#   bg = radial-gradient(1300x760 at 50% 34%, accent@0x26 -> transparent 62%)
#        over linear-gradient(158deg, navy -> navyDeep)
#   S1: word 120px bold (-2.5px tracking) + accent dot, 96x4 rule, 40px light tagline
#   S9 (outro): 88px headline, rule, 64px wordmark, 24px contact
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
NAVY, NAVY_DEEP, ACCENT = (0x1F, 0x3A, 0x5F), (0x16, 0x2B, 0x47), (0x3E, 0x6F, 0xB0)
TAG_COL, CONTACT_COL = (0xDC, 0xE6, 0xF4), (0x8F, 0xA8, 0xCC)
F = "/home/claude/demo/.work/fonts/ttf/Selawik-%s.ttf"

def background():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    # linear-gradient(158deg): CSS 0deg = to top, clockwise; direction (sin, -cos)
    ang = np.deg2rad(158)
    dx, dy = np.sin(ang), -np.cos(ang)
    proj = (xx - W / 2) * dx + (yy - H / 2) * dy
    t = (proj - proj.min()) / (proj.max() - proj.min())
    img = np.zeros((H, W, 3))
    for c in range(3):
        img[..., c] = NAVY[c] + (NAVY_DEEP[c] - NAVY[c]) * t
    # radial overlay: ellipse 1300x760 at (50%, 34%), accent alpha 0x26 -> 0 at 62%
    cx, cy, rx, ry = W * 0.5, H * 0.34, 650.0, 380.0
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    a = np.clip(1 - d / 0.62, 0, 1) * (0x26 / 255.0)
    for c in range(3):
        img[..., c] = img[..., c] * (1 - a) + ACCENT[c] * a
    return Image.fromarray(np.round(img).astype(np.uint8))

def tracked_width(d, text, font, tr):
    return sum(d.textlength(ch, font=font) for ch in text) + tr * (len(text) - 1)

def draw_tracked(d, cx, cy, text, font, fill, tr=0.0, accent_last=False):
    w = tracked_width(d, text, font, tr)
    asc, desc = font.getmetrics()
    x, y = cx - w / 2, cy - (asc + desc) / 2
    for i, ch in enumerate(text):
        col = ACCENT if (accent_last and i == len(text) - 1) else fill
        d.text((x, y), ch, font=font, fill=col)
        x += d.textlength(ch, font=font) + tr

def rule(d, cy):
    d.rounded_rectangle([W / 2 - 48, cy - 2, W / 2 + 48, cy + 2], radius=2, fill=ACCENT)

def s1():
    img = background(); d = ImageDraw.Draw(img)
    word_f = ImageFont.truetype(F % "Bold", 120)
    tag_f = ImageFont.truetype(F % "Light", 40)
    blocks = 120 + (36 + 4 + 36) + 54  # word + rule(+margins) + tag line
    top = (H - blocks) / 2
    draw_tracked(d, W / 2, top + 60, "Transforma.", word_f, (255, 255, 255), tr=-2.5, accent_last=True)
    rule(d, top + 120 + 38)
    draw_tracked(d, W / 2, top + 120 + 76 + 27, "360\u00B0 feedback. The whole picture.", tag_f, TAG_COL)
    img.save("/home/claude/demo/.work/cards/s1.png")

def s9():
    img = background(); d = ImageDraw.Draw(img)
    head_f = ImageFont.truetype(F % "Bold", 88)
    mark_f = ImageFont.truetype(F % "Bold", 64)
    contact_f = ImageFont.truetype(F % "Regular", 24)
    blocks = 88 + (36 + 4 + 36) + 64 + 52 + 28
    top = (H - blocks) / 2
    y = top
    draw_tracked(d, W / 2, y + 44, "Every voice. One clear picture.", head_f, (255, 255, 255), tr=-1.5)
    y += 88
    rule(d, y + 38); y += 76
    draw_tracked(d, W / 2, y + 32, "Transforma.", mark_f, (255, 255, 255), tr=-1.0, accent_last=True)
    y += 64 + 52
    draw_tracked(d, W / 2, y + 14, "hello@transforma.example", contact_f, CONTACT_COL, tr=24 * 0.05)
    img.save("/home/claude/demo/.work/cards/s9.png")

s1(); s9()
print("cards rendered")
