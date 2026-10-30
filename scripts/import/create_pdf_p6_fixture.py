"""Reproduce the one frozen synthetic PDF input; never overwrite a changed original."""
import argparse
import hashlib
from io import BytesIO
from pathlib import Path
from reportlab.pdfgen import canvas

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=Path('output/pdf/universal-p6-activity-qa.pdf'))
args = parser.parse_args()
buffer = BytesIO()
pdf = canvas.Canvas(buffer, pagesize=(595.276, 841.89), invariant=1, pageCompression=1)
pdf.setTitle('OTR synthetic QA activity plan')
pdf.setAuthor('OTR Synthetic QA')
pdf.setFont('Helvetica-Bold', 18)
pdf.drawString(48, 780, 'Activity plan')
pdf.setFont('Helvetica', 13)
pdf.drawString(48, 730, 'Activity: Harbour PDF QA Workshop')
pdf.drawString(48, 700, 'Date: November 2, 2026')
pdf.setFont('Helvetica', 10)
pdf.drawString(48, 645, 'Synthetic QA travel material for import verification.')
pdf.showPage()
pdf.save()
content = buffer.getvalue()
expected = 'f58061aa535c7a5585c4c953890c5d387cf20656cca7129e36861beb82ee1758'
if hashlib.sha256(content).hexdigest() != expected:
    raise RuntimeError('PDF_FIXTURE_GENERATOR_DRIFT: review a new version; do not replace the frozen Source')
if args.output.exists():
    if args.output.read_bytes() != content:
        raise RuntimeError('PDF_FIXTURE_ORIGINAL_CHANGED')
else:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(content)
print(expected)
