from pathlib import Path

import cv2
from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf"
LANGUAGE_CODES = {
    "english": "en",
    "spanish": "es",
    "arabic": "ar",
    "chinese": "zh",
    "thai": "th",
    "vietnamese": "vi",
}

PAIRS = [
    ("english", "spanish"),
    ("arabic", "chinese"),
    ("thai", "vietnamese"),
]


def validate_card(path: Path, language: str):
    image = cv2.imread(str(path))
    value, _, _ = cv2.QRCodeDetector().detectAndDecode(image)
    expected = f"https://pocketfriend.io/?l={LANGUAGE_CODES[language]}"
    if value != expected:
        raise RuntimeError(f"QR validation failed for {path.name}: {value!r}")


def normalize_card(path: Path):
    """Strip browser screenshot metadata so ReportLab embeds a plain RGB bitmap."""
    with Image.open(path) as image:
        normalized = image.convert("RGB")
        normalized.save(path, format="PNG", optimize=True)


def save_pair(top_path: Path, bottom_path: Path, pdf_path: Path):
    page_w, page_h = 4 * 72, 6 * 72
    bleed_w, bleed_h = 3.75 * 72, 2.25 * 72
    x = (page_w - bleed_w) / 2
    placements = [(top_path, 234), (bottom_path, 36)]
    trim_inset = 0.125 * 72

    c = canvas.Canvas(str(pdf_path), pagesize=(page_w, page_h))
    c.setStrokeColorRGB(0.2, 0.2, 0.2)
    c.setLineWidth(0.35)
    for image_path, y in placements:
        with Image.open(image_path) as source:
            bitmap = source.convert("RGB")
            c.drawImage(ImageReader(bitmap), x, y, width=bleed_w, height=bleed_h)
        trim_x1, trim_y1 = x + trim_inset, y + trim_inset
        trim_x2, trim_y2 = x + bleed_w - trim_inset, y + bleed_h - trim_inset
        gap, mark = 2, 8
        for tx in (trim_x1, trim_x2):
            c.line(tx, y - gap - mark, tx, y - gap)
            c.line(tx, y + bleed_h + gap, tx, y + bleed_h + gap + mark)
        for ty in (trim_y1, trim_y2):
            c.line(1, ty, max(1, x - gap), ty)
            c.line(min(page_w - 1, x + bleed_w + gap), ty, page_w - 1, ty)
    c.setTitle(f"Pocketfriend multilingual cards - {top_path.stem} and {bottom_path.stem}")
    c.save()


def main():
    for index, (top, bottom) in enumerate(PAIRS, start=1):
        top_path = OUT / f"pocketfriend_card_{top}.png"
        bottom_path = OUT / f"pocketfriend_card_{bottom}.png"
        normalize_card(top_path)
        normalize_card(bottom_path)
        validate_card(top_path, top)
        validate_card(bottom_path, bottom)
        pdf_path = OUT / f"pocketfriend_multilingual_sheet_{index}_{top}_{bottom}_4x6.pdf"
        save_pair(top_path, bottom_path, pdf_path)
        print(pdf_path)


if __name__ == "__main__":
    main()
