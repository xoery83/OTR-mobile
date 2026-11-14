"""Arrange actual screenshots; no generated UI or altered in-app content."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont

out = Path(__file__).resolve().parent
root = out.parents[2]
previous = root / 'docs/ops/import-b2-slice1-20261113/screenshots'
current = out / 'screenshots'
images = [
    (previous / 'A-empty-trip.png', '1A  Capture in the original Trip'),
    (previous / 'B-files-and-photos.png', '1B  Files and Photos in one Composer'),
    (previous / 'C-mixed-text-files.png', '1C  Mixed text and retained attachments'),
    (current / '11-final-cold-waiting.png', '2A  Same Batch restored; waiting to analyze'),
    (current / '06-b1-files-partial-confirmation.png', '2B  Actual B1 Files: 4 / 5 verified'),
    (current / '12-final-cold-completed.png', '2C  Actual B1 Photos: 3 / 3 verified'),
]
font = '/System/Library/Fonts/Supplemental/Arial.ttf'
f = lambda size: ImageFont.truetype(font, size)
# Observed DeviceHub screenshot bounds; crop only the App sheet, retaining its header.
crops = [(990, top, 2438, 2325) for top in [1760, 1570, 1570, 890, 314, 314]]
width, gap, margin = 960, 24, 32
heights = [round((c[3] - c[1]) * width / (c[2] - c[0])) for c in crops]
first_row = max(heights[:3])
second_row = max(heights[3:])
canvas = Image.new('RGB', (margin * 2 + width * 3 + gap * 2, first_row + second_row + 300), '#eef1f3')
draw = ImageDraw.Draw(canvas)
draw.text((margin, 20), 'OTR B2 — Slice 1 / Slice 2', font=f(48), fill='#17212a')
draw.text((margin, 82), 'Actual full App screenshots — no generated interface', font=f(27), fill='#36434e')
manifest = []
for i, (path, label) in enumerate(images):
    x = margin + (i % 3) * (width + gap)
    y = 140 + (i // 3) * (first_row + 70)
    crop, height = crops[i], heights[i]
    draw.text((x, y), label, font=f(28), fill='#17212a')
    image = Image.open(path).convert('RGB')
    assert image.size == (3372, 2546)
    image = image.crop(crop).resize((width, height), Image.Resampling.LANCZOS)
    canvas.paste(image, (x, y + 44))
    manifest.append({'source': str(path.relative_to(root)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'crop': crop, 'resizeWidth': width})
draw.text((margin, canvas.height - 38), 'Cropped / resized only. Synthetic state display excluded. No new Analyze or Save.', font=f(25), fill='#36434e')
canvas.save(out / 'slice1-vs-slice2.png')
(out / 'comparison-sources.json').write_text(json.dumps(manifest, indent=2))
